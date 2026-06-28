// ================================================================
// 市场行情 — App
// ================================================================

// ---------- State ----------
let refreshIntervalMain = null;   // 大盘指数 + 自选股
let refreshIntervalSignal = null; // 资金流 + 板块
let refreshIntervalNews = null;   // 财经新闻
let refreshIntervalDaily = null;  // 日级数据（多日资金流 / 龙虎榜 / 解禁）
let isAutoRefresh = true;
let refreshSecondsMain = 10;
let refreshSecondsSignal = 1800;
let refreshSecondsNews = 60;
let holdingColorMode = 'market';  // market: 红绿显示; white: 浮窗价格/涨跌幅全白
let holdingOpacity = 100;          // 浮窗不透明度百分比：0-100
let currentTab = 'dashboard';
let activeWatchTabId = 'default';
const API_BASE = '/api';
const VALID_TABS = ['dashboard', 'signals', 'news'];
const TAB_TITLES = { dashboard: '市场行情', signals: '市场信号', news: '财经快讯' };
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

// ---------- Cache Keys ----------
const WATCH_QUOTE_CACHE_KEY = 'fund_tracker_watch_quote_cache';
const WATCH_QUOTE_UPDATE_TIME_KEY = 'fund_tracker_watch_quote_update_time';
const ALERT_SETTINGS_KEY = 'fund_tracker_alert_settings';
const WATCH_ALERT_STATE_KEY = 'fund_tracker_watch_alert_state';
const CUSTOM_INDICES_KEY = 'fund_tracker_custom_indices';
const CUSTOM_INDEX_QUOTE_CACHE_KEY = 'fund_tracker_custom_index_quote_cache';
const CUSTOM_INDEX_UPDATE_TIME_KEY = 'fund_tracker_custom_index_update_time';
const CUSTOM_INDEX_MAX = 4;
const WATCHLIST_COST_KEY = 'fund_tracker_watchlist_cost';
// 大盘/自选指数:每 30 分钟刷新一次的 prev 快照,用来画 trend-arrow
// 结构: { market: { id: changePercent }, custom: { code: changePercent } }
const INDEX_PREV_KEY = 'fund_tracker_index_prev_pct';
const INDEX_REFRESH_SECONDS = 300;

// 实时数据缓存
let liveIndexData = null;
let liveCapitalData = null;
let liveSectorData = null;
let watchQuoteCache = {};
let watchQuoteUpdateTime = '';
let customIndexCodes = [];        // 用户自选指数（板块/ETF），最多 4 个
let customIndexCache = {};        // { code: { name, price, changePercent } }
let customIndexUpdateTime = '';
let watchlistCost = {};           // 自选股持仓成本/股数 { [code]: { cost, shares } }
let hasInitialDataLoaded = false;

// 涨跌幅告警状态
let alertEnabled = true;
let alertThreshold = 2;            // 百分比
let watchAlertState = {};          // { [code]: { openDate, openPrice, addedPrice, pendingAdd, lastTriggerPrice, lastTriggerTime } }
const ALERT_TOAST_MAX = 5;         // 同时显示的最大弹窗数
const ALERT_TOAST_TTL_MS = 20000;  // 单条弹窗自动消失时间

// 启动时从 localStorage 恢复自选股行情(避免非交易时段刷新后变成"待刷新")
(function restoreWatchQuoteState() {
    try {
        var rawCache = localStorage.getItem(WATCH_QUOTE_CACHE_KEY);
        if (rawCache) watchQuoteCache = JSON.parse(rawCache) || {};
    } catch (e) { watchQuoteCache = {}; }
    try {
        var rawTime = localStorage.getItem(WATCH_QUOTE_UPDATE_TIME_KEY);
        if (rawTime) watchQuoteUpdateTime = rawTime;
    } catch (e) { /* ignore */ }
})();

// 启动时从 localStorage 恢复自选指数(板块/ETF)
(function restoreCustomIndexState() {
    try {
        var rawCodes = localStorage.getItem(CUSTOM_INDICES_KEY);
        if (rawCodes) {
            var parsed = JSON.parse(rawCodes);
            if (Array.isArray(parsed)) customIndexCodes = parsed.filter(function (c) { return /^\d{6}$/.test(c); }).slice(0, CUSTOM_INDEX_MAX);
        }
    } catch (e) { /* ignore */ }
    try {
        var rawCache = localStorage.getItem(CUSTOM_INDEX_QUOTE_CACHE_KEY);
        if (rawCache) customIndexCache = JSON.parse(rawCache) || {};
    } catch (e) { /* ignore */ }
    try {
        var rawTime = localStorage.getItem(CUSTOM_INDEX_UPDATE_TIME_KEY);
        if (rawTime) customIndexUpdateTime = rawTime;
    } catch (e) { /* ignore */ }
})();

// 启动时从 localStorage 恢复自选股持仓成本/股数
(function restoreWatchlistCost() {
    try {
        var raw = localStorage.getItem(WATCHLIST_COST_KEY);
        if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') watchlistCost = parsed;
        }
    } catch (e) { /* ignore */ }
})();

// 启动时从 localStorage 恢复告警设置 + 自选股 alert 状态
// 引入 schema 版本号:openPrice 字段含义从"首次见到价"改成"真实开盘价",
// 老 state 会导致涨跌幅比较基准错位,首次加载新版本时清空。
const WATCH_ALERT_SCHEMA_VERSION = 2;
(function restoreAlertState() {
    try {
        var saved = JSON.parse(localStorage.getItem(ALERT_SETTINGS_KEY) || '{}') || {};
        if (typeof saved.enabled === 'boolean') alertEnabled = saved.enabled;
        if (typeof saved.threshold === 'number' && saved.threshold > 0 && saved.threshold <= 50) {
            alertThreshold = saved.threshold;
        }
    } catch (e) { /* ignore */ }
    try {
        var rawState = JSON.parse(localStorage.getItem(WATCH_ALERT_STATE_KEY) || '{}') || {};
        if (rawState && rawState.__v !== WATCH_ALERT_SCHEMA_VERSION) {
            // 老 schema 或无版本号:丢弃,让新逻辑用今日真实开盘价重建基准
            watchAlertState = {};
            try { localStorage.removeItem(WATCH_ALERT_STATE_KEY); } catch (e) {}
        } else {
            watchAlertState = rawState;
        }
    } catch (e) { watchAlertState = {}; }
})();

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
    document.getElementById('header-title').textContent = TAB_TITLES[tab] || '市场行情';

    // Update URL hash
    if (updateHash !== false) {
        window.location.hash = tab === 'dashboard' ? '' : '#' + tab;
    }

    // Load tab-specific data when switching panels.
    if (tab === 'dashboard') {
        loadFundFlow120dData();
    }
    if (tab === 'signals') {
        loadHotRankData(getActiveHotRankSource());
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
    initHotRankTabs();
    initWatchlistTabs();
    initNewsSourceTabs();
    initNewsScroll();
    initSettings();
    syncSettingsControls();
    initDataPanel();
    bindEvents();
    initAutoRefresh();
    renderCustomIndex();
    // 页面初始化:按市场阶段决定是否发请求
    //  - 交易时段:正常拉取所有数据
    //  - 收盘后:只拉日级数据,实时数据从缓存渲染
    //  - 其他非交易时段:完全不 fetch,只从缓存渲染
    loadInitialDataByMarketPhase();
    hasInitialDataLoaded = true;
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
// 金十支持翻页(每页 20);东财 fastNewsList 不支持分页参数,只能取最新 30 条
var NEWS_PAGE_SIZE = { jin10: 20, eastmoney: 30 };
var newsState = {
    jin10: { items: [], cursor: null, hasMore: true, isLoading: false, error: false },
    eastmoney: { items: [], cursor: null, hasMore: true, isLoading: false, error: false },
};

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
            // 切换源:重置状态、清空列表、立刻展示"加载中..."
            resetNewsState(currentNewsSource);
            renderNewsList();
            loadNewsData();
        });
    });
}

function resetNewsState(source) {
    newsState[source] = { items: [], cursor: null, hasMore: true, isLoading: false, error: false };
}

// 滚动到底部时自动加载更多(用 sentinel + 距离阈值,避免频繁触发)
var newsScrollHandler = null;
function initNewsScroll() {
    if (newsScrollHandler) return;
    var ticking = false;
    newsScrollHandler = function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            ticking = false;
            maybeLoadMoreNews();
        });
    };
    window.addEventListener('scroll', newsScrollHandler, { passive: true });
    window.addEventListener('resize', newsScrollHandler, { passive: true });
}

