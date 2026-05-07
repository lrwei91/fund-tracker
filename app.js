// ==================== 全局变量 ====================
let refreshInterval = null;
let isAutoRefresh = true;
let refreshSeconds = 60;

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    initAutoRefresh();
    bindEvents();
    loadAllData();
});

// ==================== 事件绑定 ====================
function bindEvents() {
    // 刷新按钮
    document.getElementById('refresh-btn').addEventListener('click', function() {
        loadAllData();
    });

    // 自动刷新开关
    document.getElementById('auto-refresh-toggle').addEventListener('change', function(e) {
        isAutoRefresh = e.target.checked;
        if (isAutoRefresh) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });

    // 刷新间隔选择
    document.getElementById('refresh-interval').addEventListener('change', function(e) {
        refreshSeconds = parseInt(e.target.value);
        if (isAutoRefresh) {
            startAutoRefresh();
        }
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
    loadSectorData();
    loadMultiDayFlowData(); // 新增多日资金数据加载
    loadNewsData();
    loadActiveFundsData(); // 主动管理型基金
    loadEtfData(); // ETF基金
}

function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('update-time').textContent = `最后更新：${timeStr}`;
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

// ==================== 资金流向数据 ====================
function loadCapitalData() {
    const capital = SAMPLE_DATA.capital;
    
    // 主力资金
    const mainFund = capital.mainFund;
    const mainFundEl = document.getElementById('main-fund-value');
    mainFundEl.textContent = mainFund.value;
    mainFundEl.className = 'capital-value';
    if (mainFund.isPositive) {
        mainFundEl.classList.add('positive');
    } else {
        mainFundEl.classList.add('negative');
    }
    
    // 北向资金
    const northFund = capital.northFund;
    const northFundEl = document.getElementById('north-fund-value');
    northFundEl.textContent = northFund.value;
    northFundEl.className = 'capital-value';
    if (northFund.isPositive) {
        northFundEl.classList.add('positive');
    } else {
        northFundEl.classList.add('negative');
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
            
            sector.data.forEach((value, idx) => {
                const isPositive = value.startsWith('+');
                tableHtml += `<td class="${isPositive ? 'flow-positive' : 'flow-negative'}">${value}</td>`;
            });
            
            // 趋势标识
            const trendIcon = sector.trend === 'up' ? '📈' : '📉';
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
            
            sector.data.forEach((value, idx) => {
                const isPositive = value.startsWith('+');
                tableHtml += `<td class="${isPositive ? 'flow-positive' : 'flow-negative'}">${value}</td>`;
            });
            
            const trendIcon = sector.trend === 'up' ? '📈' : '📉';
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

// ==================== 主动管理型基金数据 ====================
function loadActiveFundsData() {
    const fundsList = document.getElementById('active-funds-list');
    if (!fundsList) return;
    fundsList.innerHTML = '';
    
    SAMPLE_DATA.activeFunds.slice(0, 8).forEach(fund => {
        const card = document.createElement('div');
        card.className = 'fund-card active-fund-card';
        
        const changeClass = fund.changePercent > 0 ? 'positive' : 
                           fund.changePercent < 0 ? 'negative' : 'neutral';
        
        // 分类标签颜色
        const categoryColors = {
            '偏股混合型': 'equity',
            '灵活配置型': 'flexible',
            '普通股票型': 'stock',
            '长期纯债型': 'bond',
            '可转债型': 'convertible',
            '混合型': 'mixed'
        };
        const categoryClass = categoryColors[fund.category] || 'default';
        
        // 风险等级颜色
        const riskColors = {
            '低风险': 'risk-low',
            '中低风险': 'risk-lowmid',
            '中风险': 'risk-mid',
            '中高风险': 'risk-midhigh',
            '高风险': 'risk-high'
        };
        const riskClass = riskColors[fund.riskLevel] || 'risk-mid';
        
        // 核心催化剂标签
        const catalystsHtml = fund.keyCatalysts && fund.keyCatalysts.length > 0 ? 
            `<div class="fund-catalysts">
                ${fund.keyCatalysts.map(c => `<span class="catalyst-tag">${c}</span>`).join('')}
            </div>` : '';
        
        card.innerHTML = `
            <div class="fund-header">
                <div class="fund-title-row">
                    <span class="fund-name">${fund.name}</span>
                    <span class="fund-category ${categoryClass}">${fund.category}</span>
                    <span class="fund-risk ${riskClass}">${fund.riskLevel}</span>
                </div>
                <span class="fund-change ${changeClass}">${fund.change}</span>
            </div>
            <div class="fund-meta">
                <span class="fund-code">代码：${fund.code}</span>
                <span class="fund-manager">经理：${fund.fundManager}</span>
                <span class="fund-scale">规模：${fund.fundScale}</span>
                <span class="fund-value">净值：${fund.value}</span>
            </div>
            <div class="fund-performance">业绩表现：${fund.recentPerformance}</div>
            ${catalystsHtml}
            <div class="fund-reason">
                <div class="reason-title">📊 推荐逻辑</div>
                <div class="reason-content">${fund.recommendReason}</div>
            </div>
        `;
        
        fundsList.appendChild(card);
    });
}

// ==================== ETF基金数据 ====================
function loadEtfData() {
    const fundsList = document.getElementById('etf-list');
    if (!fundsList) return;
    fundsList.innerHTML = '';
    
    SAMPLE_DATA.etfFunds.slice(0, 8).forEach(etf => {
        const card = document.createElement('div');
        card.className = 'fund-card etf-card';
        
        const changeClass = etf.changePercent > 0 ? 'positive' : 
                           etf.changePercent < 0 ? 'negative' : 'neutral';
        
        // 分类标签颜色
        const categoryColors = {
            '宽基指数': 'broad',
            '行业主题': 'sector',
            '策略指数': 'strategy',
            '跨境指数': 'global',
            '商品指数': 'commodity'
        };
        const categoryClass = categoryColors[etf.category] || 'default';
        
        // 风险等级颜色
        const riskColors = {
            '低风险': 'risk-low',
            '中低风险': 'risk-lowmid',
            '中风险': 'risk-mid',
            '中高风险': 'risk-midhigh',
            '高风险': 'risk-high'
        };
        const riskClass = riskColors[etf.riskLevel] || 'risk-mid';
        
        // 核心催化剂标签
        const catalystsHtml = etf.keyCatalysts && etf.keyCatalysts.length > 0 ? 
            `<div class="fund-catalysts">
                ${etf.keyCatalysts.map(c => `<span class="catalyst-tag">${c}</span>`).join('')}
            </div>` : '';
        
        card.innerHTML = `
            <div class="fund-header">
                <div class="fund-title-row">
                    <span class="fund-name">${etf.name}</span>
                    <span class="fund-category ${categoryClass}">${etf.category}</span>
                    <span class="fund-risk ${riskClass}">${etf.riskLevel}</span>
                </div>
                <span class="fund-change ${changeClass}">${etf.change}</span>
            </div>
            <div class="fund-meta">
                <span class="fund-code">代码：${etf.code}</span>
                <span class="fund-scale">规模：${etf.fundScale}</span>
                <span class="fund-tracking">跟踪误差：${etf.trackingError}</span>
                <span class="fund-value">净值：${etf.value}</span>
            </div>
            <div class="fund-performance">近期表现：${etf.recentPerformance}</div>
            ${catalystsHtml}
            <div class="fund-reason">
                <div class="reason-title">📊 推荐逻辑</div>
                <div class="reason-content">${etf.recommendReason}</div>
            </div>
        `;
        
        fundsList.appendChild(card);
    });
}

// ==================== JSONP数据获取 ====================
function fetchJSONP(url, callbackName, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP request timeout'));
        }, timeout);
        
        window[callbackName] = function(data) {
            clearTimeout(timer);
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };
        
        script.src = url;
        script.onerror = function() {
            clearTimeout(timer);
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP request failed'));
        };
        
        document.body.appendChild(script);
    });
}

// 天天基金实时估值API
function fetchFundEstimate(fundCode) {
    const timestamp = new Date().getTime();
    const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${timestamp}`;
    
    return fetchJSONP(url, `jsonpgz_${fundCode}_${timestamp}`)
        .catch(() => null);
}

// 批量获取基金实时估值
async function batchFetchFundEstimates(fundCodes) {
    const results = {};
    
    for (const code of fundCodes) {
        try {
            const data = await fetchFundEstimate(code);
            if (data && data.length > 0) {
                results[code] = data[0];
            }
        } catch (e) {
            console.log(`获取基金 ${code} 数据失败`);
        }
        // 延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
}
