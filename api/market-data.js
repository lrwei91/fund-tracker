const {
    fail,
    fetchGbkText,
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
    return {
        mainFund: {
            value: '暂无真实数据',
            isPositive: null,
        },
        northFund: {
            value: '暂无真实数据',
            isPositive: null,
        },
    };
}

async function loadSector() {
    return {
        inflow: [],
        outflow: [],
    };
}

async function loadMultiDayFlow() {
    const sector = await loadSector();
    const today = new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    function mapRows(rows, trend) {
        return rows.map((row) => ({
            name: row.name,
            data: [row.value],
            consecutiveDays: 1,
            trend,
        }));
    }
    return {
        dates: [today],
        inflowSectors: mapRows(sector.inflow, 'up'),
        outflowSectors: mapRows(sector.outflow, 'down'),
    };
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
