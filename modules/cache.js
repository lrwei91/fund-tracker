// ================================================================
// localStorage 缓存 helpers
// 暴露到 window.AppCache;直接 script 引入,无需 import/require
// 包含:readJson / writeJson / readTimedCache / writeTimedCache /
//      readDailyDataCache / writeDailyDataCache
// ================================================================

(function () {
    function readJson(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    // 带 TTL 的缓存: 读时如果超过 ttlMs 返回 null
    // 被 loadIndexData / loadCapitalData / loadSectorData 使用
    function readTimedCache(key, ttlMs) {
        var cached = readJson(key, null);
        if (!cached || !cached.data || !cached.updatedAt) return null;
        if (Date.now() - cached.updatedAt > ttlMs) return null;
        return cached.data;
    }

    function writeTimedCache(key, data) {
        writeJson(key, { data: data, updatedAt: Date.now() });
    }

    // 日级持久缓存: 同一日期内复用,跨日失效
    // 返回 { date, data, updatedAt } 或 null
    function readDailyDataCache(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch (e) {
            return null;
        }
    }

    function writeDailyDataCache(key, date, data) {
        try {
            localStorage.setItem(key, JSON.stringify({
                date: date,
                data: data,
                updatedAt: new Date().toISOString(),
            }));
        } catch (e) {
            // Ignore storage failures; the live data has already rendered.
        }
    }

    window.AppCache = {
        readJson: readJson,
        writeJson: writeJson,
        readTimedCache: readTimedCache,
        writeTimedCache: writeTimedCache,
        readDailyDataCache: readDailyDataCache,
        writeDailyDataCache: writeDailyDataCache,
    };
})();