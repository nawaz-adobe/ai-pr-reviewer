/**
 * Parses a Git diff string into structured hunks for each file.
 * @param {string} diff - The Git diff string.
 * @returns {Array} Array of parsed hunks.
 */
function parseDiff(diff) {
    const lines = diff.split('\n');
    const hunks = [];
    let currentHunk = [];
    let currentFile = '';

    for (const line of lines) {
        if (line.startsWith('diff --git')) {
            if (currentHunk.length > 0) {
                hunks.push({ changes: currentHunk, filename: currentFile });
            }

            currentHunk = []; 
            currentFile = line.slice(11).split(' ')[0].slice(2);
            continue;
        }

        if (line.startsWith('index') 
        || line.startsWith('---')
        || line.startsWith('+++')) {
            continue;
        }

        currentHunk.push(line);
    }

    if (currentHunk) {
        hunks.push({ changes: currentHunk, filename: currentFile });
    }

    return hunks;
}

module.exports = parseDiff;
