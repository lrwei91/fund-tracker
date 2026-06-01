// ================================================================
// 资产总览 — App
// ================================================================

// ---------- State ----------
let refreshIntervalMain = null;   // 大盘指数 + 自选股
let refreshIntervalSignal = null; // 资金流 + 板块
let refreshIntervalNews = null;   // 财经新闻
let isAutoRefresh = true;
let refreshSecondsMain = 10;
let refreshSecondsSignal = 1800;
let refreshSecondsNews = 60;
let currentTab = 'dashboard';
let activeWatchTabId = 'default';
const API_BASE = '/api';
const VALID_TABS = ['dashboard', 'signals', 'news'];
const TAB_TITLES = { dashboard: '资产总览', signals: '市场信号', news: '财经快讯' };
const SETTINGS_KEY = 'fund_tracker_settings';
const ACTIVE_TAB_KEY = 'fund_tracker_active_main_tab';
const NEWS_SOURCE_KEY = 'fund_tracker_news_source';
const COLLAPSE_STATE_KEY = 'fund_tracker_collapse_state';
const SECTOR_TAB_KEY = 'fund_tracker_sector_tab';
const SHORT_CACHE_KEYS = {
    index: 'fund_tracker_index_cache',
    capital: 'fund_tracker_capital_cache',
    sector: 'fund_tracker_sector_cache',
    newsJin10: 'fund_tracker_news_jin10_cache',
    newsEastmoney: 'fund_tracker_news_eastmoney_cache',
};
const SHORT_CACHE_TTL = {
    index: 30 * 1000,
    capital: 5 * 60 * 1000,
    sector: 5 * 60 * 1000,
    news: 5 * 60 * 1000,
};
const MULTIDAY_FLOW_CACHE_KEY = 'fund_tracker_multiday_flow_cache';
const DRAGON_TIGER_CACHE_KEY = 'fund_tracker_dragon_tiger_cache';
const LOCKUP_CACHE_KEY = 'fund_tracker_lockup_cache';

// 实时数据缓存
let liveIndexData = null;
let liveCapitalData = null;
let liveSectorData = null;
let watchQuoteCache = {};
let watchQuoteUpdateTime = '';
let hasInitialDataLoaded = false;

// ---------- Tab Routing ----------
function initTabs() {
    var buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            switchTab(btn.getAttribute('data-tab'));
        });
    });

    // Listen to hash changes for back/forward navigation
    window.addEventListener('hashchange', handleHash);

    // Handle initial hash
    handleHash();
}

function handleHash() {
    var hash = window.location.hash.replace('#', '');
    var savedTab = localStorage.getItem(ACTIVE_TAB_KEY);
    var tab = VALID_TABS.includes(hash) ? hash : (VALID_TABS.includes(savedTab) ? savedTab : 'dashboard');
    switchTab(tab, false);
}

function switchTab(tab, updateHash) {
    if (!VALID_TABS.includes(tab)) return;
    currentTab = tab;
    try { localStorage.setItem(ACTIVE_TAB_KEY, tab); } catch (e) {}

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
        panel.classList.toggle('active', panel.id === 'tab-' + tab);
    });

    // Update header title
    document.getElementById('header-title').textContent = TAB_TITLES[tab] || '资产总览';

    // Update URL hash
    if (updateHash !== false) {
        window.location.hash = tab === 'dashboard' ? '' : '#' + tab;
    }

    // Load tab-specific data when switching panels.
    if (tab === 'signals') {
        loadMultiDayFlowData();
        loadDragonTigerData();
        loadLockupData();
    }
    if (tab === 'news') loadNewsData();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', function () {
    loadSettings();
    initTabs();
    initCollapsible();
    initSectorTabs();
    initWatchlistTabs();
    initNewsSourceTabs();
    initSettings();
    syncSettingsControls();
    initDataPanel();
    bindEvents();
    initAutoRefresh();
    loadAllData();
});

// ---------- Collapsible Sections ----------
function initCollapsible() {
    document.querySelectorAll('.card[data-collapsible="true"]').forEach(function (card) {
        var header = card.querySelector('.card-header');
        var body = card.querySelector('.card-body');
        var state = readJson(COLLAPSE_STATE_KEY, {});
        var key = getCollapsibleKey(card);
        var isCollapsed = Object.prototype.hasOwnProperty.call(state, key) ?
            state[key] === true :
            card.getAttribute('data-collapsed') === 'true';

        if (isCollapsed) {
            card.setAttribute('data-collapsed', 'true');
            body.style.display = 'none';
        } else {
            card.setAttribute('data-collapsed', 'false');
            body.style.display = '';
        }

        header.addEventListener('click', function () {
            var collapsed = card.getAttribute('data-collapsed') === 'true';
            if (collapsed) {
                card.setAttribute('data-collapsed', 'false');
                body.style.display = '';
                saveCollapsibleState(card, false);
            } else {
                card.setAttribute('data-collapsed', 'true');
                body.style.display = 'none';
                saveCollapsibleState(card, true);
            }
        });
    });
}

function getCollapsibleKey(card) {
    return card.className.split(/\s+/).filter(function (name) {
        return name !== 'card' && name.indexOf('-section') > -1;
    })[0] || card.querySelector('h2').textContent.trim();
}

function saveCollapsibleState(card, collapsed) {
    var state = readJson(COLLAPSE_STATE_KEY, {});
    state[getCollapsibleKey(card)] = collapsed;
    writeJson(COLLAPSE_STATE_KEY, state);
}

