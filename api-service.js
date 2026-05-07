// ==================== 数据获取配置 ====================
const API_CONFIG = {
    // CORS代理服务列表（多个备用，解决跨域问题）
    // 注意：东方财富API优先使用JSONP，这些代理作为最后备选
    corsProxies: [
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/raw?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://cors-proxy.pondpilot.io/proxy?url=',
        'https://api.codetabs.com/v1/proxy?quest='
    ],
    // 当前使用的代理索引
    currentProxyIndex: 0,
    
    // 天天基金实时净值API (HTTPS版本，支持跨域JSONP)
    fundRealtimeUrl: 'https://fundgz.1234567.com.cn/js/{code}.js?rt={timestamp}',
    
    // 东方财富历史净值API (HTTPS版本)
    fundHistoryUrl: 'https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code={code}&page=1&sdate={start}&edate={end}&per=20',
    
    // 东方财富大盘指数API (支持JSONP，添加cb参数即可跨域)
    indexUrl: 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids={secids}&fields=f2,f3,f4,f5,f8,f12,f13,f14',
    
    // 东方财富主力资金流向API (支持JSONP)
    capitalFlowUrl: 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&fields=f12,f13,f14,f62&fid=f62&fs=m:90+t:2&ut=b2884a393a59ad64002292a3e90d46f5',
    
    // 东方财富板块资金流向API (支持JSONP)
    sectorFlowUrl: 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=50&po=1&np=1&fields=f12,f13,f14,f62&fid=f62&fs=m:90+t:2+f:!50&ut=b2884a393a59ad64002292a3e90d46f5',
    
    // 东方财富新闻API (支持JSONP)
    newsUrl: 'https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_AjaxHandler.ashx?type=0&pageindex=1&pagesize=20',
    
    // 新浪财经大盘API (备选)
    sinaIndexUrl: 'http://hq.sinajs.cn/list={codes}',
    
    // 指数代码映射
    indexCodes: {
        shangzhi: '1.000001',  // 上证指数
        shengzheng: '0.399001', // 深证成指
        chuangye: '0.399006',   // 创业板指
        zhuanke50: '1.000688'  // 科创50
    },
    
    // 关注的基金列表
    watchFunds: ['510300', '588000', '515080', '510500', '006546', '110017'],
    
    // 刷新间隔（毫秒）
    refreshInterval: 60000
};

// ==================== 缓存机制 ====================
const DataCache = {
    // 缓存有效期（5分钟）
    CACHE_DURATION: 5 * 60 * 1000,
    
    cache: {},
    
    set(key, data) {
        this.cache[key] = {
            data: data,
            timestamp: Date.now()
        };
    },
    
    get(key) {
        const item = this.cache[key];
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.CACHE_DURATION) {
            delete this.cache[key];
            return null;
        }
        return item.data;
    },
    
    clear() {
        this.cache = {};
    }
};

