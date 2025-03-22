require('dotenv').config();

const core = require('@actions/core');
const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const fs = require('fs');

const parseDiff = require('./parseDiff');
const { getReviewFromOpenAI, getSummaryFromOpenAI } = require('./openAI');

async function postCommentOnGitHub(owner, repo, pull_number, filename, line, body, commit_id) {
  if (!owner || !repo || !pull_number || !filename || !line || !body || !commit_id) {
    throw new Error('Missing required parameters for posting a comment.');
  }

  const commentPayload = {
    owner,
    repo,
    pull_number,
    body,
    commit_id,
    path: filename,
    line,
    side: 'RIGHT',
  };

  try {
    await octokit.pulls.createReviewComment(commentPayload);
    console.log(`Comment posted on pull request #${pull_number} in ${filename} at line ${line}: ${body}`);
  } catch (error) {
    console.error(`Failed to post comment on pull request #${pull_number}:`, error.response?.data || error.message);
  }
}

async function run() {
  try {
    const { data: pull_request } = await octokit.pulls.get({ owner, repo, pull_number });
    const prTitle = pull_request.title;
    console.log('PR Title:', prTitle);

    const { data: diffData } = await octokit.pulls.get({
      owner,
      repo,
      pull_number,
      mediaType: { format: 'diff' },
    });

    // const summary = await getSummaryFromOpenAI(diffData, openaiApiKey);
    // await octokit.issues.createComment({
    //   owner,
    //   repo,
    //   issue_number: pull_request.number,
    //   body: `### PR Review Summary:\n${summary}`,
    // });

    const hunks = parseDiff(diffData);

    try {
      for (const hunk of hunks) {
        if (!hunk || !hunk.filename || !hunk.changes) {
          throw new Error('Invalid hunk data. Ensure all necessary fields are provided.');
        }
        
        const review = await getReviewFromOpenAI(hunk, openaiApiKey);
      
        const reviewObj = JSON.parse(review);
        for(const comment of reviewObj.comments) {
          console.log('Comment:', comment);
          await postCommentOnGitHub(
            owner,
            repo,
            pull_number,
            hunk.filename,
            comment.line,
            comment.body,
            pull_request.head.sha,
          );
        }
      }
    } catch (err) {
      console.error(`Error posting review comment:', ${err.message}`);
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

const openaiApiKey = process.env.OPENAI_API_KEY;
const githubAppId = process.env.GITHUB_APP_ID;
const githubPrivateKey = fs.readFileSync('./private-key.pem', 'utf8');
const githubInstallationId = process.env.GITHUB_INSTALLATION_ID;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const pull_number = parseInt(process.env.GITHUB_PULL_REQUEST_NUMBER, 10);

// Load environment variables
// const openaiApiKey = core.getInput('openai_api_key', { required: true });
// const githubAppId = core.getInput('github_app_id', { required: true });
// const githubPrivateKey = core.getInput('github_private_key', { required: true });
// const githubInstallationId = core.getInput('github_installation_id', { required: true });

// Get the PR URL from the GitHub context and extract owner, repo, and pull_number
// const context = require('@actions/github').context;
// const { owner, repo } = context.repo;
// const pull_number = context.payload.pull_request.number;

// Initialize Octokit
const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: githubAppId,
    privateKey: githubPrivateKey.replace(/\\n/g, '\n'),
    installationId: githubInstallationId,
  },
});

run();
