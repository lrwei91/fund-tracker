const { TextDecoder } = require('util');

function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');
    res.end(JSON.stringify(body));
}

function ok(res, data, extra) {
    sendJson(res, 200, Object.assign({ success: true, data }, extra || {}));
}

function fail(res, status, message, extra) {
    sendJson(res, status, Object.assign({ success: false, message }, extra || {}));
}

async function fetchJson(url, options) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 fund-tracker/1.0',
            Referer: 'https://finance.eastmoney.com/',
            ...(options && options.headers ? options.headers : {}),
        },
        signal: AbortSignal.timeout((options && options.timeout) || 10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function fetchText(url, options) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 fund-tracker/1.0',
            Referer: 'https://finance.eastmoney.com/',
            ...(options && options.headers ? options.headers : {}),
        },
        signal: AbortSignal.timeout((options && options.timeout) || 10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
}

async function fetchGbkText(url, options) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 fund-tracker/1.0',
            Referer: 'https://finance.qq.com/',
            ...(options && options.headers ? options.headers : {}),
        },
        signal: AbortSignal.timeout((options && options.timeout) || 10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new TextDecoder('gbk').decode(buffer);
}

function toNumber(value) {
    if (value === undefined || value === null || value === '-' || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function formatPct(value) {
    const number = toNumber(value);
    if (number === null) return '--';
    return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function tencentSymbol(code) {
    return `${/^(5|6|9)/.test(code) ? 'sh' : 'sz'}${code}`;
}

module.exports = {
    fail,
    fetchJson,
    fetchGbkText,
    fetchText,
    formatPct,
    ok,
    sendJson,
    tencentSymbol,
    toNumber,
};
