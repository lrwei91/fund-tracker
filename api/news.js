const { fail, fetchText, ok } = require('./_utils');

function decodeEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

module.exports = async function handler(req, res) {
    try {
        const html = await fetchText('https://finance.eastmoney.com/');
        const seen = new Set();
        const rows = [];
        const regex = /<a[^>]+href="(https:\/\/finance\.eastmoney\.com\/a\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) && rows.length < 20) {
            const url = match[1];
            const content = decodeEntities(match[2].replace(/<[^>]*>/g, '').trim());
            if (!content || content.length < 8 || seen.has(url)) continue;
            seen.add(url);
            rows.push({
                time: '',
                data: { content },
                url,
            });
        }
        return ok(res, { data: rows });
    } catch (error) {
        return fail(res, 502, '真实财经新闻接口不可用', { error: error.message });
    }
};
