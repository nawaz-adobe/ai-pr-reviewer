const core = require('@actions/core');
const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const axios = require('axios');

function parseDiff(diff) {
  const lines = diff.split('\n');
  const hunks = [];
  let currentHunk = null;
  let currentFile = '';

  for (const line of lines) {
      // Check for the start of a new file section
      if (line.startsWith('diff --git')) {
          const match = line.match(/a\/(.+) b\/(.+)/);
          if (match) {
              currentFile = match[1]; // Get the filename
          }
      }

      if (line.startsWith('@@')) {
          // If there's an existing hunk, push it to the array
          if (currentHunk) {
              hunks.push({ ...currentHunk, filename: currentFile });
          }

          // Extract line numbers from the hunk header
          const match = line.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/);
          if (match) {
              const startLineOld = parseInt(match[1], 10);
              const startLineNew = parseInt(match[2], 10);
              
              currentHunk = { startLineOld, startLineNew, changes: [] };
          }
      } else if (currentHunk) {
          // Collect changes
          if (line.startsWith('+')) {
              currentHunk.changes.push({ type: 'addition', line: line.slice(1) });
          } else if (line.startsWith('-')) {
              currentHunk.changes.push({ type: 'deletion', line: line.slice(1) });
          }
      }
  }

  // Push the last hunk if it exists
  if (currentHunk) {
      hunks.push({ ...currentHunk, filename: currentFile });
  }

  return hunks;
}

async function getReviewFromOpenAI(hunk) {
    const prompt = `Please review the following code changes:\n${hunk.changes.map(change => `${change.type}: ${change.line}`).join('\n')}`;

    const response = await axios.post(
      "https://pr-review-bot.openai.azure.com/openai/deployments/pr-review-bot/chat/completions?api-version=2024-02-01",
      {
        messages: [
          { role: "system", content: "You are an AI assistant that reviews code changes." },
          { role: "user", content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.7,
      },
      {
        headers: { "Content-Type": "application/json", "Api-Key": openaiApiKey }
      }
    );
    
    return response.data.choices[0].message.content;
}

async function postCommentOnGitHub(owner, repo, pull_number, filename, line, body) {
  try {
      await octokit.pulls.createReviewComment({
          owner,
          repo,
          pull_number,
          body,
          commit_id: pull_request.head.sha,
          path: filename, // Specify the filename
          line: line, // Specify the line number in the hunk
      });
      console.log(`Comment posted on pull request #${pull_number} in ${filename} at line ${line}: ${body}`);
  } catch (error) {
      console.error(`Failed to post comment on pull request #${pull_number}:`, error);
  }
}

async function run() {
  try {
    // Fetch the diff of the pull request
    const { data: diffData } = await octokit.pulls.get({
      owner,
      repo,
      pull_number,
      mediaType: { format: 'diff' },
    });

    // Call OpenAI API to summarize PR changes
    const response = await axios.post(
      "https://pr-review-bot.openai.azure.com/openai/deployments/pr-review-bot/chat/completions?api-version=2024-02-01",
      {
        messages: [
          { role: "system", content: "You are an AI assistant that summarizes pull request changes." },
          { role: "user", content: `Summarize the following pull request changes:\n\n${diffData}` }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      },
      {
        headers: { "Content-Type": "application/json", "Api-Key": openaiApiKey }
      }
    );

    const summary = response.data.choices[0].message.content;

    // Post a summary comment to the PR
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_request.number,
      body: `### PR Review Summary:\n${summary}`,
    });

    // Parse the diff data to extract hunks
    const hunks = parseDiff(diffData);

    // Review each hunk and collect comments
    for (const hunk of hunks) {
        const review = await getReviewFromOpenAI(hunk);
        
        // Post the comment to GitHub (you'll need to implement this function)
        await postCommentOnGitHub(owner, repo, pull_number, hunk.filename, hunk.startLineNew, review);
    }

    // Post comments on specific lines
    // const diffLines = diffData.split('\n');
    // const fileComments = {};
    // let currentFile = null;

    // for (let i = 0; i < diffLines.length; i++) {
    //   const line = diffLines[i];
    //   if (line.startsWith("+++ b/")) {
    //     currentFile = line.substring(6);
    //     fileComments[currentFile] = [];
    //   }
    //   if (line.startsWith("+") && !line.startsWith("+++")) {
    //     const lineCommentResponse = await axios.post(
    //       "https://pr-review-bot.openai.azure.com/openai/deployments/pr-review-bot/chat/completions?api-version=2024-02-01",
    //       {
    //         messages: [
    //           { role: "system", content: "You are an AI assistant that reviews code changes." },
    //           { role: "user", content: `Review the following code line:\n\n${line}\n\nComment:` }
    //         ],
    //         max_tokens: 50,
    //         temperature: 0.7,
    //       },
    //       {
    //         headers: { "Content-Type": "application/json", "Api-Key": openaiApiKey }
    //       }
    //     );

    //     const lineComment = lineCommentResponse.data.choices[0].message.content;
    //     console.log('Response from OpenAI API:');
    //     console.log(lineCommentResponse.data.choices[0]);

        // Create a comment object
        // const comment = {
        //   body: lineComment,
        //   commit_id: pull_request.head.sha,
        //   path: currentFile,
        //   position: i + 1, // Adjust the position if needed
        // };

        // Get the diff hunk for the comment
        // const hunkSize = 3; // Number of lines to include before and after the comment line
        // const hunkStart = Math.max(0, i - hunkSize); // Start index
        // const hunkEnd = Math.min(diffLines.length, i + hunkSize + 1); // End index

        // Create the diff hunk string
        // const diffHunk = diffLines.slice(hunkStart, hunkEnd).join('\n');

        // Include diff_hunk in the comment object
        // comment.diff_hunk = diffHunk;
        // Add the comment to the array for the current file
    //     fileComments[currentFile].push(comment);
    //   }
    // }

    // Create review comments on the PR
    // for (const file in fileComments) {
    //   for (const comment of fileComments[file]) {
    //     if (!comment.position || !comment.diff_hunk) {
    //       console.error(`Invalid comment data: ${JSON.stringify(comment)}`);
    //       continue;  // Skip this comment
    //     }

    //     await octokit.pulls.createReviewComment({
    //       owner,
    //       repo,
    //       pull_number,
    //       body: comment.body,
    //       commit_id: comment.commit_id,
    //       path: comment.path,
    //       side: "RIGHT"
    //     });
    //   }
    // }

  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

// Load environment variables
const openaiApiKey = core.getInput('openai_api_key', { required: true });
const githubAppId = core.getInput('github_app_id', { required: true });
const githubPrivateKey = core.getInput('github_private_key', { required: true });
const githubInstallationId = core.getInput('github_installation_id', { required: true });

// Get the PR URL from the GitHub context and extract owner, repo, and pull_number
const context = require('@actions/github').context;
const { owner, repo } = context.repo;
const pull_number = context.payload.pull_request.number;

// Initialize Octokit
const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: githubAppId,
    privateKey: githubPrivateKey.replace(/\\n/g, '\n'),
    installationId: githubInstallationId,
  },
});

// Fetch pull request data
const { data: pull_request } = await octokit.pulls.get({ owner, repo, pull_number });
const prTitle = pull_request.title;

run();