// ---------- Sector Tabs ----------
function initSectorTabs() {
    var savedTarget = localStorage.getItem(SECTOR_TAB_KEY);
    if (savedTarget) activateSectorTab(savedTarget);

    var tabs = document.querySelectorAll('.sector-tab');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.getAttribute('data-tab');
            activateSectorTab(target);
            try { localStorage.setItem(SECTOR_TAB_KEY, target); } catch (e) {}
        });
    });
}

function activateSectorTab(target) {
    var tab = document.querySelector('.sector-tab[data-tab="' + target + '"]');
    if (!tab) return;
    var parent = tab.parentElement;
    parent.querySelectorAll('.sector-tab').forEach(function (t) { t.classList.remove('active'); });
    tab.classList.add('active');

    var container = tab.closest('.card-body');
    container.querySelectorAll('.sector-panel').forEach(function (p) { p.classList.remove('active'); });
    var panel = container.querySelector('#sector-panel-' + target);
    if (panel) panel.classList.add('active');
}

// ---------- News Source Tabs (金十/东财) ----------
var currentNewsSource = localStorage.getItem(NEWS_SOURCE_KEY) || 'jin10';

function initNewsSourceTabs() {
    if (!['jin10', 'eastmoney'].includes(currentNewsSource)) currentNewsSource = 'jin10';
    var tabs = document.querySelectorAll('.news-source-tab');
    tabs.forEach(function (tab) {
        tab.classList.toggle('active', tab.getAttribute('data-source') === currentNewsSource);
    });
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var parent = tab.parentElement;
            parent.querySelectorAll('.news-source-tab').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            currentNewsSource = tab.getAttribute('data-source');
            try { localStorage.setItem(NEWS_SOURCE_KEY, currentNewsSource); } catch (e) {}
            loadNewsData();
        });
    });
}

// ---------- Settings ----------
function normalizeOptionValue(value, allowedValues, fallback) {
    var stringValue = String(value);
    return allowedValues.includes(stringValue) ? stringValue : String(fallback);
}

function getSettingsControls() {
    return {
        autoRefresh: document.getElementById('auto-refresh-toggle'),
        mainInterval: document.getElementById('refresh-interval-main'),
        signalInterval: document.getElementById('refresh-interval-signal'),
        newsInterval: document.getElementById('refresh-interval-news'),
    };
}

function readSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

function loadSettings() {
    var saved = readSettings();
    isAutoRefresh = typeof saved.autoRefresh === 'boolean' ? saved.autoRefresh : isAutoRefresh;
    refreshSecondsMain = parseInt(normalizeOptionValue(saved.mainInterval, ['10', '30', '60'], refreshSecondsMain), 10);
    refreshSecondsSignal = parseInt(normalizeOptionValue(saved.signalInterval, ['900', '1800', '3600', '7200'], refreshSecondsSignal), 10);
    refreshSecondsNews = parseInt(normalizeOptionValue(saved.newsInterval, ['60', '600', '1800'], refreshSecondsNews), 10);
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            autoRefresh: isAutoRefresh,
            mainInterval: refreshSecondsMain,
            signalInterval: refreshSecondsSignal,
            newsInterval: refreshSecondsNews,
        }));
    } catch (e) {}
}

function syncSettingsControls() {
    var controls = getSettingsControls();
    if (controls.autoRefresh) controls.autoRefresh.checked = isAutoRefresh;
    if (controls.mainInterval) controls.mainInterval.value = String(refreshSecondsMain);
    if (controls.signalInterval) controls.signalInterval.value = String(refreshSecondsSignal);
    if (controls.newsInterval) controls.newsInterval.value = String(refreshSecondsNews);
}

function initSettings() {
    var overlay = document.getElementById('settings-overlay');
    var panel = document.getElementById('settings-panel');
    var openBtn = document.getElementById('settings-btn');
    var closeBtn = document.getElementById('settings-close');

    function openSettings() {
        overlay.classList.add('open');
        panel.classList.add('open');
    }

    function closeSettings() {
        overlay.classList.remove('open');
        panel.classList.remove('open');
    }

    openBtn.addEventListener('click', openSettings);
    closeBtn.addEventListener('click', closeSettings);
    overlay.addEventListener('click', closeSettings);
}

function initDataPanel() {
    var overlay = document.getElementById('data-overlay');
    var panel = document.getElementById('data-panel');
    var openBtn = document.getElementById('watchlist-data-btn');
    var closeBtn = document.getElementById('data-close');
    var exportBtn = document.getElementById('export-watchlist-btn');
    var importBtn = document.getElementById('import-watchlist-btn');
    var fileInput = document.getElementById('import-watchlist-file');

    function openPanel() {
        overlay.classList.add('open');
        panel.classList.add('open');
    }

    function closePanel() {
        overlay.classList.remove('open');
        panel.classList.remove('open');
    }

    openBtn.addEventListener('click', openPanel);
    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
    exportBtn.addEventListener('click', exportWatchlistData);
    importBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', importWatchlistData);
}

// ---------- Status Bar ----------

