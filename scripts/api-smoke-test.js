const path = require('path');

const CASES = [
    ['market-data', { type: 'index' }],
    ['market-data', { type: 'capital' }],
    ['market-data', { type: 'sector' }],
    ['market-data', { type: 'multiday-flow' }],
    ['stock', { codes: '600519,300750' }],
    ['stock-search', { q: '贵州茅台' }],
    ['hot-stocks', {}],
    ['dragon-tiger', {}],
    ['lockup', {}],
    ['global-news', {}],
    ['news', {}],
];

function call(handler, query) {
    return new Promise((resolve) => {
        const chunks = [];
        const req = { query };
        const res = {
            statusCode: 200,
            headers: {},
            setHeader(key, value) {
                this.headers[key] = value;
            },
            end(chunk) {
                if (chunk) chunks.push(String(chunk));
                resolve({ status: this.statusCode, body: chunks.join('') });
            },
        };
        Promise.resolve(handler(req, res)).catch((error) => {
            resolve({
                status: 500,
                body: JSON.stringify({ success: false, message: error.message }),
            });
        });
    });
}

function summarize(data) {
    if (Array.isArray(data)) return `${data.length} items`;
    if (data && data.stocks) return `${data.stocks.length} stocks`;
    if (data && data.items) return `${data.items.length} items`;
    if (data && data.data) return `${data.data.length} items`;
    if (data && typeof data === 'object') return Object.keys(data).join(',');
    return String(data);
}

(async () => {
    let failed = false;
    for (const [name, query] of CASES) {
        const handlerPath = path.resolve(__dirname, '..', 'api', `${name}.js`);
        delete require.cache[handlerPath];
        const handler = require(handlerPath);
        const result = await call(handler, query);
        const json = JSON.parse(result.body);
        const optionalEmpty = name === 'market-data' && ['capital', 'sector', 'multiday-flow'].includes(query.type);
        const ok = result.status === 200 && json.success && (json.data || optionalEmpty);
        console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(query)} -> ${result.status} ${summarize(json.data || json.message)}`);
        if (!ok) failed = true;
    }
    if (failed) process.exit(1);
})();
