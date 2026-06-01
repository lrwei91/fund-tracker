// ==================== 全局变量 ====================
let refreshInterval = null;
let isAutoRefresh = true;
let refreshSeconds = 60;
let watchlist = [];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initCollapsibleCards();
    initWatchlist();
    initAutoRefresh();
    bindEvents();
    loadAllData();
});

// ==================== 事件绑定 ====================
function bindEvents() {
    const refreshBtn = document.getElementById('refresh-btn');
    const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
    const refreshIntervalSelect = document.getElementById('refresh-interval');
    const watchlistAddBtn = document.getElementById('watchlist-add-btn');
    const watchlistInput = document.getElementById('watchlist-input');

    refreshBtn.addEventListener('click', function() {
        loadAllData();
    });

    autoRefreshToggle.addEventListener('change', function(e) {
        isAutoRefresh = e.target.checked;
        if (isAutoRefresh) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });

    refreshIntervalSelect.addEventListener('change', function(e) {
        refreshSeconds = parseInt(e.target.value);
        if (isAutoRefresh) {
            startAutoRefresh();
        }
    });

    watchlistAddBtn.addEventListener('click', addWatchlistItem);
    watchlistInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            addWatchlistItem();
        }
    });
}

// ==================== 页面交互 ====================
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.tab;
            if (!targetId) return;

            document.querySelectorAll('.tab-btn').forEach(tab => {
                const isActive = tab === button;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            document.querySelectorAll('.tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === targetId);
            });
        });
    });
}

function initCollapsibleCards() {
    document.querySelectorAll('.card-header').forEach(header => {
        const toggleCard = () => {
            const card = header.closest('.card');
            if (!card) return;

            const isCollapsed = card.dataset.collapsed === 'true';
            card.dataset.collapsed = isCollapsed ? 'false' : 'true';
            header.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
        };

        header.addEventListener('click', toggleCard);
        header.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleCard();
            }
        });
    });
}