// ---------- Events ----------
function bindEvents() {
    document.getElementById('auto-refresh-toggle').addEventListener('change', function (e) {
        isAutoRefresh = e.target.checked;
        saveSettings();
        if (isAutoRefresh) { startAllAutoRefresh(); } else { stopAllAutoRefresh(); }
    });

    document.getElementById('refresh-interval-main').addEventListener('change', function (e) {
        refreshSecondsMain = parseInt(e.target.value);
        saveSettings();
        if (isAutoRefresh) { startMainAutoRefresh(); }
    });

    document.getElementById('refresh-interval-signal').addEventListener('change', function (e) {
        refreshSecondsSignal = parseInt(e.target.value);
        saveSettings();
        if (isAutoRefresh) { startSignalAutoRefresh(); }
    });

    document.getElementById('refresh-interval-news').addEventListener('change', function (e) {
        refreshSecondsNews = parseInt(e.target.value);
        saveSettings();
        if (isAutoRefresh) { startNewsAutoRefresh(); }
    });

    document.getElementById('add-stock-btn').addEventListener('click', addStockToWatchlist);
    document.getElementById('add-watch-tab-btn').addEventListener('click', addWatchTab);
    document.getElementById('stock-code-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') addStockToWatchlist();
    });
}

function apiUrl(path, params) {
    var query = new URLSearchParams(params || {});
    query.set('_t', Date.now().toString());
    return API_BASE + path + '?' + query.toString();
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderEmpty(message) {
    return '<div class="empty-state">' + escapeHtml(message) + '</div>';
}

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

function readTimedCache(key, ttlMs) {
    var cached = readJson(key, null);
    if (!cached || !cached.data || !cached.updatedAt) return null;
    if (Date.now() - cached.updatedAt > ttlMs) return null;
    return cached.data;
}

function writeTimedCache(key, data) {
    writeJson(key, { data: data, updatedAt: Date.now() });
}

function setLastUpdated(label) {
    var el = document.getElementById('last-updated');
    if (!el) return;
    var now = new Date();
    var time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.textContent = (label || '已更新') + ' · ' + time;
}

function getShanghaiNow() {
    var parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date()).reduce(function (acc, part) {
        acc[part.type] = part.value;
        return acc;
    }, {});
    var weekday = parts.weekday || '';
    var hour = parseInt(parts.hour || '0', 10);
    var minute = parseInt(parts.minute || '0', 10);
    return { weekday: weekday, minutes: hour * 60 + minute };
}

