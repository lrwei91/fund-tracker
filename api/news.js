const { fail, fetchJson, ok } = require('./_utils');

function stripHtml(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .trim();
}

async function fetchJin10Page(cursor) {
    const params = new URLSearchParams({
        channel: '-8200',
        vip: '1',
    });
    if (cursor && cursor.maxTime) params.set('max_time', cursor.maxTime);
    if (cursor && cursor.lastId) params.set('last_id', cursor.lastId);

    return fetchJson(`https://flash-api.jin10.com/get_flash_list?${params.toString()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
            'x-app-id': 'bVBF4FyRTn5NJF5n',
            'x-version': '1.0.0',
            Referer: 'https://www.jin10.com/',
            Origin: 'https://www.jin10.com/',
        },
    });
}

module.exports = async function handler(req, res) {
    try {
        const seen = new Set();
        const rows = [];
        let cursor = null;

        for (let page = 0; page < 3 && rows.length < 20; page += 1) {
            let json;
            try {
                json = await fetchJin10Page(cursor);
            } catch (error) {
                if (rows.length) break;
                throw error;
            }
            if (!json || json.status !== 200 || !Array.isArray(json.data)) {
                if (rows.length) break;
                throw new Error(`金十返回异常 ${json && json.status}`);
            }
            if (!json.data.length) break;

            json.data.forEach((item) => {
                const id = String(item.id || '');
                if (!id || seen.has(id)) return;
                seen.add(id);

                const data = item.data || {};
                const content = stripHtml(data.content || data.title || '');
                if (!content || data.lock || /VIP专享|解锁直达|升级/.test(content)) return;

                rows.push({
                    id,
                    time: item.time || '',
                    data: { content },
                    url: data.link || 'https://www.jin10.com/flash',
                });
            });

            const last = json.data[json.data.length - 1];
            cursor = {
                maxTime: last && last.time,
                lastId: last && last.id,
            };
            if (!cursor.maxTime && !cursor.lastId) break;
        }

        if (!rows.length) throw new Error('金十公开快讯为空');
        return ok(res, { data: rows });
    } catch (error) {
        return fail(res, 502, '真实金十快讯接口不可用', { error: error.message });
    }
};