function maybeLoadMoreNews() {
    if (currentTab !== 'news') return;
    var state = newsState[currentNewsSource];
    if (!state || state.isLoading || !state.hasMore) return;
    // 距底部 400px 内即触发
    var threshold = 400;
    var scrolled = window.scrollY + window.innerHeight;
    var total = document.documentElement.scrollHeight;
    if (scrolled >= total - threshold) {
        loadNewsData();
    }
}

// ---------- Settings ----------
function normalizeOptionValue(value, allowedValues, fallback) {
    var stringValue = String(value);
    return allowedValues.includes(stringValue) ? stringValue : String(fallback);
}

function normalizePercentValue(value, fallback) {
    var numberValue = Number(value);
    if (!Number.isFinite(numberValue)) numberValue = Number(fallback);
    if (!Number.isFinite(numberValue)) numberValue = 100;
    return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function getSettingsControls() {
    return {
        autoRefresh: document.getElementById('auto-refresh-toggle'),
        mainInterval: document.getElementById('refresh-interval-main'),
        signalInterval: document.getElementById('refresh-interval-signal'),
        newsInterval: document.getElementById('refresh-interval-news'),
        holdingColorMode: document.getElementById('holding-color-mode'),
        holdingOpacity: document.getElementById('holding-opacity-input'),
        holdingOpacityValue: document.getElementById('holding-opacity-value'),
        alertEnabled: document.getElementById('alert-enabled-toggle'),
        alertThreshold: document.getElementById('alert-threshold-input'),
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
    holdingColorMode = normalizeOptionValue(saved.holdingColorMode, ['market', 'white'], holdingColorMode);
    holdingOpacity = normalizePercentValue(saved.holdingOpacity, holdingOpacity);
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            autoRefresh: isAutoRefresh,
            mainInterval: refreshSecondsMain,
            signalInterval: refreshSecondsSignal,
            newsInterval: refreshSecondsNews,
            holdingColorMode: holdingColorMode,
            holdingOpacity: holdingOpacity,
        }));
    } catch (e) {}
}

function syncSettingsControls() {
    var controls = getSettingsControls();
    if (controls.autoRefresh) controls.autoRefresh.checked = isAutoRefresh;
    if (controls.mainInterval) controls.mainInterval.value = String(refreshSecondsMain);
    if (controls.signalInterval) controls.signalInterval.value = String(refreshSecondsSignal);
    if (controls.newsInterval) controls.newsInterval.value = String(refreshSecondsNews);
    if (controls.holdingColorMode) controls.holdingColorMode.value = holdingColorMode;
    if (controls.holdingOpacity) controls.holdingOpacity.value = String(holdingOpacity);
    if (controls.holdingOpacityValue) controls.holdingOpacityValue.textContent = holdingOpacity + '%';
    if (controls.alertEnabled) controls.alertEnabled.checked = alertEnabled;
    if (controls.alertThreshold) controls.alertThreshold.value = String(alertThreshold);
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

    var holdingColorModeSelect = document.getElementById('holding-color-mode');
    if (holdingColorModeSelect) {
        holdingColorModeSelect.addEventListener('change', function (e) {
            holdingColorMode = normalizeOptionValue(e.target.value, ['market', 'white'], 'market');
            e.target.value = holdingColorMode;
            saveSettings();
        });
    }

    var holdingOpacityInput = document.getElementById('holding-opacity-input');
    var holdingOpacityValue = document.getElementById('holding-opacity-value');
    if (holdingOpacityInput) {
        var commitHoldingOpacity = function (e) {
            holdingOpacity = normalizePercentValue(e.target.value, 100);
            e.target.value = String(holdingOpacity);
            if (holdingOpacityValue) holdingOpacityValue.textContent = holdingOpacity + '%';
            saveSettings();
        };
        holdingOpacityInput.addEventListener('input', commitHoldingOpacity);
        holdingOpacityInput.addEventListener('change', commitHoldingOpacity);
    }

    document.getElementById('alert-enabled-toggle').addEventListener('change', function (e) {
        alertEnabled = !!e.target.checked;
        saveAlertSettings();
    });

    var thresholdInput = document.getElementById('alert-threshold-input');
    if (thresholdInput) {
        var commitThreshold = function () {
            var v = parseFloat(thresholdInput.value);
            if (!isFinite(v) || v <= 0) v = 2;
            if (v > 50) v = 50;
            alertThreshold = v;
            thresholdInput.value = String(v);
            saveAlertSettings();
        };
        thresholdInput.addEventListener('change', commitThreshold);
        thresholdInput.addEventListener('blur', commitThreshold);
    }

    document.getElementById('add-stock-btn').addEventListener('click', addStockToWatchlist);
    document.getElementById('add-watch-tab-btn').addEventListener('click', addWatchTab);
    document.getElementById('stock-code-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') addStockToWatchlist();
    });
    document.getElementById('refresh-btn').addEventListener('click', manualRefreshAll);

    // 编辑按钮：默认"编辑"展开面板，再次点击变"保存"保存并关闭
    var editBtn = document.getElementById('watchlist-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var panel = document.getElementById('watchlist-edit-panel');
            if (!panel) return;
            if (panel.hidden) {
                openWatchlistEditPanel();
            } else {
                saveWatchlistEditPanel();
            }
        });
    }
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

function setLastUpdated(label, time) {
    var el = document.getElementById('last-updated');
    if (!el) return;
    var display = time || new Date().toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    el.textContent = (label || '已更新') + ' · ' + display;
}

function formatShanghaiTime(timestamp) {
    if (!timestamp) return '';
    var date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
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
    return ['周一', '周二', '周三', '周四', '周五'].includes(weekday);
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
    loadCustomIndexData();
}

function loadIntradaySignalData() {
    loadCapitalData();
    loadSectorData();
}

function loadAfterCloseDailyData() {
    loadDragonTigerData();
    loadLockupData();
    loadFundFlow120dData();
}

// 页面初始化时按市场阶段分支:
//  - 交易时段:正常拉取所有数据
//  - 收盘后窗口:只拉日级数据(龙虎/解禁/多日资金),实时数据从缓存渲染
//  - 其他非交易时段(盘前/午休/深夜/周末):完全不发出 fetch,仅从缓存渲染
function loadInitialDataByMarketPhase() {
    if (isIntradayRefreshWindow()) {
        loadAllData();
        return;
    }

    if (isAfterCloseDailyWindow()) {
        loadAfterCloseDailyData();
        loadHotRankData(getActiveHotRankSource());
        renderRealtimeFromCache();
        return;
    }

    // 非交易时段(盘前/午休/深夜/周末)
    renderRealtimeFromCache();
}

// 从 localStorage 缓存渲染大盘/资金/板块/自选股,并显示"最后一次实际更新"的时间
// 不会触发任何 fetch。
function renderRealtimeFromCache() {
    var anyRendered = false;

    var idxCached = readJson(SHORT_CACHE_KEYS.index, null);
    if (idxCached && idxCached.data) {
        liveIndexData = idxCached.data;
        Object.keys(idxCached.data).forEach(function (id) { updateIndexUI(id, idxCached.data[id]); });
        setLastUpdated('行情已更新', formatShanghaiTime(idxCached.updatedAt));
        anyRendered = true;
    }

    var capCached = readJson(SHORT_CACHE_KEYS.capital, null);
    if (capCached && capCached.data) {
        liveCapitalData = capCached.data;
        renderCapitalUI(capCached.data);
        anyRendered = true;
    }

    var secCached = readJson(SHORT_CACHE_KEYS.sector, null);
    if (secCached && secCached.data) {
        liveSectorData = secCached.data;
        renderSectorUI(secCached.data);
        anyRendered = true;
    }

    // 自选股:watchQuoteCache 已在启动时从 localStorage 恢复
    var codes = getAllWatchCodes();
    if (codes.length > 0) {
        renderWatchlist();
        anyRendered = true;
        // 非交易时段:把 watchQuoteCache 里没数据的"待刷新"股票补拉一次
        // (收市后用户刷新页面,缓存里没数据就不应该一直显示"待刷新")
        refreshStaleWatchQuotes();
    }

    // 自选指数:customIndexCache 已在启动时从 localStorage 恢复
    renderCustomIndex();
    if (customIndexCodes.length > 0) {
        anyRendered = true;
        refreshStaleCustomIndex();
    }

    if (!anyRendered) {
        setLastUpdated('非交易时段 · 暂无缓存');
    }
}

