const {
    fail,
    fetchGbkText,
    fetchJson,
    formatPct,
    ok,
    toNumber,
} = require('./_utils');

const INDEXES = {
    shangzhi: { symbol: 's_sh000001', name: '上证指数' },
    shengzheng: { symbol: 's_sz399001', name: '深证成指' },
    chuangye: { symbol: 's_sz399006', name: '创业板指' },
    zhuanke50: { symbol: 's_sh000688', name: '科创50' },
};

const dailyCache = {
    multidayFlow: null,
};

async function loadIndexes() {
    const symbols = Object.values(INDEXES).map((item) => item.symbol).join(',');
    const text = await fetchGbkText(`https://qt.gtimg.cn/q=${symbols}`);
    const lines = text.split(';').filter(Boolean);
    const bySymbol = {};
    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        const nameMatch = line.match(/^v_(.+?)="/);
        if (!nameMatch) return;
        const key = line.slice(2, line.indexOf('='));
        bySymbol[key] = line.slice(line.indexOf('"') + 1, line.lastIndexOf('"')).split('~');
    });
    const entries = Object.entries(INDEXES).map(([id, item]) => {
        const data = bySymbol[item.symbol];
        if (!data || data.length < 6) throw new Error(`指数无数据 ${item.symbol}`);
        const value = toNumber(data[3]);
        const change = toNumber(data[4]);
        const changePercent = toNumber(data[5]);
        return [id, {
            name: item.name,
            value: value === null ? '--' : value.toFixed(2),
            change: `${change > 0 ? '+' : ''}${change === null ? '--' : change.toFixed(2)} / ${formatPct(changePercent)}`,
            changePercent: changePercent || 0,
        }];
    });
    return Object.fromEntries(entries);
}

async function loadCapital() {
    const [mainFund, northFund] = await Promise.all([
        loadMarketMainFund(),
        loadNorthFund(),
    ]);
    return {
        mainFund,
        northFund,
    };
}

async function loadSector() {
    const rows = await loadIndustryRows();
    const mapRow = (row) => ({
        name: row.name,
        value: formatYi(row.mainFundYuan),
        changePct: row.changePct,
        leader: row.leader,
    });
    return {
        inflow: rows.filter((row) => row.mainFundYuan > 0).sort((a, b) => b.mainFundYuan - a.mainFundYuan).slice(0, 10).map(mapRow),
        outflow: rows.filter((row) => row.mainFundYuan < 0).sort((a, b) => a.mainFundYuan - b.mainFundYuan).slice(0, 10).map(mapRow),
    };
}

async function loadMultiDayFlow() {
    const cacheKey = shanghaiDateKey();
    if (dailyCache.multidayFlow && dailyCache.multidayFlow.key === cacheKey) {
        return dailyCache.multidayFlow.data;
    }

    const sector = await loadSector();
    const today = new Date().toLocaleDateString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: 'numeric',
        day: 'numeric',
    });
    function mapRows(rows, trend) {
        return rows.map((row) => ({
            name: row.name,
            data: [row.value],
            consecutiveDays: 1,
            trend,
        }));
    }
    const data = {
        dates: [today],
        inflowSectors: mapRows(sector.inflow, 'up'),
        outflowSectors: mapRows(sector.outflow, 'down'),
    };
    dailyCache.multidayFlow = { key: cacheKey, data };
    return data;
}

function shanghaiDateKey() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function formatYi(value) {
    const number = toNumber(value);
    if (number === null) return '--';
    const yi = number / 100000000;
    return `${yi > 0 ? '+' : ''}${yi.toFixed(2)}亿`;
}

function eastmoneyMarketFs() {
    return 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048';
}

