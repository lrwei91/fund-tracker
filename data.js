// 投资看板静态数据 - 2026年5月7日更新
// 如果API请求失败，将使用这里的数据作为后备

const DATA_UPDATE_TIME = '2026-05-07 08:30:00';

const SAMPLE_DATA = {
    today: '2026-05-07',
    isTradingDay: true,
    
    // 实时大盘指数
    realtimeIndex: {
        shangzhi: {
            name: '上证指数',
            value: 3186.52,
            change: 0.85,
            volume: '3250亿'
        },
        shengzheng: {
            name: '深证成指',
            value: 10256.78,
            change: 1.23,
            volume: '4120亿'
        },
        chuangye: {
            name: '创业板指',
            value: 2135.46,
            change: 1.56,
            volume: '1850亿'
        },
        zhuanke50: {
            name: '科创50',
            value: 925.68,
            change: 1.89,
            volume: '520亿'
        }
    },
    
    // 资金流向
    capitalFlow: {
        mainFund: {
            value: '+156.78亿',
            analysis: '主力资金大幅流入，市场情绪回暖'
        },
        northFund: {
            value: '+68.35亿',
            analysis: '北向资金连续净流入，外资看好A股'
        },
        sectorFunds: [
            { name: '人工智能', netFlow: 89.56 },
            { name: '半导体', netFlow: 65.23 },
            { name: '新能源', netFlow: 42.18 },
            { name: '创新药', netFlow: 35.67 },
            { name: '军工', netFlow: 28.92 },
            { name: '银行', netFlow: -12.34 },
            { name: '地产', netFlow: -8.56 },
            { name: '煤炭', netFlow: -5.23 },
            { name: '钢铁', netFlow: -3.45 },
            { name: '石油', netFlow: -2.18 }
        ]
    },
    
    // 利好/利空板块
    favorableSectors: {
        current: [
            { name: '人工智能', sustainability: '强', reason: 'AI大模型持续突破，算力需求旺盛', inflow: 89.56, hotStocks: ['科大讯飞', '寒武纪', '海光信息'] },
            { name: '半导体', sustainability: '强', reason: '国产替代加速，AI芯片需求爆发', inflow: 65.23, hotStocks: ['中芯国际', '北方华创', '韦尔股份'] },
            { name: '新能源', sustainability: '中', reason: '产业链价格企稳，需求逐步恢复', inflow: 42.18, hotStocks: ['宁德时代', '比亚迪', '阳光电源'] },
            { name: '创新药', sustainability: '中', reason: '医保谈判落地，创新药出海进程加速', inflow: 35.67, hotStocks: ['恒瑞医药', '药明康德', '百济神州'] }
        ],
        future: [
            { name: '量子计算', potential: '高', catalyst: '技术突破在即，商用化进程加速', expectedTime: '2026Q3' },
            { name: '人形机器人', potential: '高', catalyst: '特斯拉Optimus量产，产业链爆发', expectedTime: '2026Q2' },
            { name: '太空经济', potential: '中', catalyst: '商业航天加速发展，卫星互联网建设', expectedTime: '2026全年' }
        ],
        rotation: {
            from: ['银行', '地产', '煤炭', '钢铁'],
            to: ['人工智能', '半导体', '新能源', '创新药'],
            analysis: '市场风格切换，从传统周期板块流向科技成长板块'
        }
    },
    
    // 推荐基金（买卖建议）
    recommendedFunds: {
        buyList: [
            { code: '510300', name: '沪深300ETF', price: 3.98, change: 0.85, riskLevel: '中', expectedReturn: '15-20%', buyPrice: '3.80-4.00', targetPrice: '4.50', stopLoss: '3.60', reason: '宽基指数估值处于历史低位，适合长期布局' },
            { code: '588000', name: '科创50ETF', price: 0.93, change: 1.89, riskLevel: '高', expectedReturn: '25-35%', buyPrice: '0.90-0.95', targetPrice: '1.20', stopLoss: '0.80', reason: '科创板科技属性强，AI和半导体行情启动' },
            { code: '515080', name: '中证红利ETF', price: 1.35, change: 0.35, riskLevel: '低', expectedReturn: '8-12%', buyPrice: '1.30-1.35', targetPrice: '1.45', stopLoss: '1.25', reason: '高股息策略在震荡市中表现稳健' },
            { code: '006546', name: '兴银中短债C', price: 1.06, change: 0.02, riskLevel: '低', expectedReturn: '3-5%', buyPrice: '1.05-1.07', targetPrice: '1.08', stopLoss: '1.03', reason: '债券型基金，净值波动小，适合避险' }
        ],
        sellList: [
            { code: '510500', name: '中证500ETF', price: 5.68, change: -0.25, holdDays: 60, profit: '-2.8%', reason: '中小盘短期承压，建议减仓避险' }
        ],
        holdList: [
            { code: '110017', name: '易方达增强回报债券A', price: 1.33, change: 0.01, reason: '债券型基金，继续持有观望' }
        ]
    },
    
    // 实时新闻
    realtimeNews: [
        { title: 'AI大模型重磅发布，算力需求持续爆发', impact: '利好人工智能板块', summary: '国内头部科技公司发布新一代大模型，性能大幅提升，算力需求有望持续增长', time: '07:30', source: '财联社', importance: '高', relatedSectors: ['人工智能', '半导体', '算力'] },
        { title: '半导体国产替代加速，设备订单超预期', impact: '利好半导体板块', summary: '国内晶圆厂扩产加速，半导体设备订单超预期，国产替代进程加快', time: '08:00', source: '证券时报', importance: '高', relatedSectors: ['半导体', '设备制造'] },
        { title: '新能源汽车销量创新高，产业链回暖', impact: '利好新能源板块', summary: '4月新能源汽车销量同比增长超50%，产业链景气度回升', time: '08:15', source: '新浪财经', importance: '中', relatedSectors: ['新能源汽车', '锂电池'] },
        { title: '央行降准释放流动性，市场信心提升', impact: '利好大盘', summary: '央行宣布降准0.25个百分点，释放长期流动性约5000亿元', time: '07:00', source: '新华社', importance: '高', relatedSectors: ['金融', '地产'] },
        { title: '创新药出海再传捷报，License-in模式获认可', impact: '利好创新药板块', summary: '多家药企海外授权金额创新高，创新药出海模式获得国际认可', time: '06:45', source: '医药经济报', importance: '中', relatedSectors: ['创新药', 'CRO'] }
    ],
    
    // 市场情绪
    marketSentiment: {
        score: 68,
        level: '偏乐观',
        description: '市场情绪回暖，科技板块领涨，成交量温和放大',
        fearGreedIndex: 62
    },
    
    // 交易提示
    tradingTips: [
        '今日关注：人工智能、半导体、新能源板块',
        '北向资金连续净流入，外资看好A股后市',
        '成交量温和放大，市场活跃度提升',
        '科技板块领涨，市场风格偏向成长',
        '注意控制仓位，避免追高'
    ],
    
    // 基金静态数据（用于降级显示）
    fundData: {
        '510300': { name: '沪深300ETF', price: 3.98, change: 0.85, nav: 3.96, navDate: '2026-05-06' },
        '588000': { name: '科创50ETF', price: 0.93, change: 1.89, nav: 0.92, navDate: '2026-05-06' },
        '515080': { name: '中证红利ETF', price: 1.35, change: 0.35, nav: 1.34, navDate: '2026-05-06' },
        '510500': { name: '中证500ETF', price: 5.68, change: -0.25, nav: 5.70, navDate: '2026-05-06' },
        '006546': { name: '兴银中短债C', price: 1.06, change: 0.02, nav: 1.06, navDate: '2026-05-06' },
        '110017': { name: '易方达增强回报债券A', price: 1.33, change: 0.01, nav: 1.33, navDate: '2026-05-06' }
    }
};

// 导出数据
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DATA_UPDATE_TIME, SAMPLE_DATA };
}