function isTradingWeekday(weekday) {
    return ['周一', '周二', '周三', '周四', '周五', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
}

function isIntradayRefreshWindow() {
    var now = getShanghaiNow();
    if (!isTradingWeekday(now.weekday)) return false;
    return (now.minutes >= 9 * 60 + 15 && now.minutes <= 11 * 60 + 30) ||
        (now.minutes >= 13 * 60 && now.minutes <= 15 * 60 + 5);
}

function isAfterCloseDailyWindow() {
    var now = getShanghaiNow();
    if (!isTradingWeekday(now.weekday)) return false;
    return now.minutes >= 16 * 60 && now.minutes <= 21 * 60;
}

function isAfterCloseForDailyUpdate() {
    var now = getShanghaiNow();
    if (!isTradingWeekday(now.weekday)) return false;
    return now.minutes >= 16 * 60;
}

function getShanghaiDateKey() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function loadIntradayData() {
    loadIndexData();
    loadWatchlistData();
}

function loadIntradaySignalData() {
    loadCapitalData();
    loadSectorData();
}

function loadAfterCloseDailyData() {
    loadDragonTigerData();
    loadLockupData();
}

function refreshDataByMarketPhase() {
    if (isIntradayRefreshWindow()) {
        loadIntradayData();
        loadIntradaySignalData();
        return;
    }

    if (isAfterCloseDailyWindow()) {
        loadAfterCloseDailyData();
        setLastUpdated('收盘后仅更新日级数据');
        return;
    }

    if (!hasInitialDataLoaded) {
        loadAllData();
    } else {
        setLastUpdated('非交易时段暂停行情刷新');
    }
}

// ---------- Auto Refresh ----------
function initAutoRefresh() {
    if (isAutoRefresh) startAllAutoRefresh();
}

function startAllAutoRefresh() {
    startMainAutoRefresh();
    startSignalAutoRefresh();
    startNewsAutoRefresh();
}

function stopAllAutoRefresh() {
    stopMainAutoRefresh();
    stopSignalAutoRefresh();
    stopNewsAutoRefresh();
}

function startMainAutoRefresh() {
    stopMainAutoRefresh();
    refreshIntervalMain = setInterval(function () {
        if (isIntradayRefreshWindow()) {
            loadIndexData();
            loadWatchlistData();
        }
    }, refreshSecondsMain * 1000);
}

function stopMainAutoRefresh() {
    if (refreshIntervalMain) { clearInterval(refreshIntervalMain); refreshIntervalMain = null; }
}

function startSignalAutoRefresh() {
    stopSignalAutoRefresh();
    refreshIntervalSignal = setInterval(function () {
        if (isIntradayRefreshWindow()) {
            loadIntradaySignalData();
        }
    }, refreshSecondsSignal * 1000);
}

function stopSignalAutoRefresh() {
    if (refreshIntervalSignal) { clearInterval(refreshIntervalSignal); refreshIntervalSignal = null; }
}

function startNewsAutoRefresh() {
    stopNewsAutoRefresh();
    refreshIntervalNews = setInterval(function () {
        if (currentTab === 'news') loadNewsData();
    }, refreshSecondsNews * 1000);
}

function stopNewsAutoRefresh() {
    if (refreshIntervalNews) { clearInterval(refreshIntervalNews); refreshIntervalNews = null; }
}

// ---------- Load All ----------
function loadAllData() {
    loadIntradayData();
    loadIntradaySignalData();
    loadAfterCloseDailyData();
    loadMultiDayFlowData();
    hasInitialDataLoaded = true;
    // News is loaded on tab switch
    if (currentTab === 'news') loadNewsData();
}


// ---------- 大盘指数 ----------
// 指数中文名映射（腾讯API返回的代码不是中文）
var INDEX_NAMES = {
    shangzhi: '上证指数',
    shengzheng: '深证成指',
    chuangye: '创业板指',
    zhuanke50: '科创50',
};

function updateIndexUI(id, data) {
    if (!data) return;
    var v = document.getElementById(id + '-value');
    var c = document.getElementById(id + '-change');
    var n = document.querySelector('[data-index="' + id + '"] .index-name');
    if (!v || !c) return;
    v.textContent = data.value;
    c.textContent = data.change;
    if (n) n.textContent = INDEX_NAMES[id] || data.name;
    v.className = 'index-value';
    c.className = 'index-change';
    var cls = data.changePercent > 0 ? 'positive' : data.changePercent < 0 ? 'negative' : 'neutral';
    v.classList.add(cls);
    c.classList.add(cls);
}

async function loadIndexData() {
    var cached = readTimedCache(SHORT_CACHE_KEYS.index, SHORT_CACHE_TTL.index);
    if (cached) {
        liveIndexData = cached;
        Object.keys(cached).forEach(function (id) { updateIndexUI(id, cached[id]); });
        return;
    }

    try {
        var res = await fetch(apiUrl('/market-data', { type: 'index' }));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var result = await res.json();
        if (!result.success || !result.data) throw new Error('数据异常');
        liveIndexData = result.data;
        writeTimedCache(SHORT_CACHE_KEYS.index, result.data);
        Object.keys(result.data).forEach(function (id) { updateIndexUI(id, result.data[id]); });
        setLastUpdated('行情已更新');
    } catch (e) {
        if (!liveIndexData) setLastUpdated('行情获取失败');
    }
}

// ---------- 资金流向 ----------
async function loadCapitalData() {
    var newData = null;
    var cached = readTimedCache(SHORT_CACHE_KEYS.capital, SHORT_CACHE_TTL.capital);
    if (cached) {
        newData = cached;
    }

    try {
        if (!newData) {
            var res = await fetch(apiUrl('/market-data', { type: 'capital' }));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var result = await res.json();
            if (result.success && result.data && result.data.mainFund && result.data.mainFund.value !== undefined) {
                newData = result.data;
                writeTimedCache(SHORT_CACHE_KEYS.capital, result.data);
            }
        }
    } catch (e) {
        newData = cached || null;
    }

    if (newData) {
        liveCapitalData = newData;
    }

    var cap = liveCapitalData;
    if (!cap) return;
    var mf = document.getElementById('main-fund-value');
    var nf = document.getElementById('north-fund-value');
    if (mf) {
        mf.textContent = cap.mainFund.value;
        mf.className = 'capital-value';
        if (typeof cap.mainFund.isPositive === 'boolean') {
            mf.classList.add(cap.mainFund.isPositive ? 'positive' : 'negative');
        }
    }
    if (nf) {
        nf.textContent = cap.northFund.value;
        nf.className = 'capital-value';
        if (typeof cap.northFund.isPositive === 'boolean') {
            nf.classList.add(cap.northFund.isPositive ? 'positive' : 'negative');
        }
    }
}

// ---------- 板块排行 ----------
async function loadSectorData() {
    var newData = null;
    var cached = readTimedCache(SHORT_CACHE_KEYS.sector, SHORT_CACHE_TTL.sector);
    if (cached) {
        newData = cached;
    }

    try {
        if (!newData) {
            var res = await fetch(apiUrl('/market-data', { type: 'sector' }));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var result = await res.json();
            if (result.success && result.data && result.data.inflow) {
                newData = result.data;
                writeTimedCache(SHORT_CACHE_KEYS.sector, result.data);
            }
        }
    } catch (e) {
        newData = cached || null;
    }

    if (newData) {
        liveSectorData = newData;
    }

    var sectors = liveSectorData;
    if (!sectors) return;
    var inflow = document.getElementById('inflow-sectors');
    var outflow = document.getElementById('outflow-sectors');
    if (inflow) {
        inflow.innerHTML = (sectors.inflow || []).slice(0, 5).map(function (s) {
            return '<li><span class="sector-name">' + escapeHtml(s.name) + '</span><span class="sector-amount positive">' + escapeHtml(s.value) + '</span></li>';
        }).join('') || '<li class="list-empty">暂无可靠真实流入数据</li>';
    }
    if (outflow) {
        outflow.innerHTML = (sectors.outflow || []).slice(0, 5).map(function (s) {
            return '<li><span class="sector-name">' + escapeHtml(s.name) + '</span><span class="sector-amount negative">' + escapeHtml(s.value) + '</span></li>';
        }).join('') || '<li class="list-empty">暂无可靠真实流出数据</li>';
    }
}

// ---------- 多日资金流向 ----------
async function loadMultiDayFlowData() {
    var todayKey = getShanghaiDateKey();
    var cached = readMultiDayFlowCache();

    function renderTable(id, sectors, trendUp) {
        var table = document.getElementById(id);
        if (!table) return;
        table.innerHTML = '<tr><th>板块</th>' + flow.dates.map(function (d) { return '<th>' + escapeHtml(d) + '</th>'; }).join('') + '<th>趋势</th></tr>';
        sectors.forEach(function (s) {
            var rowClass = s.consecutiveDays >= 3 ? (trendUp ? 'hot-sector' : 'cold-sector') : '';
            var html = '';
            html += '<td class="sector-name-cell">' + escapeHtml(s.name) + '</td>';
            s.data.forEach(function (v) { html += '<td class="' + (v[0] === '+' ? 'flow-positive' : 'flow-negative') + '">' + escapeHtml(v) + '</td>'; });
            var badge = s.consecutiveDays >= 3 ? '<span class="consecutive-badge' + (trendUp ? '' : ' outflow') + '">连续' + s.consecutiveDays + '日</span>' : '';
            table.innerHTML += '<tr class="' + rowClass + '">' + html + '<td class="trend-cell">' + (s.trend === 'up' ? '↗' : '↘') + ' ' + badge + '</td></tr>';
        });
    }

    function renderTableMessage(id, message) {
        var table = document.getElementById(id);
        if (!table) return;
        table.innerHTML = '<tr><td class="list-empty">' + escapeHtml(message) + '</td></tr>';
    }

    function renderFlow(flow) {
        if (!(flow.inflowSectors || []).length && !(flow.outflowSectors || []).length) {
            renderTableMessage('multiday-inflow', '暂无可靠真实多日资金数据');
            renderTableMessage('multiday-outflow', '暂无可靠真实多日资金数据');
            return;
        }
        renderTable('multiday-inflow', flow.inflowSectors || [], true);
        renderTable('multiday-outflow', flow.outflowSectors || [], false);
    }

    if (cached && cached.date === todayKey && cached.data) {
        renderFlow(cached.data);
        return;
    }

    if (!isAfterCloseForDailyUpdate()) {
        if (cached && cached.data) {
            renderFlow(cached.data);
            return;
        }
        renderTableMessage('multiday-inflow', '收盘后更新');
        renderTableMessage('multiday-outflow', '收盘后更新');
        return;
    }

    try {
        var res = await fetch(apiUrl('/market-data', { type: 'multiday-flow' }));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var result = await res.json();
        if (!result.success || !result.data || !result.data.dates) throw new Error('数据异常');
        var flow = result.data;
        writeMultiDayFlowCache(todayKey, flow);
        renderFlow(flow);
    } catch (e) {
        if (cached && cached.data) {
            renderFlow(cached.data);
            return;
        }
        renderTableMessage('multiday-inflow', '暂无可靠真实多日资金数据');
        renderTableMessage('multiday-outflow', '暂无可靠真实多日资金数据');
    }
}

function readMultiDayFlowCache() {
    try {
        return JSON.parse(localStorage.getItem(MULTIDAY_FLOW_CACHE_KEY) || 'null');
    } catch (e) {
        return null;
    }
}

function writeMultiDayFlowCache(date, data) {
    try {
        localStorage.setItem(MULTIDAY_FLOW_CACHE_KEY, JSON.stringify({
            date: date,
            data: data,
            updatedAt: new Date().toISOString(),
        }));
    } catch (e) {
        // Ignore storage failures; the live data has already rendered.
    }
}

// ---------- 龙虎榜 ----------
async function loadDragonTigerData() {
    var container = document.getElementById('dragon-tiger-list');
    var dateEl = document.getElementById('dragon-tiger-date');
    if (!container) return;
    var todayKey = getShanghaiDateKey();
    var cached = readDailyDataCache(DRAGON_TIGER_CACHE_KEY);

    function renderDragonTiger(data) {
        if (!data || !data.stocks || data.stocks.length === 0) {
            container.innerHTML = renderEmpty('暂无龙虎榜数据');
            return;
        }

        var stocks = data.stocks.slice(0, 20);
        if (dateEl) dateEl.textContent = data.date || '';

        var html = '';
        stocks.forEach(function (s) {
            var netYi = (s.netBuyWan || 0) / 10000;
            var netCls = netYi > 0 ? 'positive' : netYi < 0 ? 'negative' : '';
            var netStr = netYi >= 0 ? '+' + netYi.toFixed(2) + '亿' : netYi.toFixed(2) + '亿';
            html += '<div class="dragon-tiger-item">';
            html += '  <div class="dragon-tiger-stock"><div class="dragon-tiger-stock-name">' + escapeHtml(s.name) + '</div><div class="dragon-tiger-stock-code">' + escapeHtml(s.code) + '</div></div>';
            html += '  <span class="dragon-tiger-reason" title="' + escapeHtml(s.reason) + '">' + escapeHtml(s.reason) + '</span>';
            html += '  <span class="dragon-tiger-net ' + netCls + '">' + escapeHtml(netStr) + '</span>';
            html += '</div>';
        });
        if (html) container.innerHTML = html;
    }

    if (cached && cached.date === todayKey && cached.data) {
        renderDragonTiger(cached.data);
        return;
    }

    if (!isAfterCloseForDailyUpdate()) {
        if (cached && cached.data) {
            renderDragonTiger(cached.data);
            return;
        }
        container.innerHTML = renderEmpty('收盘后更新');
        if (dateEl) dateEl.textContent = '';
        return;
    }

    try {
        var res = await fetch(apiUrl('/dragon-tiger'));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();

        if (!json.success || !json.data) throw new Error('数据异常');
        writeDailyDataCache(DRAGON_TIGER_CACHE_KEY, todayKey, json.data);
        renderDragonTiger(json.data);
    } catch (e) {
        console.error('龙虎榜获取失败:', e);
        if (cached && cached.data) {
            renderDragonTiger(cached.data);
            return;
        }
        container.innerHTML = renderEmpty('龙虎榜加载失败');
    }
}

// ---------- 限售解禁 ----------
async function loadLockupData() {
    var container = document.getElementById('lockup-list');
    if (!container) return;
    var todayKey = getShanghaiDateKey();
    var cached = readDailyDataCache(LOCKUP_CACHE_KEY);

    function renderLockup(data) {
        if (!data || !data.items || data.items.length === 0) {
            container.innerHTML = renderEmpty('暂无解禁数据');
            return;
        }

        var items = data.items.slice(0, 15);
        var html = '';
        items.forEach(function (item) {
            var ratioStr = (parseFloat(item.ratio) * 100).toFixed(2) + '%';
            html += '<div class="lockup-item">';
            html += '  <div class="lockup-stock-info"><div class="lockup-stock-name">' + escapeHtml(item.name || item.code) + '</div><div class="lockup-stock-code">' + escapeHtml(item.code) + '</div></div>';
            html += '  <span class="lockup-type" title="' + escapeHtml(item.type) + '">' + escapeHtml(item.type) + '</span>';
            html += '  <span class="lockup-date">' + escapeHtml(item.date) + '</span>';
            html += '  <span class="lockup-ratio">' + escapeHtml(ratioStr) + '</span>';
            html += '</div>';
        });
        if (html) container.innerHTML = html;
    }

    if (cached && cached.date === todayKey && cached.data) {
        renderLockup(cached.data);
        return;
    }

    if (!isAfterCloseForDailyUpdate()) {
        if (cached && cached.data) {
            renderLockup(cached.data);
            return;
        }
        container.innerHTML = renderEmpty('收盘后更新');
        return;
    }

    try {
        var res = await fetch(apiUrl('/lockup'));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();

        if (!json.success || !json.data) throw new Error('数据异常');
        writeDailyDataCache(LOCKUP_CACHE_KEY, todayKey, json.data);
        renderLockup(json.data);
    } catch (e) {
        console.error('限售解禁获取失败:', e);
        if (cached && cached.data) {
            renderLockup(cached.data);
            return;
        }
        container.innerHTML = renderEmpty('解禁数据加载失败');
    }
}

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

// ---------- 自选股 ----------
const STORAGE_KEY = 'fund_tracker_watchlist';
const WATCH_TABS_KEY = 'fund_tracker_watchlist_tabs';
const ACTIVE_WATCH_TAB_KEY = 'fund_tracker_active_watch_tab';
const PREV_KEY = 'fund_tracker_prev_pct';

function getPrevChangePct() {
    try { return JSON.parse(localStorage.getItem(PREV_KEY)) || {}; } catch (e) { return {}; }
}
function savePrevChangePct(map) {
    try { localStorage.setItem(PREV_KEY, JSON.stringify(map)); } catch (e) {} }
function trendArrow(current, prev) {
    if (prev === undefined || prev === null) return '→';
    if (current > prev) return '↑';
    if (current < prev) return '↓';
    return '→';
}

function sanitizeCodes(codes) {
    return Array.isArray(codes)
        ? codes.filter(function (code, index, arr) { return /^\d{6}$/.test(code) && arr.indexOf(code) === index; })
        : [];
}

function getLegacyWatchlist() {
    try {
        var data = localStorage.getItem(STORAGE_KEY);
        var parsed = data ? JSON.parse(data) : [];
        return sanitizeCodes(parsed);
    } catch (e) { return []; }
}

function defaultWatchTabs() {
    return [{ id: 'default', name: '持仓股', codes: getLegacyWatchlist() }];
}

function normalizeWatchTabName(name, index) {
    if (!name || name === '自选') return index === 0 ? '持仓股' : '分组' + (index + 1);
    return name;
}

function getWatchTabs() {
    try {
        var data = localStorage.getItem(WATCH_TABS_KEY);
        var parsed = data ? JSON.parse(data) : null;
        if (!Array.isArray(parsed) || parsed.length === 0) return defaultWatchTabs();
        return parsed.map(function (tab, index) {
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
        localStorage.setItem(WATCH_TABS_KEY, JSON.stringify(cleanTabs));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanTabs[0] ? cleanTabs[0].codes : []));
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
    var el = document.getElementById('data-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'watchlist-status data-status' + (type === 'error' ? ' error' : '');
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
            activeWatchTabId = tabs[0].id;
            localStorage.setItem(ACTIVE_WATCH_TAB_KEY, activeWatchTabId);
            watchQuoteCache = {};
            watchQuoteUpdateTime = '';
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

function getActiveWatchTab() {
    var tabs = getWatchTabs();
    var savedId = localStorage.getItem(ACTIVE_WATCH_TAB_KEY);
    var tab = tabs.find(function (item) { return item.id === (activeWatchTabId || savedId); }) ||
        tabs.find(function (item) { return item.id === savedId; }) ||
        tabs[0];
    activeWatchTabId = tab.id;
    return tab;
}

function getWatchlist() {
    return getActiveWatchTab().codes;
}

function saveActiveWatchlist(codes) {
    var tabs = getWatchTabs();
    var tab = tabs.find(function (item) { return item.id === activeWatchTabId; }) || tabs[0];
    tab.codes = sanitizeCodes(codes);
    saveWatchTabs(tabs);
}

function initWatchlistTabs() {
    var savedId = localStorage.getItem(ACTIVE_WATCH_TAB_KEY);
    activeWatchTabId = savedId || 'default';
    renderWatchTabs();
    initWatchTabScroller();
}

function renderWatchTabs() {
    var container = document.getElementById('watchlist-tabs');
    if (!container) return;
    var tabs = getWatchTabs();
    if (!tabs.some(function (tab) { return tab.id === activeWatchTabId; })) activeWatchTabId = tabs[0].id;
    container.innerHTML = tabs.map(function (tab) {
        var isActive = tab.id === activeWatchTabId;
        var removable = tabs.length > 1;
        return '<button class="watchlist-tab' + (isActive ? ' active' : '') + '" data-watch-tab="' + escapeHtml(tab.id) + '" type="button">' +
            '<span>' + escapeHtml(tab.name) + '</span>' +
            (removable ? '<span class="watchlist-tab-remove" data-remove-watch-tab="' + escapeHtml(tab.id) + '" aria-label="删除分组">×</span>' : '') +
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
    if (!tabId || tabId === activeWatchTabId) return;
    activeWatchTabId = tabId;
    localStorage.setItem(ACTIVE_WATCH_TAB_KEY, activeWatchTabId);
    renderWatchTabs();
    renderWatchlist();
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
    activeWatchTabId = id;
    localStorage.setItem(ACTIVE_WATCH_TAB_KEY, id);
    saveWatchTabs(tabs);
    renderWatchTabs();
    renderWatchlist();
}

function removeWatchTab(tabId) {
    var tabs = getWatchTabs();
    if (tabs.length <= 1) {
        showWatchStatus('至少保留一个分组', 'error');
        return;
    }
    var target = tabs.find(function (tab) { return tab.id === tabId; });
    if (!target) return;
    if (!window.confirm('删除分组“' + target.name + '”？分组内股票也会移除。')) return;
    var nextTabs = tabs.filter(function (tab) { return tab.id !== tabId; });
    if (activeWatchTabId === tabId) {
        activeWatchTabId = nextTabs[0].id;
        localStorage.setItem(ACTIVE_WATCH_TAB_KEY, activeWatchTabId);
    }
    saveWatchTabs(nextTabs);
    renderWatchTabs();
    renderWatchlist();
    showWatchStatus('分组已删除');
}

async function resolveStockInput(input) {
    var value = input.trim();
    if (/^\d{6}$/.test(value)) return { code: value, name: '' };

    var res = await fetch(apiUrl('/stock-search', { q: value }));
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
        renderWatchTabs();
        showWatchStatus((match.name || code) + ' 已添加');
        renderWatchlist();
        loadSingleWatchQuote(code);
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
    renderWatchTabs();
    renderWatchlist();
    showWatchStatus('已移除');
}

function showWatchStatus(msg, type) {
    var grid = document.getElementById('watchlist-grid');
    var el = document.querySelector('.watchlist-status');
    if (!el) {
        el = document.createElement('div');
        el.className = 'watchlist-status';
        grid.parentNode.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'watchlist-status' + (type === 'error' ? ' error' : '');
    setTimeout(function () { if (el.textContent === msg) { el.textContent = ''; el.className = 'watchlist-status'; } }, 2500);
}

function getAllWatchCodes() {
    return sanitizeCodes(getWatchTabs().flatMap(function (tab) { return tab.codes || []; }));
}

function renderWatchlist() {
    var grid = document.getElementById('watchlist-grid');
    var updateTimeEl = document.getElementById('watchlist-update-time');
    var codes = getWatchlist();
    var activeTab = getActiveWatchTab();
    if (codes.length === 0) {
        grid.innerHTML = '<div class="watchlist-empty">“' + escapeHtml(activeTab.name) + '”暂无股票</div>';
        if (updateTimeEl) updateTimeEl.textContent = '';
        return;
    }

    grid.innerHTML = codes.map(function (code) {
        var data = watchQuoteCache[code];
        return renderWatchItem(
            code,
            data ? data.name : code + '（待刷新）',
            data ? data.price : '--',
            data ? data.changePercent : 0,
            data ? data.volume : '--',
        );
    }).join('');
    bindWatchRemove();
    if (updateTimeEl) updateTimeEl.textContent = watchQuoteUpdateTime || '';
}

async function loadWatchlistData() {
    var updateTimeEl = document.getElementById('watchlist-update-time');
    var codes = getAllWatchCodes();
    if (codes.length === 0) {
        renderWatchlist();
        return;
    }

    try {
        var res = await fetch(apiUrl('/stock', { codes: codes.join(',') }));
        if (!res.ok) throw new Error('请求失败 ' + res.status);
        var result = await res.json();
        if (!result.success || !result.data) throw new Error('数据异常');

        Object.keys(result.data).forEach(function (code) {
            var d = result.data[code];
            if (d && d.price !== '0.00') watchQuoteCache[code] = d;
        });

        if (result.time) {
            watchQuoteUpdateTime = result.time;
            if (updateTimeEl) updateTimeEl.textContent = result.time;
        }
        renderWatchlist();
    } catch (e) {
        console.error('自选股失败:', e);
        showWatchStatus('自选股行情加载失败', 'error');
        renderWatchlist();
    }
}

async function loadSingleWatchQuote(code) {
    var updateTimeEl = document.getElementById('watchlist-update-time');
    try {
        var res = await fetch(apiUrl('/stock', { codes: code }));
        if (!res.ok) throw new Error('请求失败 ' + res.status);
        var result = await res.json();
        if (!result.success || !result.data) throw new Error('数据异常');
        var data = result.data[code];
        if (data && data.price !== '0.00') watchQuoteCache[code] = data;
        if (result.time) {
            watchQuoteUpdateTime = result.time;
            if (updateTimeEl) updateTimeEl.textContent = result.time;
        }
        renderWatchlist();
    } catch (e) {
        console.error('新增股票行情获取失败:', e);
        showWatchStatus('已添加，行情稍后自动刷新', 'error');
        renderWatchlist();
    }
}

function renderWatchItem(code, name, price, changePercent, volume) {
    var cls = changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : 'neutral';
    var pt = changePercent !== 0 ? (changePercent > 0 ? '+' + changePercent + '%' : changePercent + '%') : '0.00%';
    var arrow = trendArrow(changePercent);
    return '<div class="watchlist-item" data-code="' + escapeHtml(code) + '" data-pct="' + escapeHtml(changePercent) + '">' +
        '<div class="watchlist-item-main">' +
        '<div class="watchlist-stock-name">' + escapeHtml(name) + '</div>' +
        '<div class="watchlist-stock-code">' + escapeHtml(code) + '</div></div>' +
        '<div class="watchlist-stock-price ' + cls + '">' + escapeHtml(price) + '</div>' +
        '<div class="watchlist-stock-change ' + cls + '">' + escapeHtml(pt) + ' <span class="trend-arrow">' + escapeHtml(arrow) + '</span></div>' +
        '<button class="watchlist-remove-btn" data-code="' + escapeHtml(code) + '" aria-label="删除 ' + escapeHtml(code) + '">✕</button></div>';
}

function bindWatchRemove() {
    document.querySelectorAll('.watchlist-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeStockFromWatchlist(this.getAttribute('data-code'));
        });
    });
}

// ---------- 财经新闻（金十源）----------
function stripHtmlTags(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function formatJin10Time(timeStr) {
    if (!timeStr) return '';
    var parts = timeStr.split(' ');
    if (parts.length < 2) return timeStr;
    var datePart = parts[0];
    var timePart = parts[1];
    var today = new Date();
    var todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
    if (datePart === todayStr) {
        return timePart.substring(0, 5);
    }
    return datePart.substring(5) + ' ' + timePart.substring(0, 5);
}

async function loadNewsData() {
    var container = document.getElementById('news-list');
    if (!container) return;

    if (currentNewsSource === 'eastmoney') {
        await loadEastmoneyNews();
    } else {
        await loadJin10News();
    }
}

async function loadJin10News() {
    var container = document.getElementById('news-list');
    if (!container) return;

    try {
        var json = readTimedCache(SHORT_CACHE_KEYS.newsJin10, SHORT_CACHE_TTL.news);
        if (!json) {
            var res = await fetch(apiUrl('/news'));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            json = await res.json();
            if (json.success) writeTimedCache(SHORT_CACHE_KEYS.newsJin10, json);
        }

        if (!json.success || !json.data || !json.data.data || json.data.data.length === 0) {
            container.innerHTML = renderEmpty('暂无金十快讯');
            return;
        }

        var items = json.data.data.slice(0, 20);
        var html = '';
        items.forEach(function (item) {
            var content = item.data && item.data.content ? stripHtmlTags(item.data.content) : '';
            if (!content) return;
            var time = formatJin10Time(item.time);
            html += '<div class="news-item">';
            html += '  <div class="news-header">';
            html += '    <span class="news-time">' + escapeHtml(time) + '</span>';
            html += '  </div>';
            html += '  <div class="news-summary">' + escapeHtml(content) + '</div>';
            html += '</div>';
        });
        if (html) container.innerHTML = html;
    } catch (e) {
        console.error('金十快讯获取失败:', e);
        var cached = readJson(SHORT_CACHE_KEYS.newsJin10, null);
        if (cached && cached.data) {
            writeTimedCache(SHORT_CACHE_KEYS.newsJin10, cached.data);
            return loadJin10News();
        }
        container.innerHTML = renderEmpty('金十快讯加载失败');
    }
}

async function loadEastmoneyNews() {
    var container = document.getElementById('news-list');
    if (!container) return;

    try {
        var json = readTimedCache(SHORT_CACHE_KEYS.newsEastmoney, SHORT_CACHE_TTL.news);
        if (!json) {
            var res = await fetch(apiUrl('/global-news'));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            json = await res.json();
            if (json.success) writeTimedCache(SHORT_CACHE_KEYS.newsEastmoney, json);
        }

        if (!json.success || !json.data || json.data.length === 0) {
            container.innerHTML = renderEmpty('暂无东财资讯');
            return;
        }

        var items = json.data.slice(0, 20);
        var html = '';
        items.forEach(function (item) {
            var title = item.title || '';
            var summary = item.summary || '';
            var time = item.time || '';
            html += '<div class="news-item">';
            html += '  <div class="news-header">';
            html += '    <span class="news-time">' + escapeHtml(time) + '</span>';
            html += '  </div>';
            if (title) html += '  <div class="news-title">' + escapeHtml(title) + '</div>';
            if (summary) html += '  <div class="news-summary">' + escapeHtml(summary) + '</div>';
            html += '</div>';
        });
        if (html) container.innerHTML = html;
    } catch (e) {
        var cached = readJson(SHORT_CACHE_KEYS.newsEastmoney, null);
        if (cached && cached.data) {
            writeTimedCache(SHORT_CACHE_KEYS.newsEastmoney, cached.data);
            return loadEastmoneyNews();
        }
        container.innerHTML = renderEmpty('东财资讯加载失败');
    }
}
