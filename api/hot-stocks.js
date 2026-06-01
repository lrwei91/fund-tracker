const { fail, fetchGbkText, ok, tencentSymbol, toNumber } = require('./_utils');

const WATCHED_UNIVERSE = [
    '600519', '300750', '002594', '601318', '600036',
    '600900', '601398', '688981', '300308', '000858',
    '600276', '601012', '002415', '600030', '000333',
];

module.exports = async function handler(req, res) {
    try {
        const symbols = WATCHED_UNIVERSE.map(tencentSymbol).join(',');
        const text = await fetchGbkText(`https://qt.gtimg.cn/q=${symbols}`);
        const stocks = text.split(';').filter(Boolean).map((rawLine) => {
            const line = rawLine.trim();
            const key = line.slice(2, line.indexOf('='));
            const code = key.slice(2);
            const data = line.slice(line.indexOf('"') + 1, line.lastIndexOf('"')).split('~');
            return {
                code,
                name: data[1] || code,
                changePct: toNumber(data[32]) || 0,
                reason: '关注池涨幅排名',
            };
        }).filter((item) => /^\d{6}$/.test(item.code))
            .sort((a, b) => b.changePct - a.changePct)
            .slice(0, 10);
        return ok(res, { stocks });
    } catch (error) {
        return fail(res, 502, '真实强势股接口不可用', { error: error.message });
    }
};