async function loadMarketMainFund() {
    const thsRows = await loadThsIndustryRows();
    if (thsRows.length) {
        const totalYi = thsRows.reduce((sum, row) => sum + (row.netYi || 0), 0);
        return {
            value: `${totalYi > 0 ? '+' : ''}${totalYi.toFixed(2)}亿`,
            isPositive: totalYi >= 0,
        };
    }

    const params = new URLSearchParams({
        pn: '1',
        pz: '6000',
        po: '1',
        np: '1',
        fltt: '2',
        invt: '2',
        fs: eastmoneyMarketFs(),
        fields: 'f12,f14,f62',
    });
    const json = await fetchJson(`https://push2.eastmoney.com/api/qt/clist/get?${params.toString()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
            Referer: 'https://quote.eastmoney.com/',
        },
        timeout: 15000,
    });
    const rows = json && json.data && Array.isArray(json.data.diff) ? json.data.diff : [];
    const total = rows.reduce((sum, row) => {
        const value = toNumber(row.f62);
        return value === null ? sum : sum + value;
    }, 0);
    if (!rows.length) throw new Error('主力资金为空');
    return {
        value: formatYi(total),
        isPositive: total >= 0,
    };
}

async function loadNorthFund() {
    const json = await fetchJson('https://data.hexin.cn/market/hsgtApi/method/dayChart/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0.0.0 Safari/537.36',
            Host: 'data.hexin.cn',
            Referer: 'https://data.hexin.cn/',
        },
    });
    const times = Array.isArray(json.time) ? json.time : [];
    let latest = null;
    times.forEach((time, index) => {
        const hgt = toNumber(json.hgt && json.hgt[index]);
        const sgt = toNumber(json.sgt && json.sgt[index]);
        if (hgt === null || sgt === null) return;
        latest = { time, value: hgt + sgt };
    });
    if (!latest) throw new Error('北向资金为空');
    return {
        value: `${latest.value > 0 ? '+' : ''}${latest.value.toFixed(2)}亿`,
        isPositive: latest.value >= 0,
        time: latest.time,
    };
}

async function loadIndustryRows() {
    const thsRows = await loadThsIndustryRows();
    if (thsRows.length) {
        return thsRows.map((row) => ({
            name: row.name,
            code: row.code,
            changePct: row.changePct,
            mainFundYuan: row.netYi * 100000000,
            upCount: 0,
            downCount: 0,
            leader: row.leader,
            leaderChange: row.leaderChangePct,
        }));
    }

    const params = new URLSearchParams({
        pn: '1',
        pz: '100',
        po: '1',
        np: '1',
        fltt: '2',
        invt: '2',
        fid: 'f62',
        fs: 'm:90+t:2',
        fields: 'f3,f12,f14,f62,f104,f105,f136,f140',
    });
    const json = await fetchJson(`https://push2.eastmoney.com/api/qt/clist/get?${params.toString()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
            Referer: 'https://quote.eastmoney.com/center/boardlist.html',
        },
        timeout: 15000,
    });
    const rows = json && json.data && Array.isArray(json.data.diff) ? json.data.diff : [];
    return rows.map((item) => ({
        name: item.f14 || item.f12 || '',
        code: item.f12 || '',
        changePct: toNumber(item.f3) || 0,
        mainFundYuan: toNumber(item.f62) || 0,
        upCount: toNumber(item.f104) || 0,
        downCount: toNumber(item.f105) || 0,
        leader: item.f140 || '',
        leaderChange: toNumber(item.f136) || 0,
    })).filter((item) => item.name && item.mainFundYuan !== 0);
}

async function loadThsIndustryRows() {
    const html = await fetchGbkText('https://data.10jqka.com.cn/funds/hyzjl/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
            Referer: 'https://data.10jqka.com.cn/',
        },
        timeout: 12000,
    });
    const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbody) return [];

    const rows = [];
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tbody[1]))) {
        const cells = [];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch;
        while ((tdMatch = tdRegex.exec(trMatch[1]))) {
            cells.push(stripHtml(tdMatch[1]));
        }
        if (cells.length < 11) continue;
        const codeMatch = trMatch[1].match(/\/thshy\/detail\/code\/(\d+)\//);
        rows.push({
            rank: toNumber(cells[0]) || rows.length + 1,
            code: codeMatch ? codeMatch[1] : '',
            name: cells[1],
            changePct: parsePercent(cells[3]),
            inflowYi: toNumber(cells[4]) || 0,
            outflowYi: toNumber(cells[5]) || 0,
            netYi: toNumber(cells[6]) || 0,
            stockCount: toNumber(cells[7]) || 0,
            leader: cells[8],
            leaderChangePct: parsePercent(cells[9]),
        });
    }
    return rows.filter((row) => row.name && row.netYi !== 0);
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function parsePercent(value) {
    const number = toNumber(String(value || '').replace('%', ''));
    return number === null ? 0 : number;
}

module.exports = async function handler(req, res) {
    try {
        const type = req.query.type;
        if (type === 'index') return ok(res, await loadIndexes());
        if (type === 'capital') return ok(res, await loadCapital());
        if (type === 'sector') return ok(res, await loadSector());
        if (type === 'multiday-flow') return ok(res, await loadMultiDayFlow());
        return fail(res, 400, '未知 market-data 类型');
    } catch (error) {
        return fail(res, 502, '真实行情接口不可用', { error: error.message });
    }
};
