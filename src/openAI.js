require('dotenv').config();

const axios = require('axios');

async function getReviewFromOpenAI(hunk) {
    const prompt = `Below data is in JSON format and was constructed from Git diff data consisting of GNU hunks for a particular file.
                    The changes array contains objects with:
                    - content: the line content
                    - type: 'addition', 'deletion', or 'context'
                    - lineNumber: the actual line number in the new file
                    
                    ${JSON.stringify(hunk)} \n
                    
                    Review the code changes and provide review comments. For each comment:
                    - Only comment on added or modified lines (type: 'addition')
                    - Use the exact lineNumber provided in the changes array
                    - If you have no concerns, return an empty comments array
                    
                    Output Format: Return ONLY a JSON object (no markdown, no code blocks) with this structure:
                    {
                      "comments": [
                        {
                          "body": "Comment body here",
                          "line": <exact_line_number>
                        }
                      ] 
                    }`;

    const response = await axios.post(
        process.env.OPENAI_ENDPOINT,
        {
            messages: [
                { 
                    role: "system", 
                    content: "You are an AI assistant that reviews code changes. Always respond with pure JSON only, no markdown formatting." 
                },
                { role: "user", content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.1,
        },
        {
            headers: { "Content-Type": "application/json", "Api-Key": process.env.OPENAI_API_KEY }
        }
    );

    const content = response.data.choices[0].message.content;
    
    // Clean up any markdown formatting that might be present
    const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
    
    try {
        // Validate that it's proper JSON
        return JSON.parse(cleanedContent);
    } catch (error) {
        console.error('Failed to parse OpenAI response:', cleanedContent);
        throw new Error('Invalid JSON response from OpenAI');
    }
}

async function getSummaryFromOpenAI(diffData) {
    console.log('Requesting incremental summary from OpenAI...');
    const prompt = `Please review the following incremental changes in this pull request and provide a concise summary:
                    - Focus on what has changed since the last review
                    - Highlight any new additions or modifications
                    - Note any resolved or new concerns
                    - Keep the summary professional and constructive

                    Changes:
                    ${diffData}`;

    const response = await axios.post(
        process.env.OPENAI_ENDPOINT,
        {
            messages: [
                { 
                    role: "system", 
                    content: "You are an AI assistant that summarizes incremental code changes in pull requests. Focus on what's new or modified since the last review." 
                },
                { role: "user", content: prompt }
            ],
            max_tokens: 1500,
            temperature: 0.1,
        },
        {
            headers: { "Content-Type": "application/json", "Api-Key": process.env.OPENAI_API_KEY }
        }
    );

    const summary = response.data.choices[0].message.content;
    console.log('Received incremental summary from OpenAI');
    return summary;
}

module.exports = { getReviewFromOpenAI, getSummaryFromOpenAI };
