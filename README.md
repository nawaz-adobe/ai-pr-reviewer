# AI Code Review Action

An AI-powered code review GitHub Action that provides automated, intelligent reviews for your pull requests. This action uses OpenAI to analyze code changes and provide meaningful feedback directly in your pull requests.

## Features

- 🤖 Automated code review comments on pull requests
- 📝 Detailed line-by-line feedback
- 🔄 Incremental reviews that only analyze new changes
- 📊 Summary of changes for each review
- 🌐 Support for multiple programming languages
- 🎯 Focused feedback on actual code changes
- ⚡ Quick and efficient reviews

## Setup

### 1. Create a GitHub App

1. Go to your GitHub Settings > Developer settings > GitHub Apps > New GitHub App
2. Fill in the following:
   - GitHub App name: (e.g., "AI Code Review")
   - Homepage URL: (your repository URL)
   - Webhook: Disable
   - Permissions:
     - Pull requests: Read & Write
     - Contents: Read
3. Create the app and note down the App ID
4. Generate a private key and save it
5. Install the app in your repositories

### 2. Configure Repository Secrets

Add the following secrets to your repository (Settings > Secrets and variables > Actions):

- `OPENAI_API_KEY`: Your OpenAI API key
- `OPENAI_ENDPOINT`: OpenAI API endpoint (usually `https://api.openai.com/v1/chat/completions`)
- `GITHUB_APP_ID`: Your GitHub App ID
- `GITHUB_INSTALLATION_ID`: The installation ID of your GitHub App
- `GITHUB_PRIVATE_KEY`: The private key generated for your GitHub App

## Usage

### Basic Workflow

Create a new workflow file (e.g., `.github/workflows/code-review.yml`):
