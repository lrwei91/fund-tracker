// ==================== 配置常量 ====================
const CONFIG = {
    // 东方财富新闻API (支持JSONP)
    newsApi: 'https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_AjaxHandler.ashx?type=0&pageindex=1&pagesize=10',
    
    // 东方财富板块资金流向API (支持JSONP)
    sectorApi: 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=50&po=1&np=1&fields=f12,f13,f14,f62&fid=f62&fs=m:90+t:2+f:!50&ut=b2884a393a59ad64002292a3e90d46f5',
    
    // 天天基金实时净值API (支持JSONP)
    fundApi: 'https://fundgz.1234567.com.cn/js/{code}.js?rt={timestamp}',
    
    // 推荐基金列表
    recommendFunds: [
        { code: '510300', name: '沪深300ETF' },
        { code: '588000', name: '科创50ETF' },
        { code: '515080', name: '中证红利ETF' },
        { code: '510500', name: '中证500ETF' },
        { code: '110017', name: '易方达增强回报债券' }
    ],
    
    // 基金推荐理由（预设）
    fundReasons: {
        '510300': '该基金跟踪沪深300指数，覆盖A股市场最具代表性的300家龙头企业，涵盖金融、消费、科技等核心行业，是配置中国核心资产的优选工具。近期市场整体估值处于历史中位区间，具备较高的安全边际。作为宽基指数基金，其风险分散度高，适合长期定投配置。风险提示：若宏观经济增速不及预期，指数可能面临回调压力。',
        
        '588000': '该基金跟踪科创50指数，聚焦科创板最具成长性的50家高新技术企业，涵盖半导体、人工智能、生物医药等高景气赛道。在国家大力支持科技创新的政策背景下，科创企业有望迎来发展机遇。该指数代表中国科技的未来方向，适合看好科技成长赛道的投资者。风险提示：科技行业波动较大，需承受较高的短期波动风险。',
        
        '515080': '该基金跟踪中证红利指数，精选A股市场股息率高、分红稳定的优质上市公司，以传统行业蓝筹股为主，具备低估值、高股息的特征。在市场波动较大的环境下，红利策略往往能提供较好的防御属性和稳定的现金流回报。适合追求稳健收益的保守型投资者。风险提示：红利指数在牛市中的弹性可能相对较弱。',
        
        '510500': '该基金跟踪中证500指数，覆盖A股市场中盘成长股，行业分布均衡且更具成长性。相比沪深300的大盘蓝筹，中证500指数成分股市值更小、成长空间更大，估值弹性也更高。当前中证500指数估值处于历史较低水平，具备较高的投资性价比。风险提示：中盘股流动性相对较弱，市场调整时波动可能更大。',
        
        '110017': '该基金为增强型债券基金，以债券投资为主，辅以少量权益资产增强收益，是典型的"固收+"产品。在当前利率环境下，纯债收益有限，适度配置权益资产能提升整体收益空间。基金经理历史业绩优秀，风控能力较强，适合风险偏好较低的投资者进行资产配置。风险提示：权益市场大幅波动可能影响产品净值表现。'
    }
};

