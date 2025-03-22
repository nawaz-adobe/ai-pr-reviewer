require('dotenv').config();

const core = require('@actions/core');
const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const fs = require('fs');

const parseDiff = require('./parseDiff');
const { getReviewFromOpenAI, getSummaryFromOpenAI } = require('./openAI');

async function postCommentOnGitHub(owner, repo, pull_number, filename, line, body, commit_id) {
  console.log('Posting comment with params:', {
    owner,
    repo,
    pull_number,
    filename,
    line,
    commit_id,
    bodyLength: body?.length
  });

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
    const response = await octokit.pulls.createReviewComment(commentPayload);
    console.log(`Successfully posted comment. Response status: ${response.status}`);
    return response;
  } catch (error) {
    console.error('GitHub API Error:', {
      status: error.status,
      message: error.message,
      response: error.response?.data,
      payload: commentPayload
    });
    throw error;
  }
}

async function run() {
  try {
    const { data: pull_request } = await octokit.pulls.get({ owner, repo, pull_number });
    const prTitle = pull_request.title;
    console.log('PR Title:', prTitle);

    // Get all commits in the PR
    const { data: commits } = await octokit.pulls.listCommits({
      owner,
      repo,
      pull_number,
    });

    // Get the last reviewed commit from PR comments
    const { data: comments } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: pull_number,
    });

    const lastReviewedCommit = findLastReviewedCommit(comments);
    const newCommits = commits.filter(commit => 
      !lastReviewedCommit || new Date(commit.commit.committer.date) > new Date(lastReviewedCommit.date)
    );

    if (newCommits.length === 0) {
      console.log('No new commits to review');
      return;
    }

    // Get diff since last review
    const diffResponse = await octokit.repos.compareCommits({
      owner,
      repo,
      base: lastReviewedCommit ? lastReviewedCommit.sha : commits[0].parents[0].sha,
      head: pull_request.head.sha,
    });

    const diffData = diffResponse.data.files
      .map(file => `diff --git a/${file.filename} b/${file.filename}\n${file.patch || ''}`)
      .join('\n');

    // Generate and post updated summary
    try {
      console.log('Generating incremental PR summary...');
      const summary = await getSummaryFromOpenAI(diffData);
      
      const summaryHeader = `### AI Review Summary (Updated for commit ${pull_request.head.sha.substring(0, 7)})
Last reviewed commit: ${lastReviewedCommit ? lastReviewedCommit.sha.substring(0, 7) : 'Initial Review'}

${summary}`;

      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: pull_number,
        body: summaryHeader,
      });
      console.log('Successfully posted updated PR summary');
    } catch (summaryError) {
      console.error('Failed to post summary:', summaryError);
    }

    // Process new changes
    const hunks = parseDiff(diffData);

    try {
      for (const hunk of hunks) {
        console.log('Processing hunk:', {
          filename: hunk.filename,
          changesCount: hunk.changes?.length,
          hunkHeader: hunk.hunkHeader
        });

        if (!hunk || !hunk.filename || !hunk.changes) {
          throw new Error('Invalid hunk data. Ensure all necessary fields are provided.');
        }
        
        const reviewResponse = await getReviewFromOpenAI(hunk);
        console.log('Review response:', reviewResponse);
        
        if (!reviewResponse.comments || !Array.isArray(reviewResponse.comments)) {
          console.warn('No valid comments in review response:', reviewResponse);
          continue;
        }
        
        for(const comment of reviewResponse.comments) {
          console.log('Attempting to post comment:', {
            filename: hunk.filename,
            line: comment.line,
            body: comment.body
          });
          
          if (!comment.line || !comment.body) {
            console.warn('Invalid comment data:', comment);
            continue;
          }
          
          try {
            await postCommentOnGitHub(
              owner,
              repo,
              pull_number,
              hunk.filename,
              comment.line,
              comment.body,
              pull_request.head.sha,
            );
            console.log('Successfully posted comment');
          } catch (commentError) {
            console.error('Failed to post individual comment:', {
              error: commentError.message,
              response: commentError.response?.data,
              comment
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error in review process:`, {
        message: err.message,
        stack: err.stack,
        response: err.response?.data
      });
      throw err;
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

function findLastReviewedCommit(comments) {
  // Look for our AI review comments to find the last reviewed commit
  const reviewComments = comments.filter(comment => 
    comment.body.includes('AI Review Summary') && 
    comment.body.includes('Updated for commit')
  );

  if (reviewComments.length === 0) return null;

  const lastReview = reviewComments[reviewComments.length - 1];
  const match = lastReview.body.match(/Updated for commit ([a-f0-9]{7})/);
  
  if (!match) return null;

  return {
    sha: match[1],
    date: lastReview.created_at
  };
}

// Get inputs from action.yml
const openaiApiKey = core.getInput('openai-api-key');
const openaiEndpoint = core.getInput('openai-endpoint');
const githubAppId = core.getInput('github-app-id');
const githubInstallationId = core.getInput('github-installation-id');
const pull_number = parseInt(core.getInput('pull-request-number'), 10);

// Get repository information from GitHub context
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

// Initialize Octokit with GitHub App authentication
const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: githubAppId,
    privateKey: core.getInput('github-token'),
    installationId: githubInstallationId,
  },
});

run();
