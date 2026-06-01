const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const ids = [...app.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]);
const missing = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`) && !html.includes(`id='${id}'`));
const forbiddenPatterns = [
    /<script[^>]+src=["']data\.js["']/i,
    /SAMPLE_DATA/,
    /DATA_UPDATE_TIME/,
    /style=/i,
];
const forbidden = forbiddenPatterns.filter((pattern) => pattern.test(html + app)).map(String);

if (missing.length || forbidden.length) {
    console.error(JSON.stringify({ missingIds: missing, forbidden }, null, 2));
    process.exit(1);
}

console.log(`PASS dom-contract ${new Set(ids).size} referenced ids`);
