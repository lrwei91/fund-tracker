const crypto = require('crypto');

const { fail, fetchJson, fetchText, ok } = require('./_utils');

function decodeEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

async function loadEastmoneyFastNews() {
    const params = new URLSearchParams({
        client: 'web',
        biz: 'web_724',
        fastColumn: '102',
        sortEnd: '',
        pageSize: '30',
        req_trace: crypto.randomUUID(),
    });
    const json = await fetchJson(`https://np-weblist.eastmoney.com/comm/web/getFastNewsList?${params.toString()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
            Referer: 'https://kuaixun.eastmoney.com/',
        },
    });
    const rows = json && json.data && Array.isArray(json.data.fastNewsList) ? json.data.fastNewsList : [];
    return rows.map((item) => ({
        title: item.title || '',
        summary: item.summary || '',
        time: item.showTime || '',
        url: item.url || 'https://kuaixun.eastmoney.com/',
    })).filter((item) => item.title || item.summary).slice(0, 20);
}

async function loadEastmoneyFinanceFallback() {
    const html = await fetchText('https://finance.eastmoney.com/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
            Referer: 'https://finance.eastmoney.com/',
        },
    });
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
    return items;
}

module.exports = async function handler(req, res) {
    try {
        let items = [];
        try {
            items = await loadEastmoneyFastNews();
        } catch (error) {
            items = await loadEastmoneyFinanceFallback();
        }
        if (!items.length) throw new Error('东财全球资讯为空');
        return ok(res, items);
    } catch (error) {
        return fail(res, 502, '真实东财资讯接口不可用', { error: error.message });
    }
};