// ==================== 自动刷新 ====================
function initAutoRefresh() {
    if (isAutoRefresh) {
        startAutoRefresh();
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    refreshInterval = setInterval(function() {
        loadAllData();
    }, refreshSeconds * 1000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// ==================== 数据加载 ====================
function loadAllData() {
    updateTime();
    loadIndexData();
    loadCapitalData();
    loadWatchlistData();
    loadSectorData();
    loadMultiDayFlowData();
    loadNewsData();
}

function updateTime() {
    const sourceTime = typeof DATA_UPDATE_TIME !== 'undefined' ? DATA_UPDATE_TIME : '';
    const timeStr = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('update-time').textContent = sourceTime ? `数据时间：${sourceTime}` : `最后更新：${timeStr}`;
}

// ==================== 大盘指数数据 ====================
function loadIndexData() {
    const indexes = ['shangzhi', 'shengzheng', 'chuangye', 'zhuanke50'];
    
    indexes.forEach(index => {
        const data = SAMPLE_DATA.index[index];
        if (data) {
            document.getElementById(`${index}-value`).textContent = data.value;
            document.getElementById(`${index}-change`).textContent = data.change;
            
            const valueEl = document.getElementById(`${index}-value`);
            const changeEl = document.getElementById(`${index}-change`);
            
            valueEl.className = 'index-value';
            changeEl.className = 'index-change';
            
            if (data.changePercent > 0) {
                valueEl.classList.add('positive');
                changeEl.classList.add('positive');
            } else if (data.changePercent < 0) {
                valueEl.classList.add('negative');
                changeEl.classList.add('negative');
            } else {
                valueEl.classList.add('neutral');
                changeEl.classList.add('neutral');
            }
        }
    });
}

// ==================== 自选股数据 ====================
function initWatchlist() {
    const saved = localStorage.getItem('investmentDashboardWatchlist');
    if (saved) {
        try {
            watchlist = JSON.parse(saved);
        } catch (e) {
            watchlist = [];
        }
    }

    if (!Array.isArray(watchlist) || watchlist.length === 0) {
        watchlist = [...SAMPLE_DATA.watchlist];
    }
}

function saveWatchlist() {
    localStorage.setItem('investmentDashboardWatchlist', JSON.stringify(watchlist));
}

function loadWatchlistData() {
    const grid = document.getElementById('watchlist-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (watchlist.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'watchlist-empty';
        empty.textContent = '暂无自选股，可输入代码或名称添加。';
        grid.appendChild(empty);
        return;
    }

    watchlist.forEach(stock => {
        const item = document.createElement('div');
        item.className = 'watchlist-item';

        const changeClass = stock.changePercent > 0 ? 'positive' :
            stock.changePercent < 0 ? 'negative' : 'neutral';
        const changePrefix = stock.changePercent > 0 ? '+' : '';

        item.innerHTML = `
            <div class="watchlist-item-main">
                <div class="watchlist-stock-name">${stock.name}</div>
                <div class="watchlist-stock-code">${stock.code}</div>
            </div>
            <div class="watchlist-stock-price ${changeClass}">${stock.price}</div>
            <div class="watchlist-stock-change ${changeClass}">
                <span>${changePrefix}${stock.changePercent.toFixed(2)}%</span>
            </div>
            <button class="watchlist-remove-btn" type="button" data-code="${stock.code}" aria-label="删除${stock.name}">删除</button>
        `;

        grid.appendChild(item);
    });

    grid.querySelectorAll('.watchlist-remove-btn').forEach(button => {
        button.addEventListener('click', function() {
            watchlist = watchlist.filter(stock => stock.code !== button.dataset.code);
            saveWatchlist();
            setWatchlistStatus('已删除自选股。');
            loadWatchlistData();
        });
    });
}

function addWatchlistItem() {
    const input = document.getElementById('watchlist-input');
    const keyword = input.value.trim();
    if (!keyword) {
        setWatchlistStatus('请输入股票代码或名称。', true);
        return;
    }

    const stock = SAMPLE_DATA.stockPool.find(item =>
        item.code.toLowerCase() === keyword.toLowerCase() ||
        item.name.toLowerCase() === keyword.toLowerCase()
    ) || createManualStock(keyword);

    if (watchlist.some(item => item.code === stock.code)) {
        setWatchlistStatus('该股票已在自选列表中。', true);
        return;
    }

    watchlist.push(stock);
    saveWatchlist();
    input.value = '';
    setWatchlistStatus(`已添加 ${stock.name}。`);
    loadWatchlistData();
}

function createManualStock(keyword) {
    return {
        code: keyword,
        name: keyword,
        price: '--',
        changePercent: 0
    };
}

function setWatchlistStatus(message, isError = false) {
    const status = document.getElementById('watchlist-status');
    if (!status) return;

    status.textContent = message;
    status.classList.toggle('error', isError);
}

// ==================== 资金流向数据 ====================
function loadCapitalData() {
    const capital = SAMPLE_DATA.capital;
    
    // 主力资金
    const mainCapital = capital.mainCapital;
    const mainCapitalEl = document.getElementById('main-capital-value');
    mainCapitalEl.textContent = mainCapital.value;
    mainCapitalEl.className = 'capital-value';
    if (mainCapital.isPositive) {
        mainCapitalEl.classList.add('positive');
    } else {
        mainCapitalEl.classList.add('negative');
    }
    
    // 北向资金
    const northCapital = capital.northCapital;
    const northCapitalEl = document.getElementById('north-capital-value');
    northCapitalEl.textContent = northCapital.value;
    northCapitalEl.className = 'capital-value';
    if (northCapital.isPositive) {
        northCapitalEl.classList.add('positive');
    } else {
        northCapitalEl.classList.add('negative');
    }
}

// ==================== 板块排行数据 ====================
function loadSectorData() {
    const sectors = SAMPLE_DATA.sectors;
    
    // 流入TOP5
    const inflowList = document.getElementById('inflow-sectors');
    inflowList.innerHTML = '';
    sectors.inflow.slice(0, 5).forEach(sector => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="sector-name">${sector.name}</span>
            <span class="sector-amount positive">${sector.value}</span>
        `;
        inflowList.appendChild(li);
    });
    
    // 流出TOP5
    const outflowList = document.getElementById('outflow-sectors');
    outflowList.innerHTML = '';
    sectors.outflow.slice(0, 5).forEach(sector => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="sector-name">${sector.name}</span>
            <span class="sector-amount negative">${sector.value}</span>
        `;
        outflowList.appendChild(li);
    });
}

// ==================== 多日板块资金流向数据（新增） ====================
function loadMultiDayFlowData() {
    const multiDayFlow = SAMPLE_DATA.sectorMultiDayFlow;
    if (!multiDayFlow) return;
    
    const container = document.getElementById('multiday-flow-container');
    if (!container) return;
    
    const dates = multiDayFlow.dates;
    
    // 渲染流入板块多日数据
    const inflowContainer = document.getElementById('multiday-inflow');
    if (inflowContainer) {
        inflowContainer.innerHTML = '';
        
        // 表头
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>板块名称</th>
            ${dates.map(d => `<th>${d}</th>`).join('')}
            <th>趋势</th>
        `;
        inflowContainer.appendChild(headerRow);
        
        // 数据行
        multiDayFlow.inflowSectors.forEach(sector => {
            const row = document.createElement('tr');
            row.className = sector.consecutiveDays >= 3 ? 'hot-sector' : '';
            
            let tableHtml = `<td class="sector-name-cell">${sector.name}</td>`;
            
            sector.data.forEach(value => {
                const isPositive = value.startsWith('+');
                tableHtml += `<td class="${isPositive ? 'flow-positive' : 'flow-negative'}">${value}</td>`;
            });
            
            const trendIcon = sector.trend === 'up' ? '上行' : '下行';
            const consecutiveBadge = sector.consecutiveDays >= 3 ? 
                `<span class="consecutive-badge">连续${sector.consecutiveDays}日流入</span>` : '';
            
            tableHtml += `<td class="trend-cell">${trendIcon} ${consecutiveBadge}</td>`;
            
            row.innerHTML = tableHtml;
            inflowContainer.appendChild(row);
        });
    }
    
    // 渲染流出板块多日数据
    const outflowContainer = document.getElementById('multiday-outflow');
    if (outflowContainer) {
        outflowContainer.innerHTML = '';
        
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>板块名称</th>
            ${dates.map(d => `<th>${d}</th>`).join('')}
            <th>趋势</th>
        `;
        outflowContainer.appendChild(headerRow);
        
        multiDayFlow.outflowSectors.forEach(sector => {
            const row = document.createElement('tr');
            row.className = sector.consecutiveDays >= 3 ? 'cold-sector' : '';
            
            let tableHtml = `<td class="sector-name-cell">${sector.name}</td>`;
            
            sector.data.forEach(value => {
                const isPositive = value.startsWith('+');
                tableHtml += `<td class="${isPositive ? 'flow-positive' : 'flow-negative'}">${value}</td>`;
            });
            
            const trendIcon = sector.trend === 'up' ? '上行' : '下行';
            const consecutiveBadge = sector.consecutiveDays >= 3 ? 
                `<span class="consecutive-badge outflow">连续${sector.consecutiveDays}日流出</span>` : '';
            
            tableHtml += `<td class="trend-cell">${trendIcon} ${consecutiveBadge}</td>`;
            
            row.innerHTML = tableHtml;
            outflowContainer.appendChild(row);
        });
    }
}

// ==================== 财经新闻数据 ====================
function loadNewsData() {
    const newsList = document.getElementById('realtime-news');
    newsList.innerHTML = '';
    
    SAMPLE_DATA.news.slice(0, 8).forEach(news => {
        const item = document.createElement('div');
        item.className = 'news-item';
        
        if (news.impact === 'positive') {
            item.classList.add('positive-news');
        } else if (news.impact === 'negative') {
            item.classList.add('negative-news');
        }
        
        // 数据标签HTML
        const dataTagsHtml = news.dataPoints && news.dataPoints.length > 0 ? 
            `<div class="news-data-tags">${news.dataPoints.map(d => `<span class="data-tag">${d}</span>`).join('')}</div>` : '';
        
        // 相关板块HTML
        const sectorsHtml = news.relatedSectors && news.relatedSectors.length > 0 ? 
            `<div class="news-sectors">相关板块：${news.relatedSectors.join('、')}</div>` : '';
        
        item.innerHTML = `
            <div class="news-header">
                <span class="news-title">${news.title}</span>
                <span class="news-time">${news.time}</span>
            </div>
            ${dataTagsHtml}
            <div class="news-summary">${news.summary}</div>
            ${sectorsHtml}
        `;
        
        item.addEventListener('click', function() {
            if (news.url) {
                window.open(news.url, '_blank');
            }
        });
        
        newsList.appendChild(item);
    });
}