// 非交易时段(收市/盘前/午休/深夜)刷新页面时,把 watchQuoteCache 里缺失的股票补拉一次
// 节流 5 分钟,避免用户反复刷新页面打 API
const WATCH_REFRESH_THROTTLE_KEY = 'fund_tracker_watch_refresh_throttle';
const WATCH_REFRESH_THROTTLE_MS = 5 * 60 * 1000;

function refreshStaleWatchQuotes() {
    var codes = getAllWatchCodes();
    if (codes.length === 0) return;

    var stale = codes.filter(function (c) { return !watchQuoteCache[c]; });
    if (stale.length === 0) return;

    var lastPull = 0;
    try { lastPull = parseInt(localStorage.getItem(WATCH_REFRESH_THROTTLE_KEY) || '0', 10) || 0; } catch (e) {}
    if (Date.now() - lastPull < WATCH_REFRESH_THROTTLE_MS) return;

    fetch(apiUrl('/stock', { codes: stale.join(',') }))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (result) {
            if (!result || !result.success || !result.data) return;
            Object.keys(result.data).forEach(function (code) {
                var d = result.data[code];
                if (d && d.price !== '0.00') watchQuoteCache[code] = d;
            });
            if (result.time) {
                watchQuoteUpdateTime = result.time;
                persistWatchQuoteUpdateTime(result.time);
            }
            persistWatchQuoteCache();
            renderWatchlist();
            try { localStorage.setItem(WATCH_REFRESH_THROTTLE_KEY, String(Date.now())); } catch (e) {}
        })
        .catch(function () { /* 非交易时段拉取失败属正常,静默 */ });
}

// 自选指数版：复用同一个 5 分钟节流键（避免和自选股相互打架）
function refreshStaleCustomIndex() {
    if (customIndexCodes.length === 0) return;
    var stale = customIndexCodes.filter(function (c) { return !customIndexCache[c]; });
    if (stale.length === 0) return;

    var lastPull = 0;
    try { lastPull = parseInt(localStorage.getItem(WATCH_REFRESH_THROTTLE_KEY) || '0', 10) || 0; } catch (e) {}
    if (Date.now() - lastPull < WATCH_REFRESH_THROTTLE_MS) return;

    fetch(apiUrl('/stock', { codes: stale.join(',') }))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (result) {
            if (!result || !result.success || !result.data) return;
            Object.keys(result.data).forEach(function (code) {
                var d = result.data[code];
                if (d && d.price !== '0.00') customIndexCache[code] = d;
            });
            if (result.time) {
                customIndexUpdateTime = result.time;
                persistCustomIndexUpdateTime(result.time);
            }
            persistCustomIndexCache();
            renderCustomIndex();
        })
        .catch(function () { /* ignore */ });
}