// ==================== API调用工具 ====================
const ApiService = {
    // 使用JSONP获取数据（东方财富API原生支持，优先使用此方法）
    fetchWithJSONP(url) {
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            const callbackName = `jsonp_callback_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
            
            // 设置超时
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('JSONP请求超时'));
            }, 15000);
            
            // 清理函数
            const cleanup = () => {
                clearTimeout(timeout);
                delete window[callbackName];
                const script = document.getElementById(callbackName);
                if (script) script.remove();
            };
            
            // 创建JSONP回调
            window[callbackName] = (data) => {
                cleanup();
                resolve(data);
            };
            
            // 构造带cb参数的URL
            const separator = url.includes('?') ? '&' : '?';
            const jsonpUrl = `${url}${separator}cb=${callbackName}&_=${timestamp}`;
            
            const script = document.createElement('script');
            script.id = callbackName;
            script.src = jsonpUrl;
            script.onerror = () => {
                cleanup();
                reject(new Error('JSONP请求失败'));
            };
            document.head.appendChild(script);
        });
    },
    
    // 使用JSONP获取基金实时数据
    getFundRealtime(code) {
        return new Promise((resolve, reject) => {
            // 检查缓存
            const cacheKey = `fund_realtime_${code}`;
            const cached = DataCache.get(cacheKey);
            if (cached) {
                resolve(cached);
                return;
            }
            
            const timestamp = Date.now();
            const url = API_CONFIG.fundRealtimeUrl
                .replace('{code}', code)
                .replace('{timestamp}', timestamp);
            
            // JSONP回调
            const callbackName = `jsonpgz_${code}_${timestamp}`;
            
            // 设置超时
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('请求超时'));
            }, 10000);
            
            // 清理函数
            const cleanup = () => {
                clearTimeout(timeout);
                delete window[callbackName];
                const script = document.getElementById(callbackName);
                if (script) script.remove();
            };
            
            // 创建JSONP请求
            window[callbackName] = (data) => {
                cleanup();
                if (data && data.fundcode) {
                    DataCache.set(cacheKey, data);
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
    },
    
    // 批量获取基金数据
    async getBatchFundRealtime(codes) {
        const results = {};
        const promises = codes.map(async (code) => {
            try {
                const data = await this.getFundRealtime(code);
                results[code] = {
                    success: true,
                    data: data
                };
            } catch (error) {
                results[code] = {
                    success: false,
                    error: error.message
                };
            }
        });
        await Promise.all(promises);
        return results;
    },
    
    // 获取基金历史净值（通过页面解析）
    async getFundHistory(code, days = 30) {
        const cacheKey = `fund_history_${code}`;
        const cached = DataCache.get(cacheKey);
        if (cached) return cached;
        
        try {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - days);
            
            const url = API_CONFIG.fundHistoryUrl
                .replace('{code}', code)
                .replace('{start}', this.formatDate(start))
                .replace('{end}', this.formatDate(end));
            
            const response = await fetch(url);
            const text = await response.text();
            
            // 解析HTML表格
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const rows = doc.querySelectorAll('tbody tr');
            
            const history = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    history.push({
                        date: cells[0].textContent.trim(),
                        nav: parseFloat(cells[1].textContent) || 0,
                        cumNav: parseFloat(cells[2].textContent) || 0,
                        change: cells[3].textContent.trim()
                    });
                }
            });
            
            DataCache.set(cacheKey, history);
            return history;
        } catch (error) {
            console.error(`获取基金${code}历史数据失败:`, error);
            return [];
        }
    },
    
    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },
    
    // 使用CORS代理获取数据（支持多个代理自动切换，作为JSONP失败后的备选）
    async fetchWithCorsProxy(url) {
        // 优先尝试JSONP
        try {
            const result = await this.fetchWithJSONP(url);
            return result;
        } catch (jsonpError) {
            console.warn('JSONP请求失败，尝试使用CORS代理:', jsonpError.message);
        }
        
        // 尝试所有代理
        for (let i = 0; i < API_CONFIG.corsProxies.length; i++) {
            const proxyUrl = API_CONFIG.corsProxies[i] + encodeURIComponent(url);
            try {
                // 使用AbortController实现超时
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const text = await response.text();
                    try {
                        return JSON.parse(text);
                    } catch (e) {
                        // 如果JSON解析失败，试试其他代理
                        console.warn(`代理${i}返回非JSON格式，尝试下一个`);
                        continue;
                    }
                }
            } catch (error) {
                console.warn(`代理${i}请求失败，尝试下一个:`, error.message);
                continue;
            }
        }
        
        // 所有代理都失败，尝试直接请求（可能会被CORS阻止）
        try {
            console.warn('所有CORS代理都失败，尝试直接请求');
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (e) {
            console.warn('直接请求也失败，将使用静态数据');
            // 返回null，让调用方知道应该使用静态数据
            return null;
        }
    }
};

// ==================== 指数数据获取 ====================
const IndexService = {
    // 获取大盘指数实时数据（从东方财富API，使用JSONP）
    async getIndexData() {
        const cacheKey = 'index_data';
        const cached = DataCache.get(cacheKey);
        if (cached) return cached;
        
        try {
            // 构建指数代码列表
            const secids = Object.values(API_CONFIG.indexCodes).join(',');
            const url = API_CONFIG.indexUrl.replace('{secids}', secids);
            
            const response = await ApiService.fetchWithJSONP(url);
            
            // 如果返回null，表示API失败，使用静态数据
            if (!response) {
                console.log('API请求失败，使用静态指数数据');
                return null;
            }
            
            const result = {};
            
            if (response?.data?.diff) {
                const indexKeyMap = Object.keys(API_CONFIG.indexCodes);
                const indexValues = Object.values(API_CONFIG.indexCodes);
                
                response.data.diff.forEach((item, idx) => {
                    const key = indexKeyMap[indexValues.indexOf(`${item.f13}.${item.f12}`)];
                    if (key) {
                        result[key] = {
                            name: item.f14,
                            value: item.f2,           // 最新价
                            change: item.f3,         // 涨跌幅
                            changeAmount: item.f4,   // 涨跌额
                            volume: this.formatVolume(item.f5),  // 成交量
                            turnover: item.f8        // 成交额
                        };
                    }
                });
            }
            
            DataCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.warn('获取大盘指数失败，使用静态数据:', error);
            return null;
        }
    },
    
    // 备选：从基金数据估算大盘
    async getIndexDataFromFund() {
        // 获取主要ETF的实时数据来估算大盘
        const fundData = await ApiService.getBatchFundRealtime(['510300', '588000']);
            
            const data = {
                shangzhi: { name: '上证指数', value: '--', change: '--', volume: '--' },
                shengzheng: { name: '深证成指', value: '--', change: '--', volume: '--' },
                chuangye: { name: '创业板指', value: '--', change: '--', volume: '--' },
                zhuanke50: { name: '科创50', value: '--', change: '--', volume: '--' }
            };
            
            // 从沪深300ETF估算上证指数
            if (fundData['510300']?.success) {
                const d = fundData['510300'].data;
                data.shangzhi.value = (parseFloat(d.gsz) * 850).toFixed(2);
                data.shangzhi.change = d.gszzl + '%';
                data.shangzhi.volume = '约2.5万亿';
            }
            
            // 从科创50ETF估算科创50
            if (fundData['588000']?.success) {
                const d = fundData['588000'].data;
                data.zhuanke50.value = (parseFloat(d.gsz) * 950).toFixed(2);
                data.zhuanke50.change = d.gszzl + '%';
                data.zhuanke50.volume = '约1000亿';
            }
            
            DataCache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error('获取指数数据失败:', error);
            return null;
        }
    },
    
    // 格式化成交量
    formatVolume(volume) {
        if (!volume) return '--';
        if (volume >= 100000000) {
            return (volume / 100000000).toFixed(2) + '亿';
        } else if (volume >= 10000) {
            return (volume / 10000).toFixed(2) + '万';
        }
        return volume.toString();
    }
};

// ==================== 资金流向服务 ====================
const CapitalFlowService = {
    async getCapitalFlow() {
        const cacheKey = 'capital_flow';
        const cached = DataCache.get(cacheKey);
        if (cached) return cached;
        
        try {
            const url = API_CONFIG.capitalFlowUrl;
            const response = await ApiService.fetchWithJSONP(url);
            
            // API失败，返回null使用静态数据
            if (!response) return null;
            
            const result = {
                mainFund: { value: 0, analysis: '数据加载中' },
                northFund: { value: 0, analysis: '数据加载中' }
            };
            
            if (response?.data?.diff) {
                // 解析主力资金数据
                const mainFundItem = response.data.diff.find(item => 
                    item.f14 && item.f14.includes('主力')
                );
                if (mainFundItem) {
                    result.mainFund = {
                        value: this.formatAmount(mainFundItem.f62),
                        analysis: this.getFlowAnalysis(mainFundItem.f62)
                    };
                }
            }
            
            DataCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.warn('获取资金流向失败，使用静态数据:', error);
            return null;
        }
    },
    
    async getSectorFlow() {
        const cacheKey = 'sector_flow';
        const cached = DataCache.get(cacheKey);
        if (cached) return cached;
        
        try {
            const url = API_CONFIG.sectorFlowUrl;
            const response = await ApiService.fetchWithJSONP(url);
            
            // API失败，返回null使用静态数据
            if (!response) return null;
            
            const result = { inflow: [], outflow: [] };
            
            if (response?.data?.diff) {
                const sectors = response.data.diff.map(item => ({
                    name: item.f14,
                    code: item.f12,
                    netInflow: item.f62,
                    netInflowStr: this.formatAmount(item.f62)
                }));
                
                // 按净流入排序
                sectors.sort((a, b) => b.netInflow - a.netInflow);
                result.inflow = sectors.slice(0, 10);
                result.outflow = sectors.slice(-10).reverse();
            }
            
            DataCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.warn('获取板块资金流向失败，使用静态数据:', error);
            return null;
        }
    },
    
    formatAmount(amount) {
        if (!amount) return '--';
        const abs = Math.abs(amount);
        const sign = amount >= 0 ? '+' : '-';
        
        if (abs >= 100000000) {
            return sign + (abs / 100000000).toFixed(2) + '亿';
        } else if (abs >= 10000) {
            return sign + (abs / 10000).toFixed(2) + '万';
        }
        return sign + abs.toString();
    },
    
    getFlowAnalysis(amount) {
        if (amount > 1000000000) return '大幅流入，市场情绪积极';
        if (amount > 0) return '小幅流入，市场观望';
        if (amount > -1000000000) return '小幅流出，注意风险';
        return '大幅流出，谨慎操作';
    },
    
    getFallbackCapitalFlow() {
        return {
            mainFund: { value: '--', analysis: '数据暂不可用' },
            northFund: { value: '--', analysis: '数据暂不可用' }
        };
    }
};

// ==================== 新闻服务 ====================
const NewsService = {
    async getNews() {
        const cacheKey = 'news_data';
        const cached = DataCache.get(cacheKey);
        if (cached) return cached;
        
        try {
            const url = API_CONFIG.newsUrl;
            const response = await ApiService.fetchWithJSONP(url);
            
            // API失败，返回null使用静态数据
            if (!response) return null;
            
            const result = [];
            
            if (response?.data) {
                const newsList = Array.isArray(response.data) ? response.data : [];
                newsList.forEach(item => {
                    result.push({
                        title: item.title || item.news_title || '',
                        summary: item.content || item.summary || '',
                        time: item.time || item.news_time || '',
                        source: item.source || item.media || '东方财富',
                        type: this.classifyNews(item)
                    });
                });
            }
            
            DataCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.warn('获取新闻失败，使用静态数据:', error);
            return null;
        }
    },
    
    classifyNews(item) {
        const title = (item.title || item.news_title || '').toLowerCase();
        const content = (item.content || item.summary || '').toLowerCase();
        const fullText = title + ' ' + content;
        
        const positiveKeywords = ['涨', '利好', '增长', '盈利', '突破', '创历史新高', '增持', '回购'];
        const negativeKeywords = ['跌', '利空', '亏损', '下滑', '减持', '暴跌', '风险', '处罚'];
        
        let positiveScore = 0;
        let negativeScore = 0;
        
        positiveKeywords.forEach(kw => {
            if (fullText.includes(kw)) positiveScore++;
        });
        
        negativeKeywords.forEach(kw => {
            if (fullText.includes(kw)) negativeScore++;
        });
        
        if (positiveScore > negativeScore) return 'positive';
        if (negativeScore > positiveScore) return 'negative';
        return 'neutral';
    },
    
    getFallbackNews() {
        return [
            { title: '市场数据更新中', summary: '正在获取最新财经资讯...', time: '', source: '系统', type: 'neutral' }
        ];
    }
};

// ==================== 数据管理器 ====================
const DataManager = {
    // 实时基金数据
    realtimeFunds: {},
    
    // 指数数据
    indexData: null,
    
    // 资金流向数据
    capitalFlowData: null,
    
    // 板块流向数据
    sectorFlowData: null,
    
    // 新闻数据
    newsData: null,
    
    // 是否正在加载
    isLoading: false,
    
    // 初始化
    async init() {
        this.isLoading = true;
        this.updateStatus('正在加载实时数据...');
        
        try {
            // 并行获取所有数据
            const [fundResults, indexData, capitalFlow, sectorFlow, newsData] = await Promise.all([
                // 批量获取基金实时数据
                ApiService.getBatchFundRealtime(API_CONFIG.watchFunds),
                // 获取指数数据
                IndexService.getIndexData(),
                // 获取资金流向
                CapitalFlowService.getCapitalFlow(),
                // 获取板块流向
                CapitalFlowService.getSectorFlow(),
                // 获取新闻
                NewsService.getNews()
            ].map(p => p.catch(e => {
                console.warn('部分数据加载失败:', e);
                return null;
            })));
            
            // 处理基金数据
            if (fundResults) {
                Object.entries(fundResults).forEach(([code, result]) => {
                    if (result.success) {
                        this.realtimeFunds[code] = result.data;
                    }
                });
            }
            
            this.indexData = indexData;
            this.capitalFlowData = capitalFlow;
            this.sectorFlowData = sectorFlow;
            this.newsData = newsData;
            
            this.updateStatus(`数据更新时间：${new Date().toLocaleString()}（实时数据来自东方财富、天天基金）`);
            this.updateDataSourceInfo();
            this.isLoading = false;
            return true;
        } catch (error) {
            console.error('初始化数据失败:', error);
            this.updateStatus('数据加载失败，请刷新重试');
            this.isLoading = false;
            return false;
        }
    },
    
    // 刷新数据
    async refresh() {
        DataCache.clear();
        return this.init();
    },
    
    // 更新状态显示
    updateStatus(message) {
        const statusEl = document.getElementById('update-time');
        if (statusEl) {
            statusEl.textContent = message;
        }
    },
    
    // 更新数据源信息
    updateDataSourceInfo() {
        // 可以在这里添加数据来源的显示逻辑
    },
    
    // 获取指数数据
    getIndex() {
        return this.indexData;
    },
    
    // 获取资金流向数据
    getCapitalFlow() {
        return this.capitalFlowData;
    },
    
    // 获取板块流向数据
    getSectorFlow() {
        return this.sectorFlowData;
    },
    
    // 获取新闻数据
    getNews() {
        return this.newsData;
    },
    
    // 获取基金实时数据（兼容旧接口）
    getFund(code) {
        return this.realtimeFunds[code];
    },
    
    // 获取基金实时数据
    getFundRealtime(code) {
        return this.realtimeFunds[code];
    },
    
    // 获取所有基金数据
    getAllFunds() {
        return this.realtimeFunds;
    }
};

// 导出模块（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_CONFIG, DataCache, ApiService, IndexService, CapitalFlowService, NewsService, DataManager };
}
