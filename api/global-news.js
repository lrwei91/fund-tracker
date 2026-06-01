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
        const items = [];
        const regex = /<a[^>]+href="(https:\/\/finance\.eastmoney\.com\/a\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) && items.length < 20) {
            const url = match[1];
            const title = decodeEntities(match[2].replace(/<[^>]*>/g, '').trim());
            if (!title || title.length < 8 || seen.has(url)) continue;
            seen.add(url);
            items.push({ title, summary: '', time: '', url });
        }
        return ok(res, items);
    } catch (error) {
        return fail(res, 502, '真实东财资讯接口不可用', { error: error.message });
    }
};