function renderCapitalUI(cap) {
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

function renderSectorUI(sectors) {
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

// ---------- Auto Refresh ----------
function initAutoRefresh() {
    if (isAutoRefresh) startAllAutoRefresh();
}

function startAllAutoRefresh() {
    startMainAutoRefresh();
    startSignalAutoRefresh();
    startNewsAutoRefresh();
    startDailyRefresh();
}

function stopAllAutoRefresh() {
    stopMainAutoRefresh();
    stopSignalAutoRefresh();
    stopNewsAutoRefresh();
    stopDailyRefresh();
}

function startMainAutoRefresh() {
    stopMainAutoRefresh();
    refreshIntervalMain = setInterval(function () {
        if (isIntradayRefreshWindow()) {
            loadIndexData();
            loadWatchlistData();
            loadCustomIndexData();
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

function startDailyRefresh() {
    stopDailyRefresh();
    refreshIntervalDaily = setInterval(function () {
        // 收盘后窗口（16:00 起）触发日级数据刷新
        if (isAfterCloseDailyWindow()) {
            loadFundFlow120dData();
            loadDragonTigerData();
            loadLockupData();
        }
    }, 30 * 60 * 1000);
}

function stopDailyRefresh() {
    if (refreshIntervalDaily) { clearInterval(refreshIntervalDaily); refreshIntervalDaily = null; }
}

// ---------- Load All ----------
function loadAllData() {
    loadIntradayData();
    loadIntradaySignalData();
    loadAfterCloseDailyData();
    loadFundFlow120dData();
    loadHotRankData(getActiveHotRankSource());
    hasInitialDataLoaded = true;
    // News is loaded on tab switch
    if (currentTab === 'news') loadNewsData();
}

// 手动刷新:无视交易时段,重新拉一遍所有数据
// (日级数据传 force=true 绕过 isAfterCloseForDailyUpdate 门禁)
function manualRefreshAll() {
    loadIndexData();
    loadWatchlistData();
    loadCapitalData();
    loadSectorData();
    loadFundFlow120dData(true);
    loadDragonTigerData(true);
    loadLockupData(true);
    loadHotRankData(getActiveHotRankSource());
    if (currentTab === 'news') loadNewsData();
    setLastUpdated('手动刷新');
}


// ---------- 大盘指数 ----------
// 指数中文名由 HTML 写死（首屏即正确，无需依赖接口返回）
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
    // 半小时对比箭头：跟价格绑定,内部读 prev 价格快照
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

async function loadIndexData() {
    var cached = readTimedCache(SHORT_CACHE_KEYS.index, SHORT_CACHE_TTL.index);
    if (cached) {
        liveIndexData = cached;
        Object.keys(cached).forEach(function (id) { updateIndexUI(id, cached[id]); });
        var meta = readJson(SHORT_CACHE_KEYS.index, null);
        if (meta && meta.updatedAt) {
            setLastUpdated('行情已更新', formatShanghaiTime(meta.updatedAt));
        }
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
        // 节流落盘:刷新节奏不变,只决定 prev 落盘的节奏
        persistIndexPrevIfDue('market', snapshotIndexPrice(result.data));
        setLastUpdated('行情已更新');
    } catch (e) {
        if (!liveIndexData) setLastUpdated('行情获取失败');
    }
}

function snapshotIndexPrice(data) {
    // 抽出 { key: priceValue } 快照,trend-arrow 用价格本身做对比基准
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

    if (!liveCapitalData) return;
    renderCapitalUI(liveCapitalData);
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

    if (!liveSectorData) return;
    renderSectorUI(liveSectorData);
}

// ---------- 自选股 120 日资金流 (a-stock-data v3.0 §4.5;取代旧"多日资金"卡) ----------
// cache key 升 v2 是因为新代码的 item 多了 name 字段(从腾讯 quote 批量 join),
// 旧 cache 残留的 item 没有 name,会被前端渲染成只显示代码的单行,看起来"对不齐"。
// 升版本号让旧 cache 自然失效,触发用户侧一次重新拉取。
const FUND_FLOW_CACHE_KEY = 'fund_tracker_fund_flow_cache_v2';

async function loadFundFlow120dData(force) {
    function renderEmpty(message) {
        var emptyEl = document.getElementById('fund-flow-empty');
        var tableEl = document.getElementById('fund-flow-table');
        if (emptyEl) { emptyEl.textContent = message; emptyEl.hidden = false; }
        if (tableEl) tableEl.hidden = true;
    }

    function renderRows(items) {
        var emptyEl = document.getElementById('fund-flow-empty');
        var tableEl = document.getElementById('fund-flow-table');
        var rowsEl = document.getElementById('fund-flow-rows');
        if (!rowsEl) return;
        if (emptyEl) emptyEl.hidden = true;
        if (tableEl) tableEl.hidden = false;

        function fmtYuan(yuan) {
            if (!yuan) return '0';
            var abs = Math.abs(yuan);
            var sign = yuan > 0 ? '+' : yuan < 0 ? '-' : '';
            if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + '亿';
            if (abs >= 1e4) return sign + (abs / 1e4).toFixed(0) + '万';
            return sign + abs.toFixed(0);
        }
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
                return '<span class="' + cls(r.mainNet) + '" title="' + escapeHtml(r.date) + ' ' + fmtYuan(r.mainNet) + '">' + bars[level] + '</span>';
            }).join('');
        }

        rowsEl.innerHTML = items.map(function (it) {
            // 即使 name 为空也要渲染 code 一行(老 cache 兼容);name 行用 code 兜底
            var displayName = it.name || it.code;
            var displayCode = it.code;
            if (it.error || !it.summary) {
                return '<tr><td class="sector-name-cell">' +
                    '<div class="watchlist-item-main">' +
                        '<div class="watchlist-stock-name">' + escapeHtml(displayName) + '</div>' +
                        '<div class="watchlist-stock-code">' + escapeHtml(displayCode) + '</div>' +
                    '</div>' +
                    '</td>' +
                    '<td colspan="4" class="list-empty">' + escapeHtml(it.error || '暂无数据') + '</td></tr>';
            }
            return '<tr>' +
                '<td class="sector-name-cell">' +
                    '<div class="watchlist-item-main">' +
                        '<div class="watchlist-stock-name">' + escapeHtml(displayName) + '</div>' +
                        '<div class="watchlist-stock-code">' + escapeHtml(displayCode) + '</div>' +
                    '</div>' +
                '</td>' +
                '<td class="' + cls(it.summary.main_5d) + '">' + fmtYuan(it.summary.main_5d) + '</td>' +
                '<td class="' + cls(it.summary.main_20d) + '">' + fmtYuan(it.summary.main_20d) + '</td>' +
                '<td class="' + cls(it.summary.main_60d) + '">' + fmtYuan(it.summary.main_60d) + '</td>' +
                '<td class="trend-cell fund-flow-trend">' + trendHtml(it.recent) + '</td>' +
            '</tr>';
        }).join('');
    }

    var codes = getWatchlist();
    if (!codes || !codes.length) {
        renderEmpty('添加自选股后查看资金流');
        return;
    }

    var todayKey = getShanghaiDateKey();
    var cached = readFundFlowCache();
    if (cached && cached.date === todayKey && cached.data) {
        renderRows(cached.data);
        return;
    }

    try {
        var res = await fetch(apiUrl('/fund-flow-120d', { codes: codes.join(','), days: 60 }));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var result = await res.json();
        if (!result.success || !result.data || !Array.isArray(result.data.items)) throw new Error('数据异常');
        writeFundFlowCache(todayKey, result.data.items);
        renderRows(result.data.items);
    } catch (e) {
        if (cached && cached.data) {
            renderRows(cached.data);
            return;
        }
        renderEmpty('资金流接口暂不可用');
    }
}

function readFundFlowCache() {
    try { return JSON.parse(localStorage.getItem(FUND_FLOW_CACHE_KEY) || 'null'); } catch (e) { return null; }
}
function writeFundFlowCache(date, data) {
    try {
        localStorage.setItem(FUND_FLOW_CACHE_KEY, JSON.stringify({
            date: date, data: data, updatedAt: new Date().toISOString(),
        }));
    } catch (e) { /* ignore */ }
}

// ---------- 市场热度 (a-stock-data v3.3 §10.2 同花顺热榜 + 东财人气榜) ----------
const HOT_RANK_SOURCE_KEY = 'fund_tracker_hot_rank_source';
const HOT_RANK_CACHE_KEY = 'fund_tracker_hot_rank_cache';
const HOT_RANK_TTL = 5 * 60 * 1000;

function getActiveHotRankSource() {
    try { return localStorage.getItem(HOT_RANK_SOURCE_KEY) || 'ths'; } catch (e) { return 'ths'; }
}

async function loadHotRankData(source) {
    source = source || 'ths';
    var cached = readTimedCache(HOT_RANK_CACHE_KEY, HOT_RANK_TTL);
    if (cached && cached.source === source && cached.items) {
        renderHotRank(cached.items, source, false);
        return;
    }
    try {
        var res = await fetch(apiUrl('/hot-rank', { source: source, limit: 20 }));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var result = await res.json();
        if (!result.success || !result.data || !Array.isArray(result.data.items)) throw new Error('数据异常');
        writeTimedCache(HOT_RANK_CACHE_KEY, { source: source, items: result.data.items });
        renderHotRank(result.data.items, source, true);
    } catch (e) {
        if (cached && cached.source === source && cached.items) {
            renderHotRank(cached.items, source, false);
            return;
        }
        renderHotRankError(source);
    }
}

function renderHotRank(items, source, fresh) {
    var listId = source === 'em' ? 'hot-rank-list-em' : 'hot-rank-list-ths';
    var listEl = document.getElementById(listId);
    var timeEl = document.getElementById('hot-rank-update-time');
    if (!listEl) return;
    if (!items.length) { listEl.innerHTML = '<li class="list-empty">暂无数据</li>'; return; }
    if (timeEl && fresh) {
        timeEl.textContent = '更新 ' + formatShanghaiTime(new Date().toISOString());
    }
    listEl.innerHTML = items.slice(0, 20).map(function (it) {
        var pctStr = (it.pct > 0 ? '+' : '') + it.pct.toFixed(2) + '%';
        var pctCls = it.pct > 0 ? 'positive' : it.pct < 0 ? 'negative' : 'neutral';
        var chgArrow = it.rankChg > 0 ? '↑' + it.rankChg : it.rankChg < 0 ? '↓' + (-it.rankChg) : '-';
        var chgCls = it.rankChg > 0 ? 'positive' : it.rankChg < 0 ? 'negative' : 'neutral';
        if (source === 'ths') {
            // 同花顺热榜:排名/名称/涨幅/人气/排名变化/概念标签
            var concepts = (it.concepts || []).slice(0, 2)
                .map(function (c) { return '<span class="hot-rank-concept">' + escapeHtml(c) + '</span>'; }).join('');
            var tag = it.tag ? '<span class="hot-rank-tag">' + escapeHtml(it.tag) + '</span>' : '';
            return '<li class="hot-rank-item">' +
                '<span class="hot-rank-rank">' + it.rank + '</span>' +
                '<span class="hot-rank-stock"><span class="hot-rank-name">' + escapeHtml(it.name) + '</span><span class="hot-rank-code">' + escapeHtml(it.code) + '</span></span>' +
                '<span class="hot-rank-pct ' + pctCls + '">' + pctStr + '</span>' +
                '<span class="hot-rank-heat">人气 ' + it.heat + '</span>' +
                '<span class="hot-rank-chg ' + chgCls + '">' + chgArrow + '</span>' +
                '<span class="hot-rank-concepts">' + concepts + tag + '</span>' +
            '</li>';
        } else {
            // 东财人气榜:排名/名称/价格/涨幅/排名变化
            var priceStr = (it.price !== null && it.price !== undefined) ? Number(it.price).toFixed(2) : '--';
            return '<li class="hot-rank-item">' +
                '<span class="hot-rank-rank">' + it.rank + '</span>' +
                '<span class="hot-rank-stock"><span class="hot-rank-name">' + escapeHtml(it.name) + '</span><span class="hot-rank-code">' + escapeHtml(it.code) + '</span></span>' +
                '<span class="hot-rank-price">' + priceStr + '</span>' +
                '<span class="hot-rank-pct ' + pctCls + '">' + pctStr + '</span>' +
                '<span class="hot-rank-chg ' + chgCls + '">' + chgArrow + '</span>' +
            '</li>';
        }
    }).join('');
}

function renderHotRankError(source) {
    var listId = source === 'em' ? 'hot-rank-list-em' : 'hot-rank-list-ths';
    var listEl = document.getElementById(listId);
    if (listEl) listEl.innerHTML = '<li class="list-empty">市场热度接口暂不可用</li>';
}

function initHotRankTabs() {
    var saved = getActiveHotRankSource();
    activateHotRankTab(saved);
    var tabs = document.querySelectorAll('.hot-rank-tab');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var source = tab.getAttribute('data-source');
            activateHotRankTab(source);
            try { localStorage.setItem(HOT_RANK_SOURCE_KEY, source); } catch (e) {}
            loadHotRankData(source);
        });
    });
    // 启动时不主动拉,等 dashboard tab 切到或 loadAllData 触发
}

function activateHotRankTab(source) {
    var tab = document.querySelector('.hot-rank-tab[data-source="' + source + '"]');
    if (!tab) return;
    var parent = tab.parentElement;
    parent.querySelectorAll('.hot-rank-tab').forEach(function (t) { t.classList.remove('active'); });
    tab.classList.add('active');
    var cardBody = tab.closest('.card-body');
    if (cardBody) {
        cardBody.querySelectorAll('.hot-rank-panel').forEach(function (p) { p.classList.remove('active'); });
        var panel = cardBody.querySelector('#hot-rank-panel-' + source);
        if (panel) panel.classList.add('active');
    }
}

