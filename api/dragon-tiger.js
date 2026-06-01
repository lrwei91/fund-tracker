const { fail, fetchJson, ok } = require('./_utils');

module.exports = async function handler(req, res) {
    try {
        const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=TRADE_DATE&sortTypes=-1&pageSize=20&pageNumber=1&reportName=RPT_DAILYBILLBOARD_DETAILS&columns=ALL';
        const json = await fetchJson(url);
        const rows = json && json.result && json.result.data;
        const stocks = (rows || []).map((row) => ({
            code: row.SECURITY_CODE,
            name: row.SECURITY_NAME_ABBR,
            reason: row.EXPLANATION || row.EXPLAIN || '',
            netBuyWan: Number(row.BILLBOARD_NET_AMT || 0) / 10000,
        }));
        const date = rows && rows[0] && String(rows[0].TRADE_DATE || '').slice(0, 10);
        return ok(res, { date, stocks });
    } catch (error) {
        return fail(res, 502, '真实龙虎榜接口不可用', { error: error.message });
    }
};
