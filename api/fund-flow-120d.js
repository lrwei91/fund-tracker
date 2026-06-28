// 自选股 120 日资金流（接 push2 fflow/daykline/get）— a-stock-data v3.0 §4.5
// 取代项目"多日资金"卡片中"按当日数据假装多日"的旧实现
// 注意:此接口为个股维度(非行业板块),更符合"自选股用户最关心我关注的几只股最近资金动向"的价值
//   — 行业板块连续 N 日维度在 a-stock-data 中也仅给到个股端点,行业多日需要 N×N 次拉取(不可行)

const { emGet, fail, fetchGbkText, ok } = require('./_utils');

const MAX_CODES = 10;   // 单次最多 10 只,防并发打东财
const MAX_DAYS = 120;
const MIN_DAYS = 5;
const PER_REQUEST_SLEEP_MS = 200;  // 串行间隔,降低东财风控触发概率

function marketCode(code) {
    // 6/9 开头 → 沪市 (market=1);其它 → 深市/北市 (market=0)
    // 北市 (8/4 开头) 实测走 0 也工作,东财 secid 实际是 0/1 二元
    return (code.startsWith('6') || code.startsWith('9')) ? 1 : 0;
}

function tencentSymbol(code) {
    // 与 api/stock.js 同步:5/6/9 开头 → sh,否则 sz
    return `${/^(5|6|9)/.test(code) ? 'sh' : 'sz'}${code}`;
}

// 批量从腾讯 quote 拿名称(单次 HTTP 拿全,避免依赖前端缓存时机)
async function fetchNames(codes) {
    if (!codes.length) return {};
    const symbols = codes.map(tencentSymbol).join(',');
    let text;
    try {
        text = await fetchGbkText(`https://qt.gtimg.cn/q=${symbols}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000,
        });
    } catch (e) {
        // 名称拉取失败不影响主流程,fallback 到空 name,前端会用 code 兜底
        return {};
    }
    const map = {};
    text.split(';').filter(Boolean).forEach((rawLine) => {
        const line = rawLine.trim();
        const eq = line.indexOf('=');
        if (eq < 0) return;
        const key = line.slice(2, eq);
        const code = key.startsWith('sh') || key.startsWith('sz') ? key.slice(2) : key;
        const quoteMatch = line.match(/="([\s\S]+?)"/);
        if (!quoteMatch) return;
        const parts = quoteMatch[1].split('~');
        if (parts.length >= 2 && code && /^\d{6}$/.test(code)) {
            map[code] = parts[1];
        }
    });
    return map;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOneCode(code, days) {
    const secid = `${marketCode(code)}.${code}`;
    const params = new URLSearchParams({
        secid,
        klt: '101',          // 日级
        lmt: String(days),
        fields1: 'f1,f2,f3,f7',
        fields2: 'f51,f52,f53,f54,f55,f56,f57',  // date,main,small,mid,large,super,pct
    });
    const json = await emGet(`https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get?${params.toString()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            Referer: 'https://quote.eastmoney.com/',
        },
        timeout: 12000,
    });
    return json && json.data && Array.isArray(json.data.klines) ? json.data.klines : [];
}

function summarize(klines, code, name) {
    // 字段顺序参考 a-stock-data v3.0 §4.5:
    //   date, main_net, small_net, mid_net, large_net, super_net, pct
    // 主流水只展示 parts[1] (主力净流入,单位:元) + parts[6] (涨跌幅%);
    // 大/中/小/超大单字段顺序在 push2 服务端偶尔漂移,需要列名校验,本期暂不展示拆分。
    const recent = klines.map((line) => {
        const parts = line.split(',');
        return {
            date: parts[0] || '',
            mainNet: Number(parts[1]) || 0,
            pct: Number(parts[6]) || 0,
        };
    });
    const sumWindow = (window) => recent.slice(-Math.min(window, recent.length))
        .reduce((sum, r) => sum + r.mainNet, 0);
    return {
        code,
        name: name || '',
        recent: recent.slice(-10),  // 最近 10 日明细(渲染紧凑)
        summary: {
            main_5d: sumWindow(5),
            main_20d: sumWindow(20),
            main_60d: sumWindow(60),
        },
        latestDate: recent.length ? recent[recent.length - 1].date : null,
    };
}

module.exports = async function handler(req, res) {
    try {
        const codesRaw = String(req.query.codes || '').split(',')
            .map((s) => s.trim())
            .filter((s) => /^\d{6}$/.test(s));
        if (!codesRaw.length) return fail(res, 400, '缺少股票代码');
        const codes = codesRaw.slice(0, MAX_CODES);
        const days = Math.max(MIN_DAYS, Math.min(MAX_DAYS, parseInt(req.query.days, 10) || 60));

        // 先拉一次腾讯 quote 拿名称(1 次 HTTP,失败 fallback 到空 name)
        const nameMap = await fetchNames(codes);
        // 串行拉取(东财绝不开并发,参考 a-stock-data v3.2 防封铁律)
        const items = [];
        for (const code of codes) {
            try {
                const klines = await fetchOneCode(code, days);
                items.push(summarize(klines, code, nameMap[code]));
            } catch (error) {
                items.push({ code, name: nameMap[code] || '', error: error.message, recent: [], summary: null });
            }
            if (codes.length > 1) await sleep(PER_REQUEST_SLEEP_MS);
        }
        return ok(res, { days, count: items.length, items });
    } catch (error) {
        return fail(res, 502, '真实 120 日资金流接口不可用', { error: error.message });
    }
};