// ---------- 龙虎榜 ----------
async function loadDragonTigerData(force) {
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

    if (!force && !isAfterCloseForDailyUpdate()) {
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
async function loadLockupData(force) {
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

    if (!force && !isAfterCloseForDailyUpdate()) {
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

// 固定 tab:id 固定、位置固定在所有自建 tab 之前、不可删除
const FIXED_WATCH_TAB_IDS = ['default', 'candidate'];
const FIXED_WATCH_TAB_NAMES = { default: '持仓股', candidate: '候选股' };
function isFixedWatchTab(tabId) {
    return FIXED_WATCH_TAB_IDS.indexOf(tabId) !== -1;
}

function getPrevChangePct() {
    try { return JSON.parse(localStorage.getItem(PREV_KEY)) || {}; } catch (e) { return {}; }
}
function savePrevChangePct(map) {
    try { localStorage.setItem(PREV_KEY, JSON.stringify(map)); } catch (e) {} }
function persistCurrentChangePct() {
    var map = {};
    Object.keys(watchQuoteCache).forEach(function (code) {
        var d = watchQuoteCache[code];
        if (d && typeof d.changePercent === 'number') map[code] = d.changePercent;
    });
    savePrevChangePct(map);
}

// 大盘 / 自选指数的 prev 快照(半小时对比基准)
// 结构:{ market: { _updatedAt, data: { id: pct } }, custom: { _updatedAt, data: { code: pct } } }
// _updatedAt 决定落盘节流:距上次落盘 < 30 分钟时,prev 保持原值(箭头语义=和上半小时比)
function getIndexPrevPct() {
    try {
        var raw = JSON.parse(localStorage.getItem(INDEX_PREV_KEY));
        if (raw && typeof raw === 'object') return raw;
    } catch (e) { /* ignore */ }
    return { market: { _updatedAt: 0, data: {} }, custom: { _updatedAt: 0, data: {} } };
}
// 排查用:浏览器 console 跑 __dumpIndexPrev() 打印 INDEX_PREV_KEY 实际内容
window.__dumpIndexPrev = function () {
 var raw = localStorage.getItem(INDEX_PREV_KEY);
 console.log('=== INDEX_PREV_KEY raw localStorage ===');
 console.log(raw);
 try { console.log('parsed:', JSON.parse(raw)); } catch (e) { console.log('parse err:', e); }
};
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
    var due = (nowMs - bucketObj._updatedAt) >= INDEX_REFRESH_SECONDS * 1000;
    if (!due) return false;
    var cleanData = {};
    Object.keys(currentMap || {}).forEach(function (k) {
        var v = currentMap[k];
        if (typeof v === 'number' && Number.isFinite(v)) cleanData[k] = v;
    });
    var cur = getIndexPrevPct();
    cur[bucket] = { _updatedAt: nowMs, data: cleanData };
    try { localStorage.setItem(INDEX_PREV_KEY, JSON.stringify(cur)); } catch (e) {}
    return true;
}
// 单点写入 prev(用于新增自选指数时立刻给一个 prev,让首次渲染的箭头 = self-vs-self = '─')
function setIndexPrevForCode(bucket, code, pct) {
    if (typeof pct !== 'number' || !Number.isFinite(pct)) return;
    var cur = getIndexPrevPct();
    var b = readIndexPrevBucket(bucket);
    b.data[code] = pct;
    // 单点写入不动 _updatedAt,避免污染节流基准
    cur[bucket] = b;
    try { localStorage.setItem(INDEX_PREV_KEY, JSON.stringify(cur)); } catch (e) {}
}
// 移除自选指数时同步清掉 prev,避免幽灵 prev
function clearIndexPrevForCode(bucket, code) {
    var cur = getIndexPrevPct();
    var b = readIndexPrevBucket(bucket);
    if (Object.prototype.hasOwnProperty.call(b.data, code)) {
        delete b.data[code];
        cur[bucket] = b;
        try { localStorage.setItem(INDEX_PREV_KEY, JSON.stringify(cur)); } catch (e) {}
    }
}
function trendArrow(current, prev) {
    if (prev === undefined || prev === null) return '─';
    if (current > prev) return '▲';
    if (current < prev) return '▼';
    return '─';
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
        var data = localStorage.getItem(WATCH_TABS_KEY);
        var parsed = data ? JSON.parse(data) : null;
        if (!Array.isArray(parsed) || parsed.length === 0) return defaultWatchTabs();

        // 升级:补齐缺失的 fixed tabs,保证 fixed tabs 排在最前
        var fixedBuckets = FIXED_WATCH_TAB_IDS.map(function () { return null; });
        var userTabs = [];
        parsed.forEach(function (tab) {
            var idx = FIXED_WATCH_TAB_IDS.indexOf(tab.id);
            if (idx !== -1) fixedBuckets[idx] = tab;
            else userTabs.push(tab);
        });
        var needsUpgrade = false;
        FIXED_WATCH_TAB_IDS.forEach(function (id, idx) {
            if (!fixedBuckets[idx]) {
                fixedBuckets[idx] = { id: id, name: FIXED_WATCH_TAB_NAMES[id], codes: [] };
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
    showStatusToast(message, type);
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
            watchAlertState = {};
            persistWatchQuoteCache();
            persistWatchQuoteUpdateTime('');
            saveWatchAlertState();
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
        var removable = !isFixedWatchTab(tab.id);
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
    localStorage.setItem(ACTIVE_WATCH_TAB_KEY, tabId);
    renderWatchTabs();
    renderWatchlist();
    // 切自选股分组后,资金流卡片对应的是当前分组的代码,重拉一次
    loadFundFlow120dData(true);
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
    if (isFixedWatchTab(tabId)) return;  // 持仓股/候选股不可删(UI 上没入口,这里兜底)
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
        // 同步写一条 pending alert state,首次拿到行情后由 checkAlerts 写入 addedPrice
        // 这样关页面再打开也能保留"盘中加的用添加价"语义
        watchAlertState[code] = {
            openDate: getShanghaiDateKey(),
            openPrice: null,      // 盘中新加,不用开盘价
            addedPrice: null,     // 等首次行情
            addedAt: null,
            pendingAdd: true,     // checkAlerts 看到这个标志会用 priceValue 填 addedPrice 并清掉
            lastTriggerPrice: null,
            lastTriggerTime: null,
        };
        saveWatchAlertState();
        showWatchStatus((match.name || code) + ' 已添加');
        renderWatchlist();
        loadSingleWatchQuote(code);
        // 资金流卡片包含自选股列表,加股后立刻重拉(force=true 绕过 cache)
        loadFundFlow120dData(true);
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
    if (watchQuoteCache[code]) {
        delete watchQuoteCache[code];
        persistWatchQuoteCache();
    }
    if (watchAlertState[code]) {
        delete watchAlertState[code];
        saveWatchAlertState();
    }
    renderWatchlist();
    showWatchStatus('已移除');
    // 资金流卡片跟着自选股列表,删股后立刻重拉
    loadFundFlow120dData(true);
}

function showWatchStatus(msg, type) {
    showStatusToast(msg, type);
}

function getAllWatchCodes() {
    return sanitizeCodes(getWatchTabs().flatMap(function (tab) { return tab.codes || []; }));
}

// 持仓股 tab 的代码：仅第一个分组（id === 'default'）
function getHoldingCodes() {
    var tabs = getWatchTabs();
    var holding = tabs.find(function (tab) { return tab.id === 'default'; });
    return sanitizeCodes(holding ? (holding.codes || []) : []);
}

// 持仓股 tab 是创建时的第一个 tab（id === 'default'，name 固定为"持仓股"）
// 只有这个 tab 才显示成本价/盈亏列，避免对"候选股"等纯观察列造成干扰
function isHoldingTab() {
    return activeWatchTabId === 'default';
}

function renderWatchlist() {
    var grid = document.getElementById('watchlist-grid');
    var updateTimeEl = document.getElementById('watchlist-update-time');
    var codes = getWatchlist();
    var activeTab = getActiveWatchTab();
    var showCost = isHoldingTab();
    if (codes.length === 0) {
        grid.innerHTML = '<div class="watchlist-empty">“' + escapeHtml(activeTab.name) + '”暂无股票</div>';
        if (updateTimeEl) updateTimeEl.textContent = '';
        return;
    }

    var prevMap = getPrevChangePct();
    grid.innerHTML = codes.map(function (code) {
        var data = watchQuoteCache[code];
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
    // 切换列数：持仓股 5 列（带成本），其他 4 列
    grid.classList.toggle('with-cost', showCost);
    document.querySelector('.watchlist-header-row')?.classList.toggle('with-cost', showCost);
    // 编辑按钮只对持仓股 tab 有意义。
    // 用 visibility 而非 display: none，避免候选股 tab 隐藏按钮时把 card-header 行高
    // 压缩，导致下方 .watchlist-item 整体上移产生"跳一行"的视觉跳变。
    var editBtn = document.getElementById('watchlist-edit-btn');
    if (editBtn) editBtn.style.visibility = showCost ? 'visible' : 'hidden';
    if (!showCost) closeWatchlistEditPanel();
    if (updateTimeEl) updateTimeEl.textContent = watchQuoteUpdateTime || '';
}

function persistWatchQuoteCache() {
    try { localStorage.setItem(WATCH_QUOTE_CACHE_KEY, JSON.stringify(watchQuoteCache)); } catch (e) {}
}

function persistWatchQuoteUpdateTime(value) {
    try { localStorage.setItem(WATCH_QUOTE_UPDATE_TIME_KEY, value || ''); } catch (e) {}
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
            persistWatchQuoteUpdateTime(result.time);
            if (updateTimeEl) updateTimeEl.textContent = result.time;
        }
        persistWatchQuoteCache();
        renderWatchlist();
        persistCurrentChangePct();
        checkAlerts(result.data);
    } catch (e) {
        console.error('自选股失败:', e);
        showWatchStatus('自选股行情加载失败', 'error');
        setLastUpdated('加载失败');
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
            persistWatchQuoteUpdateTime(result.time);
            if (updateTimeEl) updateTimeEl.textContent = result.time;
        }
        persistWatchQuoteCache();
        renderWatchlist();
        persistCurrentChangePct();
        // pendingAdd 的 state 由 checkAlerts 内部统一处理(写入 addedPrice)
        checkAlerts(result.data);
    } catch (e) {
        console.error('新增股票行情获取失败:', e);
        showWatchStatus('已添加，行情稍后自动刷新', 'error');
        setLastUpdated('加载失败');
        renderWatchlist();
    }
}

function renderWatchItem(code, name, price, changePercent, volume, prev, showCost) {
    var cls = changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : 'neutral';
    var pt = changePercent !== 0
        ? (changePercent > 0 ? '+' + Number(changePercent).toFixed(2) : Number(changePercent).toFixed(2)) + '%'
        : '0.00%';
    var arrow = trendArrow(changePercent, prev);
    var data = watchQuoteCache[code];
    var priceValue = data && typeof data.priceValue === 'number' ? data.priceValue : null;
    var costCell = showCost ? renderCostCell(code, priceValue) : '';
    return '<div class="watchlist-item" data-code="' + escapeHtml(code) + '" data-pct="' + escapeHtml(changePercent) + '">' +
        '<div class="watchlist-item-main">' +
        '<div class="watchlist-stock-name">' + escapeHtml(name) + '</div>' +
        '<div class="watchlist-stock-code">' + escapeHtml(code) + '</div></div>' +
        costCell +
        '<div class="watchlist-stock-price ' + cls + '">' + escapeHtml(price) + '</div>' +
        '<div class="watchlist-stock-change ' + cls + '">' + escapeHtml(pt) + ' <span class="trend-arrow">' + escapeHtml(arrow) + '</span></div>' +
        '<button class="watchlist-remove-btn" data-code="' + escapeHtml(code) + '" aria-label="删除 ' + escapeHtml(code) + '">✕</button></div>';
}

function renderCostCell(code, priceValue) {
    var entry = watchlistCost[code];
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
    try { localStorage.setItem(WATCHLIST_COST_KEY, JSON.stringify(watchlistCost)); } catch (e) {}
}

// 编辑按钮：默认显示"编辑"，点击展开后变成"保存"（高亮强调色）
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
        var data = watchQuoteCache[code];
        var name = (data && data.name) || code;
        var entry = watchlistCost[code] || {};
        var costVal = typeof entry.cost === 'number' ? entry.cost : '';
        var sharesVal = typeof entry.shares === 'number' ? entry.shares : '';
        return '<div class="watchlist-edit-row" data-code="' + escapeHtml(code) + '">' +
            '<div class="watchlist-edit-row-name">' + escapeHtml(name) + '<span class="edit-row-code">' + escapeHtml(code) + '</span></div>' +
            '<input type="number" step="0.01" min="0" class="edit-cost-input" placeholder="成本价" value="' + escapeHtml(String(costVal)) + '" />' +
            '<input type="number" step="1" min="0" class="edit-shares-input" placeholder="股数" value="' + escapeHtml(String(sharesVal)) + '" />' +
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
            watchlistCost[code] = {
                cost: cost,
                shares: Number.isFinite(shares) && shares > 0 ? shares : 0,
            };
        } else {
            delete watchlistCost[code];
        }
    });
    saveWatchlistCost();
    renderWatchlist();
    closeWatchlistEditPanel();
    showWatchStatus('成本已保存');
}

function bindWatchRemove() {
    document.querySelectorAll('.watchlist-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeStockFromWatchlist(this.getAttribute('data-code'));
        });
    });
}

