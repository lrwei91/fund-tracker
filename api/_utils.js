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

// 东财统一请求 helper(同步自 a-stock-data v3.2.5 的 em_get 设计):
//  - 最多 3 次,指数退避(300ms * 2^n) + 0~100ms 随机抖动
//  - 重试:HTTP 429 / 5xx,以及网络层错误(AbortError / fetch failed / DNS / 连接重置/超时)
//  - 不重试:HTTP 403(v3.2.5 设计:靠降频/换网络应对,403 重试只会更快触发风控)
//           其它 4xx(客户端错误,重试无意义)
//  - 接收东财 6 个子域(push2 / push2his / push2ex / np-weblist / datacenter / searchapi / reportapi)
//  - 之所以单独抽出:东财 IP 级风控(>5 QPS / 并发≥10 / 1分≥200 / 5分≥300)主要落在调用层,
//    helper 把"重试策略"集中维护,新增端点直接复用即可。
async function emGet(url, options) {
    const maxRetries = 3;
    const baseDelay = 300;
    const timeout = (options && options.timeout) || 10000;

    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        let response;
        try {
            response = await fetch(url, {
                method: (options && options.method) || 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 fund-tracker/1.0',
                    Referer: 'https://finance.eastmoney.com/',
                    ...(options && options.headers ? options.headers : {}),
                },
                body: options && options.body,
                signal: AbortSignal.timeout(timeout),
            });
        } catch (error) {
            // 网络层错误(AbortError / fetch failed / DNS / ECONNRESET / ETIMEDOUT 等)
            lastError = error;
            if (attempt < maxRetries - 1) {
                await sleep(baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 100));
                continue;
            }
            throw error;
        }

        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
            lastError = new Error(`HTTP ${response.status}`);
            if (attempt < maxRetries - 1) {
                await sleep(baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 100));
                continue;
            }
            throw lastError;
        }
        if (!response.ok) {
            // 4xx(除 429)不重试,直接抛
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    }
    // 循环正常出口不会到这里;TypeScript 友好型兜底
    throw lastError || new Error('emGet 重试耗尽');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    emGet,
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
