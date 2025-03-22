require('dotenv').config();

const axios = require('axios');

async function getReviewFromOpenAI(hunk) {
    const prompt = `Below data is in JSON format and was constructed from Git diff data consisting of GNU hunks for a particular file.
                    Code changes are present within the changes array, and the fileName property contains the name of the file. \n
                    ${JSON.stringify(hunk)} \n
                    
                    Review the code changes and provide the review comments where every comment should have a body along with the line number where the comment needs to be placed.
                    Please refer to hunk headers within the changes array to to figure out the line numbers accordingly.
                    If you are not sure or the code changes look good, return empty comments array. \n

                    Output Format in JSON (don't output anything else):
                    {
                      "comments": [
                        {
                          "body": "Comment body here",
                          "line": 1
                        }
                      ] 
                    }`;

    const response = await axios.post(
        process.env.OPENAI_ENDPOINT,
        {
            messages: [
                { role: "system", content: "You are an AI assistant that reviews code changes." },
                { role: "user", content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.1,
        },
        {
            headers: { "Content-Type": "application/json", "Api-Key": process.env.OPENAI_API_KEY }
        }
    );

    return response.data.choices[0].message.content;
}

async function getSummaryFromOpenAI(diffData) {
    const response = await axios.post(
        process.env.OPENAI_ENDPOINT,
        {
          messages: [
            { role: "system", content: "You are an AI assistant that summarizes pull request changes." },
            { role: "user", content: `Summarize the following pull request changes:\n\n${diffData}` }
          ],
          max_tokens: 1500,
          temperature: 0.1,
        },
        {
          headers: { "Content-Type": "application/json", "Api-Key": process.env.OPENAI_API_KEY }
        }
    );

    return response.data.choices[0].message.content;
}

module.exports = { getReviewFromOpenAI, getSummaryFromOpenAI };