// ---------- 自选指数（板块/ETF，最多 4 个） ----------
function saveCustomIndices() {
    try { localStorage.setItem(CUSTOM_INDICES_KEY, JSON.stringify(customIndexCodes)); } catch (e) {}
}
function persistCustomIndexCache() {
    try { localStorage.setItem(CUSTOM_INDEX_QUOTE_CACHE_KEY, JSON.stringify(customIndexCache)); } catch (e) {}
}
function persistCustomIndexUpdateTime(value) {
    try { localStorage.setItem(CUSTOM_INDEX_UPDATE_TIME_KEY, value || ''); } catch (e) {}
}

function renderCustomIndex() {
    var grid = document.getElementById('custom-index-grid');
    var updateTimeEl = document.getElementById('custom-index-update-time');
    if (!grid) return;

    var items = customIndexCodes.map(function (code) {
        var d = customIndexCache[code];
        var name = d && d.name ? d.name : code + '（待刷新）';
        var price = d && d.price != null ? d.price : '--';
        var pct = d && typeof d.changePercent === 'number' ? d.changePercent : 0;
        var change = d && typeof d.change === 'number' ? d.change : null;
        return renderCustomIndexItem(code, name, price, pct, change);
    });

    // 满 4 个不显示加号；未满追加 1 个加号格子
    if (customIndexCodes.length < CUSTOM_INDEX_MAX) {
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
    if (updateTimeEl) updateTimeEl.textContent = customIndexUpdateTime || '';
}

function renderCustomIndexItem(code, name, price, changePercent, change) {
    var cls = changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : 'neutral';
    // 跟大盘指数同排版：涨跌额 / 涨跌幅
    var changeStr = '--';
    if (typeof change === 'number' && Number.isFinite(change)) {
        changeStr = (change > 0 ? '+' : '') + change.toFixed(2);
    }
    var pctStr = (typeof changePercent === 'number' && Number.isFinite(changePercent) && changePercent !== 0)
        ? (changePercent > 0 ? '+' : '') + changePercent.toFixed(2) + '%'
        : '0.00%';
    // 半小时对比箭头：跟大盘指数一致,挂在价格后面,从 custom bucket 取 prev 价格
    var cached = customIndexCache[code];
    var priceValue = cached && typeof cached.priceValue === 'number' ? cached.priceValue : null;
    var prev = (readIndexPrevBucket('custom').data || {})[code];
    var arrow = trendArrow(
        priceValue,
        typeof prev === 'number' ? prev : null
    );
    var arrowHtml = arrow ? ' <span class="trend-arrow">' + escapeHtml(arrow) + '</span>' : '';
    return '<div class="index-item custom-index-data" data-code="' + escapeHtml(code) + '">' +
        '<div class="index-name">' + escapeHtml(name) + '</div>' +
        '<div class="index-value ' + cls + '">' + escapeHtml(price) + arrowHtml + '</div>' +
        '<div class="index-change ' + cls + '">' + escapeHtml(changeStr) + ' / ' + escapeHtml(pctStr) + '</div>' +
        '<button type="button" class="custom-index-remove" data-remove-custom-index="' + escapeHtml(code) + '" aria-label="删除 ' + escapeHtml(code) + '">✕</button>' +
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

// 用 prompt 快速加；避免在卡片里塞输入框布局
function openCustomIndexAddForm() {
    var raw = window.prompt('输入指数 / ETF / 板块代码（6 位数字）或名称', '');
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
        if (customIndexCodes.includes(code)) {
            showCustomIndexStatus('已在自选指数中', 'error');
            return;
        }
        if (customIndexCodes.length >= CUSTOM_INDEX_MAX) {
            showCustomIndexStatus('自选指数最多 ' + CUSTOM_INDEX_MAX + ' 个，请先删除', 'error');
            return;
        }
        customIndexCodes.push(code);
        saveCustomIndices();
        renderCustomIndex();
        showCustomIndexStatus((match.name || code) + ' 已添加');
        // 立即拉一次该指数行情
        loadSingleCustomIndex(code);
    } catch (e) {
        showCustomIndexStatus(e.message || '未找到匹配指数', 'error');
    }
}

function removeCustomIndex(code) {
    customIndexCodes = customIndexCodes.filter(function (c) { return c !== code; });
    delete customIndexCache[code];
    clearIndexPrevForCode('custom', code);
    saveCustomIndices();
    persistCustomIndexCache();
    renderCustomIndex();
    showCustomIndexStatus('已删除');
}

function showCustomIndexStatus(msg, type) {
    showStatusToast(msg, type);
}

async function loadCustomIndexData() {
    if (customIndexCodes.length === 0) {
        renderCustomIndex();
        return;
    }
    try {
        var res = await fetch(apiUrl('/stock', { codes: customIndexCodes.join(',') }));
        if (!res.ok) throw new Error('请求失败 ' + res.status);
        var result = await res.json();
        if (!result.success || !result.data) throw new Error('数据异常');
        Object.keys(result.data).forEach(function (code) {
            var d = result.data[code];
            if (d && d.price !== '0.00') customIndexCache[code] = d;
        });
        if (result.time) {
            customIndexUpdateTime = result.time;
            persistCustomIndexUpdateTime(result.time);
        }
        persistCustomIndexCache();
        // 节流落盘 prev
        persistIndexPrevIfDue('custom', snapshotIndexPrice(result.data));
        renderCustomIndex();
    } catch (e) {
        // 非交易时段拉取失败属正常，渲染缓存即可
        renderCustomIndex();
    }
}

async function loadSingleCustomIndex(code) {
    try {
        var res = await fetch(apiUrl('/stock', { codes: code }));
        if (!res.ok) return;
        var result = await res.json();
        if (!result.success || !result.data) return;
        var d = result.data[code];
        if (d && d.price !== '0.00') customIndexCache[code] = d;
        if (result.time) {
            customIndexUpdateTime = result.time;
            persistCustomIndexUpdateTime(result.time);
        }
        persistCustomIndexCache();
        // 新增指数首屏拉一次时,直接给这个 code 写入 prev(等于自身,首渲染箭头为 '─')
        if (d && typeof d.priceValue === 'number') {
            setIndexPrevForCode('custom', code, d.priceValue);
        }
        renderCustomIndex();
    } catch (e) { /* ignore */ }
}

// ---------- 涨跌幅告警 ----------
function saveAlertSettings() {
    try {
        localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify({
            enabled: alertEnabled,
            threshold: alertThreshold,
        }));
    } catch (e) {}
}

