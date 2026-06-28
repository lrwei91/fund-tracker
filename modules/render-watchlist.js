// ================================================================
// 自选股 — 自选股多分组 / 行情 / 持仓成本 / 单股资金流弹窗 / 自选指数
// 暴露到 window.AppWatchlist;
// 直接 script 引入,无需 import/require
// 依赖:window.AppState, window.AppUtils, window.AppCache
// 跨模块依赖:window.AppAlerts (toast), window.AppMarket (loadFundFlow120dData, prev bucket, snapshotIndexPrice)
// ================================================================

(function () {
    var state = window.AppState;
    var utils = window.AppUtils;
    var cache = window.AppCache;
    var KEYS = state.KEYS;

    // ============================================================
    // helpers
    // ============================================================

    function isFixedWatchTab(tabId) {
        return KEYS.FIXED_WATCH_TAB_IDS.indexOf(tabId) !== -1;
    }

    function sanitizeCodes(codes) {
        return Array.isArray(codes)
            ? codes.filter(function (code, index, arr) { return /^\d{6}$/.test(code) && arr.indexOf(code) === index; })
            : [];
    }

    function getLegacyWatchlist() {
        try {
            var data = localStorage.getItem(KEYS.STORAGE_KEY);
            var parsed = data ? JSON.parse(data) : [];
            return sanitizeCodes(parsed);
        } catch (e) { return []; }
    }

    function defaultWatchTabs() {
        return [
            { id: 'default', name: '持仓股', codes: getLegacyWatchlist() },
            { id: 'candidate', name: '候选股', codes: [] },
        ];
    }

    function normalizeWatchTabName(name, index) {
        if (!name || name === '自选') return index === 0 ? '持仓股' : '分组' + (index + 1);
        return name;
    }

    function getWatchTabs() {
        try {
            var data = localStorage.getItem(KEYS.WATCH_TABS_KEY);
            var parsed = data ? JSON.parse(data) : null;
            if (!Array.isArray(parsed) || parsed.length === 0) return defaultWatchTabs();

            // 升级:补齐缺失的 fixed tabs,保证 fixed tabs 排在最前
            var fixedBuckets = KEYS.FIXED_WATCH_TAB_IDS.map(function () { return null; });
            var userTabs = [];
            parsed.forEach(function (tab) {
                var idx = KEYS.FIXED_WATCH_TAB_IDS.indexOf(tab.id);
                if (idx !== -1) fixedBuckets[idx] = tab;
                else userTabs.push(tab);
            });
            var needsUpgrade = false;
            KEYS.FIXED_WATCH_TAB_IDS.forEach(function (id, idx) {
                if (!fixedBuckets[idx]) {
                    fixedBuckets[idx] = { id: id, name: KEYS.FIXED_WATCH_TAB_NAMES[id], codes: [] };
                    needsUpgrade = true;
                }
            });
            var merged = fixedBuckets.concat(userTabs);
            if (needsUpgrade) saveWatchTabs(merged);

            return merged.map(function (tab, index) {
                return {
                    id: tab.id || 'tab-' + index,
                    name: normalizeWatchTabName(tab.name, index),
                    codes: sanitizeCodes(tab.codes),
                };
            });
        } catch (e) {
            return defaultWatchTabs();
        }
    }

    function saveWatchTabs(tabs) {
        var cleanTabs = tabs.map(function (tab, index) {
            return {
                id: tab.id || 'tab-' + index,
                name: normalizeWatchTabName(tab.name, index),
                codes: sanitizeCodes(tab.codes),
            };
        });
        try {
            localStorage.setItem(KEYS.WATCH_TABS_KEY, JSON.stringify(cleanTabs));
            localStorage.setItem(KEYS.STORAGE_KEY, JSON.stringify(cleanTabs[0] ? cleanTabs[0].codes : []));
        } catch (e) {
            console.error('保存失败', e);
        }
    }

    function normalizeImportedWatchTabs(rawTabs) {
        if (!Array.isArray(rawTabs) || rawTabs.length === 0) throw new Error('文件中没有自选股分组');
        return rawTabs.map(function (tab, index) {
            var id = tab.id || (index === 0 ? 'default' : 'tab-import-' + index + '-' + Date.now().toString(36));
            return {
                id: String(id).slice(0, 48),
                name: normalizeWatchTabName(String(tab.name || ''), index).slice(0, 12),
                codes: sanitizeCodes(tab.codes),
            };
        });
    }

    function getExportPayload() {
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            watchTabs: getWatchTabs(),
        };
    }

    function showDataStatus(message, type) {
        if (window.AppAlerts) window.AppAlerts.showStatusToast(message, type);
    }

    function exportWatchlistData() {
        var payload = JSON.stringify(getExportPayload(), null, 2);
        var blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        var date = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = 'fund-tracker-watchlist-' + date + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showDataStatus('已导出自选股数据');
    }

    function importWatchlistData(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            try {
                var json = JSON.parse(String(reader.result || ''));
                var tabs = normalizeImportedWatchTabs(json.watchTabs || json.tabs || json);
                saveWatchTabs(tabs);
                state.activeWatchTabId = tabs[0].id;
                localStorage.setItem(KEYS.ACTIVE_WATCH_TAB_KEY, state.activeWatchTabId);
                state.watchQuoteCache = {};
                state.watchQuoteUpdateTime = '';
                state.watchAlertState = {};
                persistWatchQuoteCache();
                persistWatchQuoteUpdateTime('');
                if (window.AppAlerts) window.AppAlerts.saveWatchAlertState();
                renderWatchTabs();
                renderWatchlist();
                loadWatchlistData();
                showDataStatus('已导入 ' + tabs.length + ' 个分组');
            } catch (err) {
                showDataStatus(err.message || '导入失败', 'error');
            } finally {
                e.target.value = '';
            }
        };
        reader.onerror = function () {
            showDataStatus('读取文件失败', 'error');
            e.target.value = '';
        };
        reader.readAsText(file);
    }

    // ============================================================
    // 自选股 prev change pct (半小时对比箭头)
    // ============================================================

    function getPrevChangePct() {
        try { return JSON.parse(localStorage.getItem(KEYS.PREV_KEY)) || {}; } catch (e) { return {}; }
    }
    function savePrevChangePct(map) {
        try { localStorage.setItem(KEYS.PREV_KEY, JSON.stringify(map)); } catch (e) {}
    }
    function persistCurrentChangePct() {
        var map = {};
        Object.keys(state.watchQuoteCache).forEach(function (code) {
            var d = state.watchQuoteCache[code];
            if (d && typeof d.changePercent === 'number') map[code] = d.changePercent;
        });
        savePrevChangePct(map);
    }

    // ============================================================
    // 自选股多分组 tab 渲染 + 切换
    // ============================================================

    function getActiveWatchTab() {
        var tabs = getWatchTabs();
        var savedId = localStorage.getItem(KEYS.ACTIVE_WATCH_TAB_KEY);
        var tab = tabs.find(function (item) { return item.id === (state.activeWatchTabId || savedId); }) ||
            tabs.find(function (item) { return item.id === savedId; }) ||
            tabs[0];
        state.activeWatchTabId = tab.id;
        return tab;
    }

    function getWatchlist() {
        return getActiveWatchTab().codes;
    }

    function saveActiveWatchlist(codes) {
        var tabs = getWatchTabs();
        var tab = tabs.find(function (item) { return item.id === state.activeWatchTabId; }) || tabs[0];
        tab.codes = sanitizeCodes(codes);
        saveWatchTabs(tabs);
    }

    function initWatchlistTabs() {
        var savedId = localStorage.getItem(KEYS.ACTIVE_WATCH_TAB_KEY);
        state.activeWatchTabId = savedId || 'default';
        renderWatchTabs();
        initWatchTabScroller();
    }

    function renderWatchTabs() {
        var container = document.getElementById('watchlist-tabs');
        if (!container) return;
        var tabs = getWatchTabs();
        if (!tabs.some(function (tab) { return tab.id === state.activeWatchTabId; })) state.activeWatchTabId = tabs[0].id;
        container.innerHTML = tabs.map(function (tab) {
            var isActive = tab.id === state.activeWatchTabId;
            var removable = !isFixedWatchTab(tab.id);
            return '<button class="watchlist-tab' + (isActive ? ' active' : '') + '" data-watch-tab="' + utils.escapeHtml(tab.id) + '" type="button">' +
                '<span>' + utils.escapeHtml(tab.name) + '</span>' +
                (removable ? '<span class="watchlist-tab-remove" data-remove-watch-tab="' + utils.escapeHtml(tab.id) + '" aria-label="删除分组">×</span>' : '') +
                '</button>';
        }).join('');
        container.querySelectorAll('.watchlist-tab').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                if (container.dataset.suppressClick === 'true') {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                var removeBtn = e.target.closest('.watchlist-tab-remove');
                if (removeBtn) {
                    e.stopPropagation();
                    removeWatchTab(removeBtn.getAttribute('data-remove-watch-tab'));
                    return;
                }
                switchWatchTab(btn.getAttribute('data-watch-tab'));
            });
        });
    }

    function switchWatchTab(tabId) {
        if (!tabId || tabId === state.activeWatchTabId) return;
        state.activeWatchTabId = tabId;
        localStorage.setItem(KEYS.ACTIVE_WATCH_TAB_KEY, tabId);
        renderWatchTabs();
        renderWatchlist();
        // 切自选股分组后,资金流卡片对应的是当前分组的代码,重拉一次
        if (window.AppMarket && typeof window.AppMarket.loadFundFlow120dData === 'function') {
            window.AppMarket.loadFundFlow120dData(true);
        }
    }

    function initWatchTabScroller() {
        var container = document.getElementById('watchlist-tabs');
        if (!container || container.dataset.dragBound === 'true') return;
        container.dataset.dragBound = 'true';
        var isDown = false;
        var startX = 0;
        var startScrollLeft = 0;
        var startTabId = '';
        var didDrag = false;

        container.addEventListener('pointerdown', function (e) {
            if (e.target.closest('.watchlist-tab-remove')) return;
            var tab = e.target.closest('.watchlist-tab');
            isDown = true;
            startX = e.clientX;
            startScrollLeft = container.scrollLeft;
            startTabId = tab ? tab.getAttribute('data-watch-tab') : '';
            didDrag = false;
            container.classList.add('dragging');
            container.setPointerCapture(e.pointerId);
        });

        container.addEventListener('pointermove', function (e) {
            if (!isDown) return;
            var delta = e.clientX - startX;
            if (Math.abs(delta) > 6) {
                didDrag = true;
                e.preventDefault();
            }
            container.scrollLeft = startScrollLeft - delta;
        });

        function endDrag(e) {
            if (!isDown) return;
            isDown = false;
            container.classList.remove('dragging');
            try { container.releasePointerCapture(e.pointerId); } catch (err) {}
            if (didDrag) {
                container.dataset.suppressClick = 'true';
                setTimeout(function () { container.dataset.suppressClick = ''; }, 0);
                return;
            }
            switchWatchTab(startTabId);
        }

        container.addEventListener('pointerup', endDrag);
        container.addEventListener('pointercancel', endDrag);
    }

    function addWatchTab() {
        var tabs = getWatchTabs();
        var name = window.prompt('新分组名称', '分组' + (tabs.length + 1));
        if (!name) return;
        var cleanName = name.trim().slice(0, 12);
        if (!cleanName) return;
        var id = 'tab-' + Date.now().toString(36);
        tabs.push({ id: id, name: cleanName, codes: [] });
        state.activeWatchTabId = id;
        localStorage.setItem(KEYS.ACTIVE_WATCH_TAB_KEY, id);
        saveWatchTabs(tabs);
        renderWatchTabs();
        renderWatchlist();
    }

    function removeWatchTab(tabId) {
        if (isFixedWatchTab(tabId)) return;
        var tabs = getWatchTabs();
        var userTabsCount = tabs.filter(function (t) { return !isFixedWatchTab(t.id); }).length;
        if (userTabsCount <= 1) {
            showWatchStatus('至少保留一个自建分组', 'error');
            return;
        }
        var target = tabs.find(function (tab) { return tab.id === tabId; });
        if (!target) return;
        if (!window.confirm('删除分组“' + target.name + '”？分组内股票也会移除。')) return;
        var nextTabs = tabs.filter(function (tab) { return tab.id !== tabId; });
        if (state.activeWatchTabId === tabId) {
            state.activeWatchTabId = nextTabs[0].id;
            localStorage.setItem(KEYS.ACTIVE_WATCH_TAB_KEY, state.activeWatchTabId);
        }
        saveWatchTabs(nextTabs);
        renderWatchTabs();
        renderWatchlist();
        showWatchStatus('分组已删除');
    }

    // ============================================================
    // 加股 / 删股 / 搜索
    // ============================================================

    async function resolveStockInput(input) {
        var value = input.trim();
        if (/^\d{6}$/.test(value)) return { code: value, name: '' };

        var res = await fetch(utils.apiUrl('/stock-search', { q: value }));
        if (!res.ok) throw new Error('搜索失败 ' + res.status);
        var json = await res.json();
        if (!json.success || !json.data || json.data.length === 0) throw new Error('未找到股票');
        return json.data[0];
    }

    async function addStockToWatchlist() {
        var input = document.getElementById('stock-code-input');
        var button = document.getElementById('add-stock-btn');
        var rawValue = input.value.trim();
        if (!rawValue) { showWatchStatus('请输入股票代码或名称', 'error'); return; }
        button.disabled = true;
        button.textContent = '查询中';
        try {
            var match = await resolveStockInput(rawValue);
            var code = match.code;
            var list = getWatchlist();
            if (list.includes(code)) { showWatchStatus('已在当前分组中', 'error'); return; }
            list.push(code);
            saveActiveWatchlist(list);
            input.value = '';
            // 同步写一条 pending alert state,首次拿到行情后由 checkAlerts 写入 addedPrice
            state.watchAlertState[code] = {
                openDate: utils.getShanghaiDateKey(),
                openPrice: null,
                addedPrice: null,
                addedAt: null,
                pendingAdd: true,
                lastTriggerPrice: null,
                lastTriggerTime: null,
            };
            if (window.AppAlerts) window.AppAlerts.saveWatchAlertState();
            showWatchStatus((match.name || code) + ' 已添加');
            renderWatchlist();
            loadSingleWatchQuote(code);
            // 资金流卡片包含自选股列表,加股后立刻重拉
            if (window.AppMarket && typeof window.AppMarket.loadFundFlow120dData === 'function') {
                window.AppMarket.loadFundFlow120dData(true);
            }
        } catch (e) {
            showWatchStatus(e.message || '没有找到匹配股票', 'error');
        } finally {
            button.disabled = false;
            button.textContent = '添加';
        }
    }

    function removeStockFromWatchlist(code) {
        var list = getWatchlist().filter(function (c) { return c !== code; });
        saveActiveWatchlist(list);
        if (state.watchQuoteCache[code]) {
            delete state.watchQuoteCache[code];
            persistWatchQuoteCache();
        }
        if (state.watchAlertState[code]) {
            delete state.watchAlertState[code];
            if (window.AppAlerts) window.AppAlerts.saveWatchAlertState();
        }
        renderWatchlist();
        showWatchStatus('已移除');
        if (window.AppMarket && typeof window.AppMarket.loadFundFlow120dData === 'function') {
            window.AppMarket.loadFundFlow120dData(true);
        }
    }

    function showWatchStatus(msg, type) {
        if (window.AppAlerts) window.AppAlerts.showStatusToast(msg, type);
    }

    function getAllWatchCodes() {
        return sanitizeCodes(getWatchTabs().flatMap(function (tab) { return tab.codes || []; }));
    }

    // 持仓股 tab 的代码:仅第一个分组 (id === 'default')
    function getHoldingCodes() {
        var tabs = getWatchTabs();
        var holding = tabs.find(function (tab) { return tab.id === 'default'; });
        return sanitizeCodes(holding ? (holding.codes || []) : []);
    }

    // 持仓股 tab 是创建时的第一个 tab(id === 'default',name 固定为"持仓股")
    // 只有这个 tab 才显示成本价/盈亏列,避免对"候选股"等纯观察列造成干扰
    function isHoldingTab() {
        return state.activeWatchTabId === 'default';
    }

    // ============================================================
    // 渲染 + 持久化
    // ============================================================

    function renderWatchlist() {
        var grid = document.getElementById('watchlist-grid');
        var updateTimeEl = document.getElementById('watchlist-update-time');
        var codes = getWatchlist();
        var activeTab = getActiveWatchTab();
        var showCost = isHoldingTab();
        if (codes.length === 0) {
            grid.innerHTML = '<div class="watchlist-empty">“' + utils.escapeHtml(activeTab.name) + '”暂无股票</div>';
            if (updateTimeEl) updateTimeEl.textContent = '';
            return;
        }

        var prevMap = getPrevChangePct();
        grid.innerHTML = codes.map(function (code) {
            var data = state.watchQuoteCache[code];
            var prev = Object.prototype.hasOwnProperty.call(prevMap, code) ? prevMap[code] : undefined;
            return renderWatchItem(
                code,
                data ? data.name : code + '（待刷新）',
                data ? data.price : '--',
                data ? data.changePercent : 0,
                data ? data.volume : '--',
                prev,
                showCost,
            );
        }).join('');
        bindWatchRemove();
        // 切换列数:持仓股 5 列(带成本),其他 4 列
        grid.classList.toggle('with-cost', showCost);
        document.querySelector('.watchlist-header-row')?.classList.toggle('with-cost', showCost);
        bindWatchItemClick();
        // 持仓股 sub-row 的资金流 bar 宽度注入
        grid.querySelectorAll('.watchlist-fund-fill[data-w]').forEach(function (fill) {
            fill.style.width = fill.getAttribute('data-w') + '%';
        });
        var editBtn = document.getElementById('watchlist-edit-btn');
        if (editBtn) editBtn.style.visibility = showCost ? 'visible' : 'hidden';
        if (!showCost) closeWatchlistEditPanel();
        if (updateTimeEl) updateTimeEl.textContent = state.watchQuoteUpdateTime || '';
    }

    function persistWatchQuoteCache() {
        try { localStorage.setItem(KEYS.WATCH_QUOTE_CACHE_KEY, JSON.stringify(state.watchQuoteCache)); } catch (e) {}
    }

    function persistWatchQuoteUpdateTime(value) {
        try { localStorage.setItem(KEYS.WATCH_QUOTE_UPDATE_TIME_KEY, value || ''); } catch (e) {}
    }

    // ============================================================
    // loadWatchlistData / loadSingleWatchQuote
    // ============================================================

    async function loadWatchlistData() {
        var updateTimeEl = document.getElementById('watchlist-update-time');
        var codes = getAllWatchCodes();
        if (codes.length === 0) {
            renderWatchlist();
            return;
        }

        try {
            var res = await fetch(utils.apiUrl('/stock', { codes: codes.join(',') }));
            if (!res.ok) throw new Error('请求失败 ' + res.status);
            var result = await res.json();
            if (!result.success || !result.data) throw new Error('数据异常');

            Object.keys(result.data).forEach(function (code) {
                var d = result.data[code];
                if (d && d.price !== '0.00') state.watchQuoteCache[code] = d;
            });

            if (result.time) {
                state.watchQuoteUpdateTime = result.time;
                persistWatchQuoteUpdateTime(result.time);
                if (updateTimeEl) updateTimeEl.textContent = result.time;
            }
            persistWatchQuoteCache();
            renderWatchlist();
            persistCurrentChangePct();
            if (window.AppAlerts && typeof window.AppAlerts.checkAlerts === 'function') {
                window.AppAlerts.checkAlerts(result.data);
            }
        } catch (e) {
            console.error('自选股失败:', e);
            showWatchStatus('自选股行情加载失败', 'error');
            utils.setLastUpdated('加载失败');
            renderWatchlist();
        }
    }

    async function loadSingleWatchQuote(code) {
        var updateTimeEl = document.getElementById('watchlist-update-time');
        try {
            var res = await fetch(utils.apiUrl('/stock', { codes: code }));
            if (!res.ok) throw new Error('请求失败 ' + res.status);
            var result = await res.json();
            if (!result.success || !result.data) throw new Error('数据异常');
            var data = result.data[code];
            if (data && data.price !== '0.00') state.watchQuoteCache[code] = data;
            if (result.time) {
                state.watchQuoteUpdateTime = result.time;
                persistWatchQuoteUpdateTime(result.time);
                if (updateTimeEl) updateTimeEl.textContent = result.time;
            }
            persistWatchQuoteCache();
            renderWatchlist();
            persistCurrentChangePct();
            if (window.AppAlerts && typeof window.AppAlerts.checkAlerts === 'function') {
                window.AppAlerts.checkAlerts(result.data);
            }
        } catch (e) {
            console.error('新增股票行情获取失败:', e);
            showWatchStatus('已添加,行情稍后自动刷新', 'error');
            utils.setLastUpdated('加载失败');
            renderWatchlist();
        }
    }

    // ============================================================
    // 单元渲染
    // ============================================================

    function renderWatchItem(code, name, price, changePercent, volume, prev, showCost) {
        var cls = changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : 'neutral';
        var pt = changePercent !== 0
            ? (changePercent > 0 ? '+' + Number(changePercent).toFixed(2) : Number(changePercent).toFixed(2)) + '%'
            : '0.00%';
        var arrow = (window.AppMarket && typeof window.AppMarket.trendArrow === 'function')
            ? window.AppMarket.trendArrow(changePercent, prev)
            : '─';
        var data = state.watchQuoteCache[code];
        var priceValue = data && typeof data.priceValue === 'number' ? data.priceValue : null;
        var costCell = showCost ? renderCostCell(code, priceValue) : '';
        return '<div class="watchlist-item clickable" data-code="' + utils.escapeHtml(code) + '" data-pct="' + utils.escapeHtml(changePercent) + '">' +
            '<div class="watchlist-item-main">' +
            '<div class="watchlist-stock-name">' + utils.escapeHtml(name) + '</div>' +
            '<div class="watchlist-stock-code">' + utils.escapeHtml(code) + '</div></div>' +
            costCell +
            '<div class="watchlist-stock-price ' + cls + '">' + utils.escapeHtml(price) + '</div>' +
            '<div class="watchlist-stock-change ' + cls + '">' + utils.escapeHtml(pt) + ' <span class="trend-arrow">' + utils.escapeHtml(arrow) + '</span></div>' +
            '<button class="watchlist-remove-btn" data-code="' + utils.escapeHtml(code) + '" aria-label="删除 ' + utils.escapeHtml(code) + '">✕</button></div>';
    }

    function renderCostCell(code, priceValue) {
        var entry = state.watchlistCost[code];
        if (!entry || typeof entry.cost !== 'number' || !Number.isFinite(entry.cost)) {
            return '<div class="watchlist-stock-cost">' +
                '<div class="cost-value empty">--</div>' +
                '<div class="cost-pnl">未设成本</div>' +
                '</div>';
        }
        var cost = entry.cost;
        var shares = typeof entry.shares === 'number' && Number.isFinite(entry.shares) ? entry.shares : 0;
        var pnl = null;
        if (priceValue !== null && Number.isFinite(priceValue)) {
            pnl = (priceValue - cost) * shares;
        }
        var pnlCls = pnl === null ? '' : (pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '');
        var pnlText = pnl === null
            ? '--'
            : (pnl > 0 ? '+' : '') + pnl.toFixed(2);
        return '<div class="watchlist-stock-cost">' +
            '<div class="cost-value">' + cost.toFixed(2) + '</div>' +
            '<div class="cost-pnl ' + pnlCls + '">' + pnlText + '</div>' +
            '</div>';
    }

    function saveWatchlistCost() {
        try { localStorage.setItem(KEYS.WATCHLIST_COST_KEY, JSON.stringify(state.watchlistCost)); } catch (e) {}
    }

    // ============================================================
    // 持仓成本编辑面板
    // ============================================================

    function syncEditButtonLabel() {
        var panel = document.getElementById('watchlist-edit-panel');
        var btn = document.getElementById('watchlist-edit-btn');
        if (!btn) return;
        var isOpen = panel && !panel.hidden;
        btn.textContent = isOpen ? '保存' : '编辑';
        btn.classList.toggle('active', !!isOpen);
    }

    function openWatchlistEditPanel() {
        var panel = document.getElementById('watchlist-edit-panel');
        if (!panel) return;
        panel.hidden = false;
        renderWatchlistEditRows();
        syncEditButtonLabel();
    }

    function closeWatchlistEditPanel() {
        var panel = document.getElementById('watchlist-edit-panel');
        if (panel) panel.hidden = true;
        syncEditButtonLabel();
    }

    function renderWatchlistEditRows() {
        var wrap = document.getElementById('watchlist-edit-rows');
        if (!wrap) return;
        var codes = getHoldingCodes();
        if (codes.length === 0) {
            wrap.innerHTML = '<div class="watchlist-empty">持仓股暂无股票</div>';
            return;
        }
        wrap.innerHTML = codes.map(function (code) {
            var data = state.watchQuoteCache[code];
            var name = (data && data.name) || code;
            var entry = state.watchlistCost[code] || {};
            var costVal = typeof entry.cost === 'number' ? entry.cost : '';
            var sharesVal = typeof entry.shares === 'number' ? entry.shares : '';
            return '<div class="watchlist-edit-row" data-code="' + utils.escapeHtml(code) + '">' +
                '<div class="watchlist-edit-row-name">' + utils.escapeHtml(name) + '<span class="edit-row-code">' + utils.escapeHtml(code) + '</span></div>' +
                '<input type="number" step="0.01" min="0" class="edit-cost-input" placeholder="成本价" value="' + utils.escapeHtml(String(costVal)) + '" />' +
                '<input type="number" step="1" min="0" class="edit-shares-input" placeholder="股数" value="' + utils.escapeHtml(String(sharesVal)) + '" />' +
                '</div>';
        }).join('');
    }

    function saveWatchlistEditPanel() {
        var rows = document.querySelectorAll('.watchlist-edit-row');
        rows.forEach(function (row) {
            var code = row.getAttribute('data-code');
            var costInput = row.querySelector('.edit-cost-input');
            var sharesInput = row.querySelector('.edit-shares-input');
            var cost = parseFloat(costInput.value);
            var shares = parseFloat(sharesInput.value);
            if (Number.isFinite(cost) && cost > 0) {
                state.watchlistCost[code] = {
                    cost: cost,
                    shares: Number.isFinite(shares) && shares > 0 ? shares : 0,
                };
            } else {
                delete state.watchlistCost[code];
            }
        });
        saveWatchlistCost();
        renderWatchlist();
        closeWatchlistEditPanel();
        showWatchStatus('成本已保存');
    }

    // ============================================================
    // 删除 / 点击绑定
    // ============================================================

    function bindWatchRemove() {
        document.querySelectorAll('.watchlist-remove-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                removeStockFromWatchlist(this.getAttribute('data-code'));
            });
        });
    }

    // 点击持仓股某行 → 弹窗显示今日 4 档资金流 (主力/大单/中单/小单)
    // 每次展开都重新 fetch 最新数据,不走本地 cache
    function bindWatchItemClick() {
        var grid = document.getElementById('watchlist-grid');
        if (!grid || grid.dataset.clickBound === 'true') return;
        grid.dataset.clickBound = 'true';
        grid.addEventListener('click', function (e) {
            if (e.target.closest('.watchlist-remove-btn')) return;
            var item = e.target.closest('.watchlist-item');
            if (!item) return;
            var code = item.getAttribute('data-code');
            if (code) showStockFundFlow(code);
        });
    }

    // ============================================================
    // 单股资金流弹窗
    // ============================================================

    async function showStockFundFlow(code) {
        var panel = document.getElementById('stock-fund-panel');
        var overlay = document.getElementById('stock-fund-overlay');
        var body = document.getElementById('stock-fund-body');
        var title = document.getElementById('stock-fund-title');
        var timeEl = document.getElementById('stock-fund-time');
        if (!panel || !overlay || !body || !title) return;
        if (overlay.hidden) overlay.hidden = false;
        if (panel.hidden) panel.hidden = false;
        body.innerHTML = '<div class="list-empty">加载中...</div>';
        if (timeEl) timeEl.textContent = '';

        try {
            var res = await fetch(utils.apiUrl('/fund-flow-120d', { codes: code, days: 2 }));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var json = await res.json();
            if (!json.success || !json.data || !Array.isArray(json.data.items) || !json.data.items.length) {
                throw new Error('数据异常');
            }
            var item = json.data.items[0];
            var today = item.summary && item.summary.today;
            var recent = item.recent || [];
            var last = recent.length ? recent[recent.length - 1] : null;
            var prev = recent.length > 1 ? recent[recent.length - 2] : null;
            var lastDate = last ? last.date : (item.latestDate || '');
            var prevMain = prev ? prev.mainNet : null;
            title.textContent = (item.name || code) + ' (' + code + ')';
            if (timeEl) timeEl.textContent = lastDate ? '交易日 ' + lastDate : '';
            body.innerHTML = renderStockFundFlowBody(today, last, prevMain);
            body.querySelectorAll('.watchlist-fund-fill[data-w]').forEach(function (fill) {
                fill.style.width = fill.getAttribute('data-w') + '%';
            });
        } catch (e) {
            body.innerHTML = '<div class="list-empty">资金流加载失败: ' + utils.escapeHtml(e.message) + '</div>';
        }
    }

    function renderStockFundFlowBody(today, last, prevMain) {
        if (!today || !last) return '<div class="list-empty">暂无当日资金流数据</div>';

        var pct = typeof last.pct === 'number' ? last.pct : 0;
        var pctCls = pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral';
        var pctStr = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';

        var items = [
            { key: 'main',   label: '主力' },
            { key: 'large',  label: '大单' },
            { key: 'medium', label: '中单' },
            { key: 'small',  label: '小单' },
        ];
        var max = 1;
        items.forEach(function (it) {
            var a = Math.abs(today[it.key] || 0);
            if (a > max) max = a;
        });
        var mainNet = today.main || 0;
        var prevMainText = prevMain === null || prevMain === undefined
            ? ''
            : ' (昨 ' + utils.formatYuan(prevMain) + ')';
        var rows = items.map(function (it) {
            var v = today[it.key] || 0;
            var w = (Math.abs(v) / max * 100).toFixed(1);
            var cls = v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral';
            return '<div class="watchlist-fund-row">' +
                '<span class="watchlist-fund-label">' + it.label + '</span>' +
                '<span class="watchlist-fund-track"><span class="watchlist-fund-fill ' + cls + '" data-w="' + w + '"></span></span>' +
                '<span class="watchlist-fund-value ' + cls + '">' + utils.escapeHtml(utils.formatYuan(v)) + '</span>' +
            '</div>';
        }).join('');

        return '<div class="stock-fund-header">' +
            '<div class="stock-fund-pct ' + pctCls + '">' + utils.escapeHtml(pctStr) + '</div>' +
            '<div class="stock-fund-main">主力合计 ' + utils.escapeHtml(utils.formatYuan(mainNet)) + utils.escapeHtml(prevMainText) + '</div>' +
            '</div>' +
            '<div class="watchlist-fund-flow">' + rows + '</div>';
    }

    function closeStockFundFlow() {
        var panel = document.getElementById('stock-fund-panel');
        var overlay = document.getElementById('stock-fund-overlay');
        if (panel) panel.hidden = true;
        if (overlay) overlay.hidden = true;
    }

    function initStockFundFlowModal() {
        var closeBtn = document.getElementById('stock-fund-close');
        var overlay = document.getElementById('stock-fund-overlay');
        if (closeBtn) closeBtn.addEventListener('click', closeStockFundFlow);
        if (overlay) overlay.addEventListener('click', closeStockFundFlow);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var panel = document.getElementById('stock-fund-panel');
                if (panel && !panel.hidden) closeStockFundFlow();
            }
        });
    }

    // ============================================================
    // 自选指数(板块/ETF,最多 4 个)
    // ============================================================

    function saveCustomIndices() {
        try { localStorage.setItem(KEYS.CUSTOM_INDICES_KEY, JSON.stringify(state.customIndexCodes)); } catch (e) {}
    }
    function persistCustomIndexCache() {
        try { localStorage.setItem(KEYS.CUSTOM_INDEX_QUOTE_CACHE_KEY, JSON.stringify(state.customIndexCache)); } catch (e) {}
    }
    function persistCustomIndexUpdateTime(value) {
        try { localStorage.setItem(KEYS.CUSTOM_INDEX_UPDATE_TIME_KEY, value || ''); } catch (e) {}
    }

    function renderCustomIndex() {
        var grid = document.getElementById('custom-index-grid');
        var updateTimeEl = document.getElementById('custom-index-update-time');
        if (!grid) return;

        var items = state.customIndexCodes.map(function (code) {
            var d = state.customIndexCache[code];
            var name = d && d.name ? d.name : code + '（待刷新）';
            var price = d && d.price != null ? d.price : '--';
            var pct = d && typeof d.changePercent === 'number' ? d.changePercent : 0;
            var change = d && typeof d.change === 'number' ? d.change : null;
            return renderCustomIndexItem(code, name, price, pct, change);
        });

        // 满 4 个不显示加号;未满追加 1 个加号格子
        if (state.customIndexCodes.length < KEYS.CUSTOM_INDEX_MAX) {
            items.push(
                '<button type="button" class="custom-index-add" data-custom-index-add="1">' +
                '<span class="add-icon">+</span>' +
                '<span class="add-hint">添加指数</span>' +
                '</button>'
            );
        }

        grid.innerHTML = items.join('');
        bindCustomIndexRemove();
        bindCustomIndexAdd();
        if (updateTimeEl) updateTimeEl.textContent = state.customIndexUpdateTime || '';
    }

    function renderCustomIndexItem(code, name, price, changePercent, change) {
        var cls = changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : 'neutral';
        var changeStr = '--';
        if (typeof change === 'number' && Number.isFinite(change)) {
            changeStr = (change > 0 ? '+' : '') + change.toFixed(2);
        }
        var pctStr = (typeof changePercent === 'number' && Number.isFinite(changePercent) && changePercent !== 0)
            ? (changePercent > 0 ? '+' : '') + changePercent.toFixed(2) + '%'
            : '0.00%';
        // 半小时对比箭头:跟大盘指数一致,挂在价格后面,从 custom bucket 取 prev 价格
        var cached = state.customIndexCache[code];
        var priceValue = cached && typeof cached.priceValue === 'number' ? cached.priceValue : null;
        var marketMod = window.AppMarket;
        var prevBucket = (marketMod && typeof marketMod.readIndexPrevBucket === 'function')
            ? marketMod.readIndexPrevBucket('custom').data
            : {};
        var prev = prevBucket[code];
        var arrow = (marketMod && typeof marketMod.trendArrow === 'function')
            ? marketMod.trendArrow(priceValue, typeof prev === 'number' ? prev : null)
            : '─';
        var arrowHtml = arrow ? ' <span class="trend-arrow">' + utils.escapeHtml(arrow) + '</span>' : '';
        return '<div class="index-item custom-index-data" data-code="' + utils.escapeHtml(code) + '">' +
            '<div class="index-name">' + utils.escapeHtml(name) + '</div>' +
            '<div class="index-value ' + cls + '">' + utils.escapeHtml(price) + arrowHtml + '</div>' +
            '<div class="index-change ' + cls + '">' + utils.escapeHtml(changeStr) + ' / ' + utils.escapeHtml(pctStr) + '</div>' +
            '<button type="button" class="custom-index-remove" data-remove-custom-index="' + utils.escapeHtml(code) + '" aria-label="删除 ' + utils.escapeHtml(code) + '">✕</button>' +
            '</div>';
    }

    function bindCustomIndexRemove() {
        document.querySelectorAll('[data-remove-custom-index]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var code = this.getAttribute('data-remove-custom-index');
                removeCustomIndex(code);
            });
        });
    }

    function bindCustomIndexAdd() {
        document.querySelectorAll('[data-custom-index-add]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                openCustomIndexAddForm();
            });
        });
    }

    // 用 prompt 快速加;避免在卡片里塞输入框布局
    function openCustomIndexAddForm() {
        var raw = window.prompt('输入指数 / ETF / 板块代码(6 位数字)或名称', '');
        if (raw == null) return;
        var value = String(raw).trim();
        if (!value) return;
        addCustomIndexByInput(value);
    }

    async function addCustomIndexByInput(rawValue) {
        showCustomIndexStatus('查询中…');
        try {
            var match = await resolveStockInput(rawValue);
            var code = match.code;
            if (state.customIndexCodes.includes(code)) {
                showCustomIndexStatus('已在自选指数中', 'error');
                return;
            }
            if (state.customIndexCodes.length >= KEYS.CUSTOM_INDEX_MAX) {
                showCustomIndexStatus('自选指数最多 ' + KEYS.CUSTOM_INDEX_MAX + ' 个,请先删除', 'error');
                return;
            }
            state.customIndexCodes.push(code);
            saveCustomIndices();
            renderCustomIndex();
            showCustomIndexStatus((match.name || code) + ' 已添加');
            loadSingleCustomIndex(code);
        } catch (e) {
            showCustomIndexStatus(e.message || '未找到匹配指数', 'error');
        }
    }

    function removeCustomIndex(code) {
        state.customIndexCodes = state.customIndexCodes.filter(function (c) { return c !== code; });
        delete state.customIndexCache[code];
        if (window.AppMarket && typeof window.AppMarket.clearIndexPrevForCode === 'function') {
            window.AppMarket.clearIndexPrevForCode('custom', code);
        }
        saveCustomIndices();
        persistCustomIndexCache();
        renderCustomIndex();
        showCustomIndexStatus('已删除');
    }

    function showCustomIndexStatus(msg, type) {
        if (window.AppAlerts) window.AppAlerts.showStatusToast(msg, type);
    }

    async function loadCustomIndexData() {
        if (state.customIndexCodes.length === 0) {
            renderCustomIndex();
            return;
        }
        try {
            var res = await fetch(utils.apiUrl('/stock', { codes: state.customIndexCodes.join(',') }));
            if (!res.ok) throw new Error('请求失败 ' + res.status);
            var result = await res.json();
            if (!result.success || !result.data) throw new Error('数据异常');
            Object.keys(result.data).forEach(function (code) {
                var d = result.data[code];
                if (d && d.price !== '0.00') state.customIndexCache[code] = d;
            });
            if (result.time) {
                state.customIndexUpdateTime = result.time;
                persistCustomIndexUpdateTime(result.time);
            }
            persistCustomIndexCache();
            // 节流落盘 prev
            if (window.AppMarket && typeof window.AppMarket.persistIndexPrevIfDue === 'function'
                && typeof window.AppMarket.snapshotIndexPrice === 'function') {
                window.AppMarket.persistIndexPrevIfDue('custom', window.AppMarket.snapshotIndexPrice(result.data));
            }
            renderCustomIndex();
        } catch (e) {
            // 非交易时段拉取失败属正常,渲染缓存即可
            renderCustomIndex();
        }
    }

    async function loadSingleCustomIndex(code) {
        try {
            var res = await fetch(utils.apiUrl('/stock', { codes: code }));
            if (!res.ok) return;
            var result = await res.json();
            if (!result.success || !result.data) return;
            var d = result.data[code];
            if (d && d.price !== '0.00') state.customIndexCache[code] = d;
            if (result.time) {
                state.customIndexUpdateTime = result.time;
                persistCustomIndexUpdateTime(result.time);
            }
            persistCustomIndexCache();
            // 新增指数首屏拉一次时,直接给这个 code 写入 prev(等于自身,首渲染箭头为 '─')
            if (d && typeof d.priceValue === 'number'
                && window.AppMarket && typeof window.AppMarket.setIndexPrevForCode === 'function') {
                window.AppMarket.setIndexPrevForCode('custom', code, d.priceValue);
            }
            renderCustomIndex();
        } catch (e) { /* ignore */ }
    }

    // ============================================================
    // 非交易时段:补拉 stale 缓存
    // ============================================================

    function refreshStaleWatchQuotes() {
        var codes = getAllWatchCodes();
        if (codes.length === 0) return;

        var stale = codes.filter(function (c) { return !state.watchQuoteCache[c]; });
        if (stale.length === 0) return;

        var lastPull = 0;
        try { lastPull = parseInt(localStorage.getItem(KEYS.WATCH_REFRESH_THROTTLE_KEY) || '0', 10) || 0; } catch (e) {}
        if (Date.now() - lastPull < KEYS.WATCH_REFRESH_THROTTLE_MS) return;

        fetch(utils.apiUrl('/stock', { codes: stale.join(',') }))
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (result) {
                if (!result || !result.success || !result.data) return;
                Object.keys(result.data).forEach(function (code) {
                    var d = result.data[code];
                    if (d && d.price !== '0.00') state.watchQuoteCache[code] = d;
                });
                if (result.time) {
                    state.watchQuoteUpdateTime = result.time;
                    persistWatchQuoteUpdateTime(result.time);
                }
                persistWatchQuoteCache();
                renderWatchlist();
                try { localStorage.setItem(KEYS.WATCH_REFRESH_THROTTLE_KEY, String(Date.now())); } catch (e) {}
            })
            .catch(function () { /* 非交易时段拉取失败属正常,静默 */ });
    }

    // 自选指数版:复用同一个 5 分钟节流键
    function refreshStaleCustomIndex() {
        if (state.customIndexCodes.length === 0) return;
        var stale = state.customIndexCodes.filter(function (c) { return !state.customIndexCache[c]; });
        if (stale.length === 0) return;

        var lastPull = 0;
        try { lastPull = parseInt(localStorage.getItem(KEYS.WATCH_REFRESH_THROTTLE_KEY) || '0', 10) || 0; } catch (e) {}
        if (Date.now() - lastPull < KEYS.WATCH_REFRESH_THROTTLE_MS) return;

        fetch(utils.apiUrl('/stock', { codes: state.customIndexCodes.join(',') }))
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (result) {
                if (!result || !result.success || !result.data) return;
                Object.keys(result.data).forEach(function (code) {
                    var d = result.data[code];
                    if (d && d.price !== '0.00') state.customIndexCache[code] = d;
                });
                if (result.time) {
                    state.customIndexUpdateTime = result.time;
                    persistCustomIndexUpdateTime(result.time);
                }
                persistCustomIndexCache();
                renderCustomIndex();
            })
            .catch(function () { /* ignore */ });
    }

    window.AppWatchlist = {
        // tabs
        isFixedWatchTab: isFixedWatchTab,
        getWatchTabs: getWatchTabs,
        saveWatchTabs: saveWatchTabs,
        getActiveWatchTab: getActiveWatchTab,
        getWatchlist: getWatchlist,
        saveActiveWatchlist: saveActiveWatchlist,
        initWatchlistTabs: initWatchlistTabs,
        renderWatchTabs: renderWatchTabs,
        switchWatchTab: switchWatchTab,
        initWatchTabScroller: initWatchTabScroller,
        addWatchTab: addWatchTab,
        removeWatchTab: removeWatchTab,
        // import / export
        exportWatchlistData: exportWatchlistData,
        importWatchlistData: importWatchlistData,
        // add/remove
        resolveStockInput: resolveStockInput,
        addStockToWatchlist: addStockToWatchlist,
        removeStockFromWatchlist: removeStockFromWatchlist,
        getAllWatchCodes: getAllWatchCodes,
        getHoldingCodes: getHoldingCodes,
        isHoldingTab: isHoldingTab,
        // load + render
        loadWatchlistData: loadWatchlistData,
        loadSingleWatchQuote: loadSingleWatchQuote,
        renderWatchlist: renderWatchlist,
        renderWatchItem: renderWatchItem,
        renderCostCell: renderCostCell,
        saveWatchlistCost: saveWatchlistCost,
        persistWatchQuoteCache: persistWatchQuoteCache,
        persistWatchQuoteUpdateTime: persistWatchQuoteUpdateTime,
        persistCurrentChangePct: persistCurrentChangePct,
        getPrevChangePct: getPrevChangePct,
        // edit panel
        openWatchlistEditPanel: openWatchlistEditPanel,
        closeWatchlistEditPanel: closeWatchlistEditPanel,
        renderWatchlistEditRows: renderWatchlistEditRows,
        saveWatchlistEditPanel: saveWatchlistEditPanel,
        syncEditButtonLabel: syncEditButtonLabel,
        bindWatchRemove: bindWatchRemove,
        bindWatchItemClick: bindWatchItemClick,
        // modal
        showStockFundFlow: showStockFundFlow,
        renderStockFundFlowBody: renderStockFundFlowBody,
        closeStockFundFlow: closeStockFundFlow,
        initStockFundFlowModal: initStockFundFlowModal,
        // custom index
        renderCustomIndex: renderCustomIndex,
        renderCustomIndexItem: renderCustomIndexItem,
        bindCustomIndexRemove: bindCustomIndexRemove,
        bindCustomIndexAdd: bindCustomIndexAdd,
        openCustomIndexAddForm: openCustomIndexAddForm,
        addCustomIndexByInput: addCustomIndexByInput,
        removeCustomIndex: removeCustomIndex,
        loadCustomIndexData: loadCustomIndexData,
        loadSingleCustomIndex: loadSingleCustomIndex,
        saveCustomIndices: saveCustomIndices,
        persistCustomIndexCache: persistCustomIndexCache,
        persistCustomIndexUpdateTime: persistCustomIndexUpdateTime,
        // non-trading stale refresh
        refreshStaleWatchQuotes: refreshStaleWatchQuotes,
        refreshStaleCustomIndex: refreshStaleCustomIndex,
        // status helpers
        showWatchStatus: showWatchStatus,
        showCustomIndexStatus: showCustomIndexStatus,
        showDataStatus: showDataStatus,
    };
})();