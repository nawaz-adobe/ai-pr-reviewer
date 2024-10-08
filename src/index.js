const core = require('@actions/core');
const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const axios = require('axios');

async function run() {
  try {
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

    // Post comments on specific lines
    const diffLines = diffData.split('\n');
    const fileComments = {};
    let currentFile = null;

    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i];
      console.log(line);
      if (line.startsWith("+++ b/")) {
        currentFile = line.substring(6);
        fileComments[currentFile] = [];
      }
      if (line.startsWith("+") && !line.startsWith("+++")) {
        const lineCommentResponse = await axios.post(
          "https://pr-review-bot.openai.azure.com/openai/deployments/pr-review-bot/chat/completions?api-version=2024-02-01",
          {
            messages: [
              { role: "system", content: "You are an AI assistant that reviews code changes." },
              { role: "user", content: `Review the following code line:\n\n${line}\n\nComment:` }
            ],
            max_tokens: 50,
            temperature: 0.7,
          },
          {
            headers: { "Content-Type": "application/json", "Api-Key": openaiApiKey }
          }
        );

        const lineComment = lineCommentResponse.data.choices[0].message.content;

        // Create a comment object
        const comment = {
          body: lineComment,
          commit_id: pull_request.head.sha,
          path: currentFile,
          position: i + 1, // Adjust the position if needed
        };

        // Get the diff hunk for the comment
        const hunkSize = 3; // Number of lines to include before and after the comment line
        const hunkStart = Math.max(0, i - hunkSize); // Start index
        const hunkEnd = Math.min(diffLines.length, i + hunkSize + 1); // End index

        // Create the diff hunk string
        const diffHunk = diffLines.slice(hunkStart, hunkEnd).join('\n');

        // Include diff_hunk in the comment object
        comment.diff_hunk = diffHunk;
        // Add the comment to the array for the current file
        fileComments[currentFile].push(comment);
      }
    }

    // Create review comments on the PR
    for (const file in fileComments) {
      for (const comment of fileComments[file]) {
        if (!comment.position || !comment.diff_hunk) {
          console.error(`Invalid comment data: ${JSON.stringify(comment)}`);
          continue;  // Skip this comment
        }

        await octokit.pulls.createReviewComment({
          owner,
          repo,
          pull_number,
          body: comment.body,
          position: comment.position,  // This needs to be a valid line number
          commit_id: comment.commit_id,
          path: comment.path,
          side: "RIGHT",
          diff_hunk: comment.diff_hunk  // This must be provided
        });
      }
    }

  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();