function saveWatchAlertState() {
    try {
        var payload = Object.assign({ __v: WATCH_ALERT_SCHEMA_VERSION }, watchAlertState);
        localStorage.setItem(WATCH_ALERT_STATE_KEY, JSON.stringify(payload));
    } catch (e) {}
}

// 检查并触发告警。quotes 形如 { [code]: { name, priceValue, openPrice, ... } }
// 基准价优先级:lastTriggerPrice(触发后) > addedPrice(盘中新加) > openPrice(今开)
// 首次见到某只股票 -> 用今日开盘价;新的一天 -> 重新用开盘价;
// pendingAdd 状态的股票(用户盘中新加),首次拿到行情时把此刻价写入 addedPrice。
function checkAlerts(quotes) {
    if (!alertEnabled) return;
    if (!quotes || typeof quotes !== 'object') return;
    var todayKey = getShanghaiDateKey();
    var triggered = [];
    var stateChanged = false;

    // 只监控 fixed tabs(持仓股 + 候选股)里的股票;其他自建分组一律不告警
    var watchTabs = getWatchTabs();
    var monitoredCodeSet = {};
    watchTabs.forEach(function (tab) {
        if (isFixedWatchTab(tab.id)) {
            tab.codes.forEach(function (c) { monitoredCodeSet[c] = true; });
        }
    });

    Object.keys(quotes).forEach(function (code) {
        if (!monitoredCodeSet[code]) return;  // 非持仓股/候选股,跳过

        var d = quotes[code];
        if (!d) return;
        var price = typeof d.priceValue === 'number' ? d.priceValue : null;
        if (price === null || price <= 0) return;

        // 真实今开(后端优先用 data[5],fallback 到昨收反推);仍可能为 null
        var openPrice = (typeof d.openPrice === 'number' && d.openPrice > 0) ? d.openPrice : null;

        var state = watchAlertState[code];
        if (!state) {
            // 第一次见到这只股票:用今日开盘价作为基准,不算涨跌幅
            watchAlertState[code] = {
                openDate: todayKey,
                openPrice: openPrice,
                lastTriggerPrice: null,
                lastTriggerTime: null,
            };
            stateChanged = true;
            return;
        }

        if (state.openDate !== todayKey) {
            // 新的一天:用今日开盘价重置基准;addedPrice 属于"添加时刻"的快照,跨日失效
            state.openDate = todayKey;
            state.openPrice = openPrice;
            state.addedPrice = null;
            state.addedAt = null;
            state.pendingAdd = false;
            state.lastTriggerPrice = null;
            state.lastTriggerTime = null;
            stateChanged = true;
        } else if (state.pendingAdd === true) {
            // 盘中新加:首次拿到行情,用此刻价格作 addedPrice 基准(支持关页面再开)
            state.addedPrice = price;
            state.addedAt = Date.now();
            state.pendingAdd = false;
            stateChanged = true;
        } else if (state.openPrice == null && state.addedPrice == null && openPrice != null) {
            // 同一天内,如果后端补回了开盘价,补上(例如刚开盘接口还没返回)
            state.openPrice = openPrice;
            stateChanged = true;
        }

        var base = state.lastTriggerPrice || state.addedPrice || state.openPrice;
        if (!base || base <= 0) return;
        var changePct = (price - base) / base * 100;
        if (Math.abs(changePct) >= alertThreshold) {
            var baseLabel = state.lastTriggerPrice ? '触发价'
                          : (state.addedPrice ? '添加价' : '开盘价');
            state.lastTriggerPrice = price;
            state.lastTriggerTime = new Date().toISOString();
            stateChanged = true;
            triggered.push({
                code: code,
                name: d.name || code,
                price: price,
                changePct: changePct,
                basePrice: base,
                baseLabel: baseLabel,
                time: state.lastTriggerTime,
            });
        }
    });

    if (stateChanged) saveWatchAlertState();
    triggered.forEach(pushAlertToast);
}