// ==================== JSONP工具函数 ====================
function fetchJSONP(url, callbackParam = 'cb') {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now();
        const callbackName = `jsonp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 超时处理
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('请求超时'));
        }, 15000);
        
        // 清理函数
        function cleanup() {
            clearTimeout(timeout);
            delete window[callbackName];
            const script = document.getElementById(callbackName);
            if (script) script.remove();
        }
        
        // 创建回调
        window[callbackName] = (data) => {
            cleanup();
            resolve(data);
        };
        
        // 构造URL
        const separator = url.includes('?') ? '&' : '?';
        const jsonpUrl = `${url}${separator}${callbackParam}=${callbackName}&_=${timestamp}`;
        
        // 创建script标签
        const script = document.createElement('script');
        script.id = callbackName;
        script.src = jsonpUrl;
        script.onerror = () => {
            cleanup();
            reject(new Error('网络请求失败'));
        };
        
        document.head.appendChild(script);
    });
}

// 获取基金实时数据（天天基金特有JSONP格式）
function fetchFundRealtime(code) {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now();
        const url = CONFIG.fundApi
            .replace('{code}', code)
            .replace('{timestamp}', timestamp);
        
        const callbackName = `jsonpgz_${code}_${timestamp}`;
        
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('请求超时'));
        }, 10000);
        
        function cleanup() {
            clearTimeout(timeout);
            delete window[callbackName];
            const script = document.getElementById(callbackName);
            if (script) script.remove();
        }
        
        window[callbackName] = (data) => {
            cleanup();
            if (data && data.fundcode) {
                resolve(data);
            } else {
                reject(new Error('数据格式错误'));
            }
        };
        
        const script = document.createElement('script');
        script.id = callbackName;
        script.src = url;
        script.onerror = () => {
            cleanup();
            reject(new Error('网络请求失败'));
        };
        
        document.head.appendChild(script);
    });
}

// ==================== 数据获取函数 ====================

// 获取新闻数据
async function fetchNews() {
    try {
        const data = await fetchJSONP(CONFIG.newsApi);
        if (data && data.List) {
            return data.List.slice(0, 8).map(item => ({
                title: item.sTitle,
                time: item.sTime,
                url: item.sUrl
            }));
        }
        return [];
    } catch (error) {
        console.error('获取新闻失败:', error);
        throw error;
    }
}

// 获取板块资金流向
async function fetchSectorFlow() {
    try {
        const data = await fetchJSONP(CONFIG.sectorApi);
        if (data && data.data && data.data.diff) {
            return data.data.diff.slice(0, 6).map(item => ({
                name: item.f14,
                code: item.f12,
                netFlow: item.f62 / 100000000 // 转换为亿元
            }));
        }
        return [];
    } catch (error) {
        console.error('获取板块数据失败:', error);
        throw error;
    }
}

// 获取推荐基金数据
async function fetchRecommendFunds() {
    const results = [];
    for (const fund of CONFIG.recommendFunds) {
        try {
            const data = await fetchFundRealtime(fund.code);
            results.push({
                code: data.fundcode,
                name: data.name,
                nav: data.dwjz,        // 单位净值
                estimateNav: data.gsz,  // 估算净值
                change: data.gszzl,     // 估算涨跌幅
                reason: CONFIG.fundReasons[fund.code] || '该基金投资方向明确，适合当前市场环境。'
            });
        } catch (error) {
            console.error(`获取基金${fund.code}数据失败:`, error);
            results.push({
                code: fund.code,
                name: fund.name,
                nav: '--',
                estimateNav: '--',
                change: '--',
                reason: CONFIG.fundReasons[fund.code] || '该基金投资方向明确，适合当前市场环境。'
            });
        }
    }
    return results;
}

// ==================== 渲染函数 ====================

// 渲染日期
function renderDate() {
    const now = new Date();
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    };
    const dateStr = now.toLocaleDateString('zh-CN', options);
    document.getElementById('currentDate').textContent = dateStr;
    
    // 更新时间
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('updateTime').textContent = timeStr;
}

// 渲染新闻
function renderNews(newsList) {
    const container = document.getElementById('newsContainer');
    
    if (!newsList || newsList.length === 0) {
        container.innerHTML = '<div class="error">暂无新闻数据</div>';
        return;
    }
    
    container.innerHTML = newsList.map(news => `
        <div class="news-item">
            <div class="news-time">🕐 ${news.time}</div>
            <div class="news-title">${news.title}</div>
        </div>
    `).join('');
}

// 渲染板块
function renderSectorFlow(sectors) {
    const container = document.getElementById('sectorContainer');
    
    if (!sectors || sectors.length === 0) {
        container.innerHTML = '<div class="error">暂无板块数据</div>';
        return;
    }
    
    container.innerHTML = sectors.map(sector => `
        <div class="sector-card">
            <div class="sector-name">${sector.name}</div>
            <div class="sector-flow">
                <span class="sector-flow-label">主力净流入</span>
                <span class="sector-flow-value">+${sector.netFlow.toFixed(2)}亿</span>
            </div>
        </div>
    `).join('');
}

// 渲染基金推荐
function renderFundRecommendations(funds) {
    const container = document.getElementById('fundContainer');
    
    if (!funds || funds.length === 0) {
        container.innerHTML = '<div class="error">暂无基金数据</div>';
        return;
    }
    
    container.innerHTML = funds.map(fund => {
        const change = parseFloat(fund.change) || 0;
        const changeClass = change > 0 ? 'positive' : (change < 0 ? 'negative' : 'neutral');
        const changeSign = change > 0 ? '+' : '';
        const changeDisplay = fund.change !== '--' ? `${changeSign}${fund.change}%` : '--';
        
        return `
            <div class="fund-card">
                <div class="fund-header">
                    <span class="fund-code">${fund.code}</span>
                    <span class="fund-name">${fund.name}</span>
                    <span class="fund-change ${changeClass}">${changeDisplay}</span>
                </div>
                <div class="fund-reason">
                    <strong>推荐理由：</strong>${fund.reason}
                </div>
            </div>
        `;
    }).join('');
}

// ==================== 主函数 ====================

async function main() {
    // 渲染日期
    renderDate();
    
    // 获取并渲染新闻
    try {
        const newsData = await fetchNews();
        renderNews(newsData);
    } catch (error) {
        document.getElementById('newsContainer').innerHTML = 
            '<div class="error">新闻数据加载失败，请稍后刷新重试</div>';
    }
    
    // 获取并渲染板块数据
    try {
        const sectorData = await fetchSectorFlow();
        renderSectorFlow(sectorData);
    } catch (error) {
        document.getElementById('sectorContainer').innerHTML = 
            '<div class="error">板块数据加载失败，请稍后刷新重试</div>';
    }
    
    // 获取并渲染基金推荐
    try {
        const fundData = await fetchRecommendFunds();
        renderFundRecommendations(fundData);
    } catch (error) {
        document.getElementById('fundContainer').innerHTML = 
            '<div class="error">基金数据加载失败，请稍后刷新重试</div>';
    }
    
    // 更新最后刷新时间
    document.getElementById('updateTime').textContent = 
        new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', main);

// 每10分钟自动刷新一次数据
setInterval(() => {
    renderDate();
    main();
}, 10 * 60 * 1000);
