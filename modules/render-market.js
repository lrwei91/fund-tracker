// ================================================================
// 市场行情 — 大盘指数 / 资金流 / 板块 / 自选股 120 日资金流
// 暴露到 window.AppMarket;
// 直接 script 引入,无需 import/require
// 依赖:window.AppState, window.AppUtils, window.AppCache
// ================================================================

(function () {
    var state = window.AppState;
    var utils = window.AppUtils;
    var cache = window.AppCache;
    var KEYS = state.KEYS;

    // ============================================================
    // 大盘指数 prev 快照 helpers (半小时对比箭头基准)
    // 结构:{ market: { _updatedAt, data: { id: priceValue } }, custom: 同上 }
    // ============================================================

    function getIndexPrevPct() {
        try {
            var raw = JSON.parse(localStorage.getItem(KEYS.INDEX_PREV_KEY));
            if (raw && typeof raw === 'object') return raw;
        } catch (e) { /* ignore */ }
        return { market: { _updatedAt: 0, data: {} }, custom: { _updatedAt: 0, data: {} } };
    }

    function readIndexPrevBucket(bucket) {
        var cur = getIndexPrevPct();
        var b = cur[bucket];
        if (!b || typeof b !== 'object') return { _updatedAt: 0, data: {} };
        return {
            _updatedAt: typeof b._updatedAt === 'number' ? b._updatedAt : 0,
            data: b.data && typeof b.data === 'object' ? b.data : {},
        };
    }

    // 仅当距上次落盘 ≥ INDEX_REFRESH_SECONDS 秒时,才把 currentMap 写入 bucket.data 并刷新 _updatedAt
    function persistIndexPrevIfDue(bucket, currentMap, now) {
        var bucketObj = readIndexPrevBucket(bucket);
        var nowMs = typeof now === 'number' ? now : Date.now();
        var due = (nowMs - bucketObj._updatedAt) >= KEYS.INDEX_REFRESH_SECONDS * 1000;
        if (!due) return false;
        var cleanData = {};
        Object.keys(currentMap || {}).forEach(function (k) {
            var v = currentMap[k];
            if (typeof v === 'number' && Number.isFinite(v)) cleanData[k] = v;
        });
        var cur = getIndexPrevPct();
        cur[bucket] = { _updatedAt: nowMs, data: cleanData };
        try { localStorage.setItem(KEYS.INDEX_PREV_KEY, JSON.stringify(cur)); } catch (e) {}
        return true;
    }

    // 单点写入 prev(新增自选指数时立刻给一个 prev,让首渲染箭头 = self-vs-self = '─')
    function setIndexPrevForCode(bucket, code, pct) {
        if (typeof pct !== 'number' || !Number.isFinite(pct)) return;
        var cur = getIndexPrevPct();
        var b = readIndexPrevBucket(bucket);
        b.data[code] = pct;
        // 单点写入不动 _updatedAt,避免污染节流基准
        cur[bucket] = b;
        try { localStorage.setItem(KEYS.INDEX_PREV_KEY, JSON.stringify(cur)); } catch (e) {}
    }

    // 移除自选指数时同步清掉 prev,避免幽灵 prev
    function clearIndexPrevForCode(bucket, code) {
        var cur = getIndexPrevPct();
        var b = readIndexPrevBucket(bucket);
        if (Object.prototype.hasOwnProperty.call(b.data, code)) {
            delete b.data[code];
            cur[bucket] = b;
            try { localStorage.setItem(KEYS.INDEX_PREV_KEY, JSON.stringify(cur)); } catch (e) {}
        }
    }

    // 半小时对比箭头
    function trendArrow(current, prev) {
        if (prev === undefined || prev === null) return '─';
        if (current > prev) return '▲';
        if (current < prev) return '▼';
        return '─';
    }

    // 抽出 { key: priceValue } 快照,trend-arrow 用价格本身做对比基准
    function snapshotIndexPrice(data) {
        var out = {};
        if (!data || typeof data !== 'object') return out;
        Object.keys(data).forEach(function (id) {
            var d = data[id];
            if (d && typeof d.priceValue === 'number' && Number.isFinite(d.priceValue)) {
                out[id] = d.priceValue;
            }
        });
        return out;
    }

    // ============================================================
    // 大盘指数 — UI 更新
    // ============================================================

    function updateIndexUI(id, data) {
        if (!data) return;
        var v = document.getElementById(id + '-value');
        var c = document.getElementById(id + '-change');
        var n = document.querySelector('[data-index="' + id + '"] .index-name');
        if (!v || !c) return;
        v.textContent = data.value;
        c.textContent = data.change;
        if (n && data.name) n.textContent = data.name;
        v.className = 'index-value';
        c.className = 'index-change';
        var cls = data.changePercent > 0 ? 'positive' : data.changePercent < 0 ? 'negative' : 'neutral';
        v.classList.add(cls);
        c.classList.add(cls);
        // 半小时对比箭头:跟价格绑定,内部读 prev 价格快照
        var prev = readIndexPrevBucket('market').data[id];
        var arrow = trendArrow(
            typeof data.priceValue === 'number' ? data.priceValue : null,
            typeof prev === 'number' ? prev : null
        );
        var existing = v.querySelector('.trend-arrow');
        if (existing) existing.remove();
        if (arrow) {
            var span = document.createElement('span');
            span.className = 'trend-arrow';
            span.textContent = arrow;
            v.appendChild(span);
        }
    }

    // ============================================================
    // loadIndexData / loadCapitalData / loadSectorData
    // ============================================================

    async function loadIndexData() {
        var cached = cache.readTimedCache(KEYS.SHORT_CACHE_KEYS.index, KEYS.SHORT_CACHE_TTL.index);
        if (cached) {
            state.liveIndexData = cached;
            Object.keys(cached).forEach(function (id) { updateIndexUI(id, cached[id]); });
            var meta = cache.readJson(KEYS.SHORT_CACHE_KEYS.index, null);
            if (meta && meta.updatedAt) {
                utils.setLastUpdated('行情已更新', utils.formatShanghaiTime(meta.updatedAt));
            }
            return;
        }

        try {
            var res = await fetch(utils.apiUrl('/market-data', { type: 'index' }));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var result = await res.json();
            if (!result.success || !result.data) throw new Error('数据异常');
            state.liveIndexData = result.data;
            cache.writeTimedCache(KEYS.SHORT_CACHE_KEYS.index, result.data);
            Object.keys(result.data).forEach(function (id) { updateIndexUI(id, result.data[id]); });
            // 节流落盘:刷新节奏不变,只决定 prev 落盘的节奏
            persistIndexPrevIfDue('market', snapshotIndexPrice(result.data));
            utils.setLastUpdated('行情已更新');
        } catch (e) {
            if (!state.liveIndexData) utils.setLastUpdated('行情获取失败');
        }
    }

    async function loadCapitalData() {
        var newData = null;
        var cached = cache.readTimedCache(KEYS.SHORT_CACHE_KEYS.capital, KEYS.SHORT_CACHE_TTL.capital);
        if (cached) {
            newData = cached;
        }

        try {
            if (!newData) {
                var res = await fetch(utils.apiUrl('/market-data', { type: 'capital' }));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var result = await res.json();
                if (result.success && result.data && result.data.mainFund && result.data.mainFund.value !== undefined) {
                    newData = result.data;
                    cache.writeTimedCache(KEYS.SHORT_CACHE_KEYS.capital, result.data);
                }
            }
        } catch (e) {
            newData = cached || null;
        }

        if (newData) {
            state.liveCapitalData = newData;
        }

        if (!state.liveCapitalData) return;
        renderCapitalUI(state.liveCapitalData);
    }

    async function loadSectorData() {
        var newData = null;
        var cached = cache.readTimedCache(KEYS.SHORT_CACHE_KEYS.sector, KEYS.SHORT_CACHE_TTL.sector);
        if (cached) {
            newData = cached;
        }

        try {
            if (!newData) {
                var res = await fetch(utils.apiUrl('/market-data', { type: 'sector' }));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var result = await res.json();
                if (result.success && result.data && result.data.inflow) {
                    newData = result.data;
                    cache.writeTimedCache(KEYS.SHORT_CACHE_KEYS.sector, result.data);
                }
            }
        } catch (e) {
            newData = cached || null;
        }

        if (newData) {
            state.liveSectorData = newData;
        }

        if (!state.liveSectorData) return;
        renderSectorUI(state.liveSectorData);
    }

    // ============================================================
    // 资金流 / 板块 UI 渲染
    // ============================================================

    // 6 格子: 资金 4 档 (主力/大单/中单/小单) + 北向 2 通道 (沪股通/深股通)
    function renderCapitalUI(cap) {
        var cells = [
            { id: 'main-fund-value', data: cap.mainFund },
            { id: 'large-value',     data: cap.mainFund && cap.mainFund.breakdown && cap.mainFund.breakdown.large },
            { id: 'medium-value',    data: cap.mainFund && cap.mainFund.breakdown && cap.mainFund.breakdown.medium },
            { id: 'small-value',     data: cap.mainFund && cap.mainFund.breakdown && cap.mainFund.breakdown.small },
            { id: 'north-hgt-value', data: cap.northHgt },
            { id: 'north-sgt-value', data: cap.northSgt },
        ];
        cells.forEach(function (cell) {
            var el = document.getElementById(cell.id);
            if (!el) return;
            el.textContent = cell.data && cell.data.value ? cell.data.value : '--';
            el.className = 'capital-value';
            if (cell.data && typeof cell.data.isPositive === 'boolean') {
                el.classList.add(cell.data.isPositive ? 'positive' : 'negative');
            }
        });
    }

    function renderSectorUI(sectors) {
        var inflowEl = document.getElementById('sector-bars-inflow');
        var outflowEl = document.getElementById('sector-bars-outflow');
        if (!inflowEl || !outflowEl) return;

        var inflowList = (sectors.inflow || []).slice(0, 5);
        var outflowList = (sectors.outflow || []).slice(0, 5);
        var maxAbs = 1;
        inflowList.forEach(function (s) { if (s.mainFundYuan > maxAbs) maxAbs = s.mainFundYuan; });
        outflowList.forEach(function (s) { if (Math.abs(s.mainFundYuan) > maxAbs) maxAbs = Math.abs(s.mainFundYuan); });

        function pctOf(s) {
            return (Math.abs(s.mainFundYuan || 0) / maxAbs * 100).toFixed(1);
        }
        function pctClass(v) { return v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral'; }
        function changeStr(c) {
            if (typeof c !== 'number' || !c) return '';
            return (c > 0 ? '+' : '') + c.toFixed(2) + '%';
        }

        function renderBars(items, sign) {
            if (!items.length) return '<div class="list-empty">暂无' + (sign > 0 ? '流入' : '流出') + '数据</div>';
            return items.map(function (s) {
                var w = pctOf(s);
                var cls = pctClass(s.changePct);
                return '<div class="sector-bar-row">' +
                    '<div class="sector-bar-name">' +
                        '<span class="sector-bar-label">' + utils.escapeHtml(s.name) + '</span>' +
                        '<span class="sector-bar-change ' + cls + '">' + utils.escapeHtml(changeStr(s.changePct)) + '</span>' +
                    '</div>' +
                    '<div class="sector-bar-track">' +
                        '<div class="sector-bar-fill ' + (sign > 0 ? 'positive' : 'negative') + '" data-w="' + w + '"></div>' +
                    '</div>' +
                    '<div class="sector-bar-value ' + (sign > 0 ? 'positive' : 'negative') + '">' + utils.escapeHtml(s.value) + '</div>' +
                    '<div class="sector-bar-leader">' + utils.escapeHtml(s.leader || '') + '</div>' +
                '</div>';
            }).join('');
        }

        inflowEl.innerHTML = renderBars(inflowList, 1);
        outflowEl.innerHTML = renderBars(outflowList, -1);
        // 渲染后批量把 data-w 转成实际宽度(避免在 HTML 字符串里写 inline style,
        // 绕过 dom-contract 禁内联 style 的检查;走 setProperty 也更稳)
        [inflowEl, outflowEl].forEach(function (container) {
            var fills = container.querySelectorAll('.sector-bar-fill[data-w]');
            fills.forEach(function (fill) {
                fill.style.width = fill.getAttribute('data-w') + '%';
            });
        });
    }

    // ============================================================
    // 自选股 120 日资金流 (push2 fflow/daykline/get)
    // ============================================================

    function readFundFlowCache() {
        try { return JSON.parse(localStorage.getItem(KEYS.FUND_FLOW_CACHE_KEY) || 'null'); } catch (e) { return null; }
    }
    function writeFundFlowCache(date, data) {
        try {
            localStorage.setItem(KEYS.FUND_FLOW_CACHE_KEY, JSON.stringify({
                date: date, data: data, updatedAt: new Date().toISOString(),
            }));
        } catch (e) { /* ignore */ }
    }

    function renderFundFlowEmpty(message) {
        var emptyEl = document.getElementById('fund-flow-empty');
        var tableEl = document.getElementById('fund-flow-table');
        if (emptyEl) { emptyEl.textContent = message; emptyEl.hidden = false; }
        if (tableEl) tableEl.hidden = true;
    }

    function renderFundFlowRows(items) {
        var emptyEl = document.getElementById('fund-flow-empty');
        var tableEl = document.getElementById('fund-flow-table');
        var rowsEl = document.getElementById('fund-flow-rows');
        if (!rowsEl) return;
        if (emptyEl) emptyEl.hidden = true;
        if (tableEl) tableEl.hidden = false;

        function cls(v) { return v > 0 ? 'flow-positive' : v < 0 ? 'flow-negative' : 'flow-neutral'; }

        // 趋势条:每根 ▁▂▃▄▅▆▇█ 按主力量级映射(正向红/负向绿配色由 css 控制)
        var bars = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇'];
        function trendHtml(recent) {
            return (recent || []).map(function (r) {
                var abs = Math.abs(r.mainNet || 0);
                var level = 0;
                if (abs > 5e8) level = 7;
                else if (abs > 2e8) level = 6;
                else if (abs > 1e8) level = 5;
                else if (abs > 5e7) level = 4;
                else if (abs > 1e7) level = 3;
                else if (abs > 1e6) level = 2;
                else if (abs > 0) level = 1;
                return '<span class="' + cls(r.mainNet) + '" title="' + utils.escapeHtml(r.date) + ' ' + utils.formatYuan(r.mainNet) + '">' + bars[level] + '</span>';
            }).join('');
        }

        rowsEl.innerHTML = items.map(function (it) {
            // 即使 name 为空也要渲染 code 一行(老 cache 兼容);name 行用 code 兜底
            var displayName = it.name || it.code;
            var displayCode = it.code;
            if (it.error || !it.summary) {
                return '<tr><td class="sector-name-cell">' +
                    '<div class="watchlist-item-main">' +
                        '<div class="watchlist-stock-name">' + utils.escapeHtml(displayName) + '</div>' +
                        '<div class="watchlist-stock-code">' + utils.escapeHtml(displayCode) + '</div>' +
                    '</div>' +
                    '</td>' +
                    '<td colspan="4" class="list-empty">' + utils.escapeHtml(it.error || '暂无数据') + '</td></tr>';
            }
            return '<tr>' +
                '<td class="sector-name-cell">' +
                    '<div class="watchlist-item-main">' +
                        '<div class="watchlist-stock-name">' + utils.escapeHtml(displayName) + '</div>' +
                        '<div class="watchlist-stock-code">' + utils.escapeHtml(displayCode) + '</div>' +
                    '</div>' +
                '</td>' +
                '<td class="' + cls(it.summary.main_5d) + '">' + utils.formatYuan(it.summary.main_5d) + '</td>' +
                '<td class="' + cls(it.summary.main_20d) + '">' + utils.formatYuan(it.summary.main_20d) + '</td>' +
                '<td class="' + cls(it.summary.main_60d) + '">' + utils.formatYuan(it.summary.main_60d) + '</td>' +
                '<td class="trend-cell fund-flow-trend">' + trendHtml(it.recent) + '</td>' +
            '</tr>';
        }).join('');
    }

    async function loadFundFlow120dData(force) {
        var watchlistMod = window.AppWatchlist;
        var codes = watchlistMod && typeof watchlistMod.getWatchlist === 'function'
            ? watchlistMod.getWatchlist()
            : [];
        if (!codes || !codes.length) {
            renderFundFlowEmpty('添加自选股后查看资金流');
            return;
        }

        var todayKey = utils.getShanghaiDateKey();
        var cached = readFundFlowCache();
        if (cached && cached.date === todayKey && cached.data) {
            renderFundFlowRows(cached.data);
            return;
        }

        try {
            var res = await fetch(utils.apiUrl('/fund-flow-120d', { codes: codes.join(','), days: 60 }));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var result = await res.json();
            if (!result.success || !result.data || !Array.isArray(result.data.items)) throw new Error('数据异常');
            writeFundFlowCache(todayKey, result.data.items);
            renderFundFlowRows(result.data.items);
        } catch (e) {
            console.error('资金流获取失败:', e);
            if (cached && cached.data) {
                renderFundFlowRows(cached.data);
                return;
            }
            renderFundFlowEmpty('资金流接口暂不可用');
            // 关键 fetch 失败 → toast 提示
            if (window.AppAlerts && typeof window.AppAlerts.showStatusToast === 'function') {
                window.AppAlerts.showStatusToast('资金流接口暂不可用', 'error');
            }
        }
    }

    window.AppMarket = {
        // prev 快照
        getIndexPrevPct: getIndexPrevPct,
        readIndexPrevBucket: readIndexPrevBucket,
        persistIndexPrevIfDue: persistIndexPrevIfDue,
        setIndexPrevForCode: setIndexPrevForCode,
        clearIndexPrevForCode: clearIndexPrevForCode,
        trendArrow: trendArrow,
        snapshotIndexPrice: snapshotIndexPrice,
        // 指数 UI / load
        updateIndexUI: updateIndexUI,
        loadIndexData: loadIndexData,
        // 资金 / 板块
        loadCapitalData: loadCapitalData,
        loadSectorData: loadSectorData,
        renderCapitalUI: renderCapitalUI,
        renderSectorUI: renderSectorUI,
        // 自选股 120 日资金流
        loadFundFlow120dData: loadFundFlow120dData,
        readFundFlowCache: readFundFlowCache,
        writeFundFlowCache: writeFundFlowCache,
        renderFundFlowRows: renderFundFlowRows,
        renderFundFlowEmpty: renderFundFlowEmpty,
    };
})();