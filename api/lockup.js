const { fail, fetchJson, ok } = require('./_utils');

module.exports = async function handler(req, res) {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const filter = encodeURIComponent(`(FREE_DATE>='${today}')`);
        const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=FREE_DATE&sortTypes=1&pageSize=15&pageNumber=1&reportName=RPT_LIFT_STAGE&columns=ALL&filter=${filter}`;
        const json = await fetchJson(url);
        const rows = json && json.result && json.result.data;
        const items = (rows || []).map((row) => ({
            code: row.SECURITY_CODE,
            name: row.SECURITY_NAME_ABBR,
            date: String(row.FREE_DATE || '').slice(0, 10),
            type: row.FREE_SHARES_TYPE || '限售股解禁',
            ratio: Number(row.FREE_RATIO || row.TOTAL_RATIO || 0),
        }));
        return ok(res, { items });
    } catch (error) {
        return fail(res, 502, '真实限售解禁接口不可用', { error: error.message });
    }
};