function pushAlertToast(alert) {
    var container = document.getElementById('alert-toast-container');
    if (!container) return;
    if (!alert || typeof alert.price !== 'number') return;

    // 限制最大条数,超过则移除最早
    while (container.children.length >= ALERT_TOAST_MAX) {
        var first = container.firstChild;
        if (!first) break;
        removeAlertToast(first, true);
    }

    var directionLabel = alert.changePct >= 0 ? '▲ 涨' : '▼ 跌';
    var dirClass = alert.changePct >= 0 ? 'alert-up' : 'alert-down';
    var pctClass = alert.changePct >= 0 ? 'positive' : 'negative';
    var pctText = (alert.changePct >= 0 ? '+' : '') + alert.changePct.toFixed(2) + '%';
    var timeText = new Date(alert.time).toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    var toast = document.createElement('div');
    toast.className = 'alert-toast ' + dirClass;
    toast.setAttribute('data-code', alert.code);

    var main = document.createElement('div');
    main.className = 'alert-toast-main';

    var title = document.createElement('div');
    title.className = 'alert-toast-title';
    var dirSpan = document.createElement('span');
    dirSpan.className = 'alert-toast-direction';
    dirSpan.textContent = directionLabel;
    var nameSpan = document.createElement('span');
    nameSpan.className = 'alert-toast-name';
    nameSpan.textContent = alert.name;
    var codeSpan = document.createElement('span');
    codeSpan.className = 'alert-toast-code';
    codeSpan.textContent = alert.code;
    title.appendChild(dirSpan);
    title.appendChild(nameSpan);
    title.appendChild(codeSpan);

    var detail = document.createElement('div');
    detail.className = 'alert-toast-detail';
    var priceSpan = document.createElement('span');
    priceSpan.className = 'alert-toast-price';
    priceSpan.textContent = alert.price.toFixed(2);
    var pctSpan = document.createElement('span');
    pctSpan.className = 'alert-toast-pct ' + pctClass;
    pctSpan.textContent = pctText;
    var baseSpan = document.createElement('span');
    baseSpan.className = 'alert-toast-base';
    var baseLabel = alert.baseLabel || (alert.baseIsTrigger ? '触发价' : '基准');
    baseSpan.textContent = baseLabel + ' ' + alert.basePrice.toFixed(2);
    detail.appendChild(priceSpan);
    detail.appendChild(pctSpan);
    detail.appendChild(baseSpan);

    var timeDiv = document.createElement('div');
    timeDiv.className = 'alert-toast-time';
    timeDiv.textContent = timeText;

    main.appendChild(title);
    main.appendChild(detail);
    main.appendChild(timeDiv);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'alert-toast-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function () { removeAlertToast(toast); });

    toast.appendChild(main);
    toast.appendChild(closeBtn);

    var timerId = setTimeout(function () { removeAlertToast(toast); }, ALERT_TOAST_TTL_MS);
    toast.__alertTimer = timerId;

    container.appendChild(toast);
}

function removeAlertToast(toast, immediate) {
    if (!toast || !toast.parentNode) return;
    if (toast.__alertTimer) {
        clearTimeout(toast.__alertTimer);
        toast.__alertTimer = null;
    }
    if (immediate) {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        return;
    }
    toast.classList.add('removing');
    setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
}

// 通用 status 弹窗：复用 alert-toast 容器和样式,但不带涨跌方向/价格字段。
// 用于 showDataStatus / showWatchStatus / showCustomIndexStatus 等所有"操作反馈"提示。
const STATUS_TOAST_TTL_MS = 2500;
function showStatusToast(message, type) {
    var container = document.getElementById('alert-toast-container');
    if (!container) return;
    if (!message) return;

    // 限制最大条数,超过则移除最早(与告警 toast 共用同一容器,故用 alert-toast 的上限)
    while (container.children.length >= ALERT_TOAST_MAX) {
        var first = container.firstChild;
        if (!first) break;
        removeAlertToast(first, true);
    }

    var variant = type === 'error' ? 'alert-down' : 'alert-info';
    var timeText = new Date().toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    var toast = document.createElement('div');
    toast.className = 'alert-toast ' + variant;

    var main = document.createElement('div');
    main.className = 'alert-toast-main';

    var title = document.createElement('div');
    title.className = 'alert-toast-title';
    var textSpan = document.createElement('span');
    textSpan.className = 'alert-toast-name';
    textSpan.textContent = message;
    title.appendChild(textSpan);

    var timeDiv = document.createElement('div');
    timeDiv.className = 'alert-toast-time';
    timeDiv.textContent = timeText;

    main.appendChild(title);
    main.appendChild(timeDiv);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'alert-toast-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function () { removeAlertToast(toast); });

    toast.appendChild(main);
    toast.appendChild(closeBtn);

    var timerId = setTimeout(function () { removeAlertToast(toast); }, STATUS_TOAST_TTL_MS);
    toast.__alertTimer = timerId;

    container.appendChild(toast);
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
    var today = getShanghaiDateKey();
    if (datePart === today) {
        return timePart.substring(0, 5);
    }
    return datePart.substring(5) + ' ' + timePart.substring(0, 5);
}

async function loadNewsData() {
    var container = document.getElementById('news-list');
    if (!container) return;
    var state = newsState[currentNewsSource];
    if (!state || state.isLoading) return;
    if (state.items.length > 0 && !state.hasMore) return; // 已加载到底

    state.isLoading = true;
    renderNewsList();
    try {
        if (currentNewsSource === 'eastmoney') {
            await loadEastmoneyNews();
        } else {
            await loadJin10News();
        }
    } finally {
        state.isLoading = false;
        renderNewsList();
    }
}

async function loadJin10News() {
    var state = newsState.jin10;
    var query = { limit: String(NEWS_PAGE_SIZE.jin10) };
    if (state.cursor) query.cursor = state.cursor;

    try {
        var res = await fetch(apiUrl('/news', query));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        if (!json.success) throw new Error(json.error || '数据异常');

        var payload = json.data || {};
        var rows = Array.isArray(payload.data) ? payload.data : [];
        if (rows.length) {
            state.items = state.items.concat(rows);
        }
        state.cursor = payload.nextCursor || null;
        state.hasMore = !!payload.hasMore && !!state.cursor;
        state.error = false;
    } catch (e) {
        console.error('金十快讯获取失败:', e);
        state.error = true;
    }
}

async function loadEastmoneyNews() {
    var state = newsState.eastmoney;
    var query = { limit: String(NEWS_PAGE_SIZE.eastmoney) };
    if (state.cursor) query.cursor = state.cursor;

    try {
        var res = await fetch(apiUrl('/global-news', query));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        if (!json.success) throw new Error(json.error || '数据异常');

        var payload = json.data || {};
        var rows = Array.isArray(payload.data) ? payload.data : [];
        if (rows.length) {
            state.items = state.items.concat(rows);
        }
        state.cursor = payload.nextCursor || null;
        // 东财 fastNewsList 不支持分页,服务端 hasMore 始终会是 false,这里保留双保险
        state.hasMore = !!payload.hasMore && !!state.cursor;
        state.error = false;
    } catch (e) {
        console.error('东财资讯获取失败:', e);
        state.error = true;
    }
}

// 把当前 source 的 items 渲染到 DOM;不重新拉数据
function renderNewsList() {
    var container = document.getElementById('news-list');
    if (!container) return;
    var state = newsState[currentNewsSource];
    if (!state) return;

    // 首屏加载:isLoading 且 items.length === 0,显示"加载中..."
    if (state.isLoading && state.items.length === 0) {
        container.innerHTML = '<div class="news-status news-loading">加载中...</div>';
        return;
    }

    // 加载出错且无内容
    if (state.error && state.items.length === 0) {
        container.innerHTML = '<div class="news-status news-error">' +
            escapeHtml(currentNewsSource === 'eastmoney' ? '东财资讯加载失败' : '金十快讯加载失败') +
            '</div>';
        return;
    }

    // 完全空
    if (state.items.length === 0) {
        container.innerHTML = '<div class="news-status news-empty">' +
            escapeHtml(currentNewsSource === 'eastmoney' ? '暂无东财资讯' : '暂无金十快讯') +
            '</div>';
        return;
    }

    // 正常:渲染瀑布流 + 底部 status
    var html = '';
    state.items.forEach(function (item) { html += renderNewsItem(item); });

    // 底部状态行
    if (state.isLoading) {
        html += '<div class="news-status news-loading">加载中...</div>';
    } else if (state.hasMore) {
        html += '<div class="news-status news-loadmore" id="news-loadmore-sentinel">上拉加载更多</div>';
    } else {
        html += '<div class="news-status news-loadend">已经到底了</div>';
    }
    container.innerHTML = html;
}

function renderNewsItem(item) {
    if (currentNewsSource === 'eastmoney') {
        var title = item.title || '';
        var summary = item.summary || '';
        var time = item.time || '';
        var html = '<div class="news-item">';
        html += '  <div class="news-header">';
        html += '    <span class="news-time">' + escapeHtml(time) + '</span>';
        html += '  </div>';
        if (title) html += '  <div class="news-title">' + escapeHtml(title) + '</div>';
        if (summary) html += '  <div class="news-summary">' + escapeHtml(summary) + '</div>';
        html += '</div>';
        return html;
    }
    // jin10
    var content = item.data && item.data.content ? stripHtmlTags(item.data.content) : '';
    if (!content) return '';
    var jt = formatJin10Time(item.time);
    return '<div class="news-item">' +
        '  <div class="news-header">' +
        '    <span class="news-time">' + escapeHtml(jt) + '</span>' +
        '  </div>' +
        '  <div class="news-summary">' + escapeHtml(content) + '</div>' +
        '</div>';
}
