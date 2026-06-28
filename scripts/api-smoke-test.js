const path = require('path');

const CASES = [
    ['market-data', { type: 'index' }],
    ['market-data', { type: 'capital' }],
    ['market-data', { type: 'sector' }],
    ['market-data', { type: 'multiday-flow' }],
    ['stock', { codes: '600519,300750' }],
    ['stock-search', { q: '贵州茅台' }],
    ['dragon-tiger', {}],
    ['limit-up', { type: 'zt' }],
    ['limit-up', { type: 'zb' }],
    ['limit-up', { type: 'dt' }],
    ['limit-up', { type: 'yzt' }],
    ['limit-up', { type: 'summary' }],
    ['global-news', {}],
    ['news', {}],
    ['fund-flow-120d', { codes: '600519,300750', days: 60 }],
    ['hot-rank', { source: 'ths', period: 'hour' }],
    ['hot-rank', { source: 'em', limit: 10 }],
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

function hasNonEmptyPayload(name, query, data) {
    if (name === 'market-data' && query.type === 'capital') {
        // 资金 4 档 (mainFund.value + mainFund.breakdown) + 北向 2 通道 (northHgt + northSgt)
        var b = data && data.mainFund && data.mainFund.breakdown;
        return Boolean(data && data.mainFund && b
            && b.large && b.medium && b.small
            && data.northHgt && data.northSgt
            && !/暂无/.test(data.mainFund.value)
            && !/暂无/.test(data.northHgt.value)
            && !/暂无/.test(data.northSgt.value));
    }
    if (name === 'market-data' && query.type === 'sector') {
        return Boolean(data && Array.isArray(data.inflow) && Array.isArray(data.outflow) && data.inflow.length && data.outflow.length);
    }
    if (name === 'market-data' && query.type === 'multiday-flow') {
        return Boolean(data && Array.isArray(data.inflowSectors) && Array.isArray(data.outflowSectors) && data.inflowSectors.length && data.outflowSectors.length);
    }
    if (name === 'news') {
        return Boolean(data && Array.isArray(data.data) && data.data.length && data.data[0].data && data.data[0].data.content);
    }
    if (name === 'global-news') {
        return Boolean(data && Array.isArray(data.data) && data.data.length && (data.data[0].title || data.data[0].summary));
    }
    if (name === 'limit-up' && query.type === 'summary') {
        return Boolean(data && typeof data.ztCount === 'number' && typeof data.breakRate === 'number');
    }
    if (name === 'limit-up') {
        return Boolean(data && Array.isArray(data.items) && data.items.length
            && data.items[0].code && data.items[0].name);
    }
    if (name === 'fund-flow-120d') {
        var first = data && data.items && data.items[0];
        var today = first && first.summary && first.summary.today;
        return Boolean(first
            && typeof first.summary.main_5d === 'number'
            && Array.isArray(first.recent) && first.recent.length > 0
            && first.name
            // 持仓股 sub-row 用: today 4 档 (主力/大单/中单/小单) 必须有
            && today
            && typeof today.main === 'number'
            && typeof today.large === 'number'
            && typeof today.medium === 'number'
            && typeof today.small === 'number');
    }
    if (name === 'hot-rank') {
        return Boolean(data && Array.isArray(data.items) && data.items.length
            && data.items[0].code && data.items[0].name);
    }
    return Boolean(data);
}

(async () => {
    let failed = false;
    const payloads = {};
    for (const [name, query] of CASES) {
        const handlerPath = path.resolve(__dirname, '..', 'api', `${name}.js`);
        delete require.cache[handlerPath];
        const handler = require(handlerPath);
        const result = await call(handler, query);
        const json = JSON.parse(result.body);
        const ok = result.status === 200 && json.success && hasNonEmptyPayload(name, query, json.data);
        console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(query)} -> ${result.status} ${summarize(json.data || json.message)}`);
        if (!ok) failed = true;
        payloads[name] = json.data;
    }

    const jin10Texts = new Set(((payloads.news && payloads.news.data) || []).map((item) => item.data && item.data.content).filter(Boolean));
    const eastmoneyTexts = ((payloads['global-news'] && payloads['global-news'].data) || []).map((item) => item.title || item.summary).filter(Boolean);
    const overlapping = eastmoneyTexts.filter((text) => jin10Texts.has(text)).length;
    const distinctNews = jin10Texts.size > 0 && eastmoneyTexts.length > 0 && overlapping < Math.min(jin10Texts.size, eastmoneyTexts.length);
    console.log(`${distinctNews ? 'PASS' : 'FAIL'} news-source-distinct -> overlap ${overlapping}`);
    if (!distinctNews) {
        failed = true;
    }
    if (failed) process.exit(1);
})();
