// ==================== 数据更新时间
const DATA_UPDATE_TIME = '2026-05-12 15:24:00';

// ==================== 是否交易日
const isTradingDay = true;

// ==================== 示例数据
const SAMPLE_DATA = {
    // 大盘指数（5月12日收盘）
    index: {
        shangzhi: {
            name: '上证指数',
            value: '4,132.67',
            change: '-1.61%',
            changePercent: -1.61
        },
        shengzheng: {
            name: '深证成指',
            value: '15,421.00',
            change: '-2.99%',
            changePercent: -2.99
        },
        chuangye: {
            name: '创业板指',
            value: '3,798.00',
            change: '-2.97%',
            changePercent: -2.97
        },
        zhuanke50: {
            name: '科创50',
            value: '1,726.00',
            change: '-1.83%',
            changePercent: -1.83
        }
    },
    
    // 隔夜外盘数据（5月12日）
    usMarkets: {
        dowJones: { name: '道琼斯', value: '49,704.47', change: '+0.19%' },
        nasdaq: { name: '纳斯达克', value: '26,274.13', change: '+0.10%' },
        sp500: { name: '标普500', value: '7,412.84', change: '+0.19%' }
    },
    
    // 富时A50期货
    a50Futures: {
        value: '15,245',
        change: '-1.58%',
        trend: '尾盘快速下跌'
    },
    
    // 资金流向
    capital: {
        mainCapital: {
            value: '-580.0亿',
            isPositive: false,
            note: '高位主力出逃'
        },
        northCapital: {
            value: '-68.2亿',
            isPositive: false,
            note: '近期最大单日净流出'
        }
    },

    // 自选股
    watchlist: [
        { code: '300308', name: '中际旭创', price: '1,012.80', changePercent: 2.86 },
        { code: '688981', name: '中芯国际', price: '129.40', changePercent: 1.92 },
        { code: '600900', name: '长江电力', price: '31.68', changePercent: 0.74 },
        { code: '601398', name: '工商银行', price: '7.42', changePercent: -0.27 }
    ],

    stockPool: [
        { code: '300308', name: '中际旭创', price: '1,012.80', changePercent: 2.86 },
        { code: '688981', name: '中芯国际', price: '129.40', changePercent: 1.92 },
        { code: '600900', name: '长江电力', price: '31.68', changePercent: 0.74 },
        { code: '601398', name: '工商银行', price: '7.42', changePercent: -0.27 },
        { code: '002594', name: '比亚迪', price: '318.20', changePercent: -1.14 },
        { code: '300750', name: '宁德时代', price: '289.65', changePercent: -2.38 },
        { code: '601318', name: '中国平安', price: '58.12', changePercent: 0.33 },
        { code: '600519', name: '贵州茅台', price: '1,682.00', changePercent: -0.42 }
    ],
    
    // 多日板块资金流向数据（5月10日、11日、12日）
    sectorMultiDayFlow: {
        dates: ['5月10日', '5月11日', '5月12日'],
        inflowSectors: [
            {
                name: '电网设备',
                data: ['+35.2亿', '+76亿', '+52.8亿'],
                consecutiveDays: 3,
                trend: 'up'
            },
            {
                name: '电力',
                data: ['+28.6亿', '+65.3亿', '+78.4亿'],
                consecutiveDays: 3,
                trend: 'up'
            },
            {
                name: '光纤概念',
                data: ['+22.4亿', '+45.8亿', '+38.6亿'],
                consecutiveDays: 3,
                trend: 'up'
            },
            {
                name: '证券',
                data: ['+18.5亿', '+42.1亿', '+35.2亿'],
                consecutiveDays: 3,
                trend: 'up'
            },
            {
                name: '特高压',
                data: ['+25.8亿', '+55.6亿', '+62.3亿'],
                consecutiveDays: 3,
                trend: 'up'
            }
        ],
        outflowSectors: [
            {
                name: '电子',
                data: ['-45.2亿', '-98.5亿', '-255.28亿'],
                consecutiveDays: 3,
                trend: 'down'
            },
            {
                name: '半导体',
                data: ['-68.5亿', '-71.29亿', '-156.8亿'],
                consecutiveDays: 3,
                trend: 'down'
            },
            {
                name: '计算机',
                data: ['-32.5亿', '-61.6亿', '-128.4亿'],
                consecutiveDays: 3,
                trend: 'down'
            },
            {
                name: 'AI应用',
                data: ['-28.8亿', '-45.6亿', '-98.7亿'],
                consecutiveDays: 3,
                trend: 'down'
            },
            {
                name: '新能源',
                data: ['-35.4亿', '-52.8亿', '-86.5亿'],
                consecutiveDays: 3,
                trend: 'down'
            }
        ]
    },
    
    // 板块排行
    sectors: {
        inflow: [
            { name: '电网设备', value: '+52.8亿' },
            { name: '电力', value: '+78.4亿' },
            { name: '特高压', value: '+62.3亿' },
            { name: '光纤概念', value: '+38.6亿' },
            { name: '证券', value: '+35.2亿' },
            { name: '算电协同', value: '+45.6亿' },
            { name: '绿电', value: '+52.3亿' },
            { name: '公用事业', value: '+28.9亿' }
        ],
        outflow: [
            { name: '电子', value: '-255.28亿' },
            { name: '半导体', value: '-156.8亿' },
            { name: '计算机', value: '-128.4亿' },
            { name: 'AI应用', value: '-98.7亿' },
            { name: '新能源', value: '-86.5亿' },
            { name: '光通信CPO', value: '-72.8亿' },
            { name: '存储芯片', value: '-65.3亿' },
            { name: '锂矿', value: '-52.4亿' }
        ]
    },
    
    // 财经新闻（5月12日收盘）
    news: [
        {
            title: '【收盘复盘】A股高位放量长阴失守4200点，主线剧烈分歧短期进入调整',
            time: '05-12 15:06',
            summary: 'A股三大指数高开低走，上证指数收4132.67点，跌1.61%，日内失守4200、4150点，最低探至4098点；深证成指跌2.99%，创业板跌2.97%，科创50跌1.83%。两市成交3.52万亿，维持高位放量。两市3800+个股下跌、不足1200家上涨，跌停40+只，高位股集体重挫，恐慌情绪扩散。北向资金净流出68.2亿元，为近期最大单日净流出。',
            impact: 'negative',
            relatedSectors: ['整体市场', '高位科技', '获利盘兑现'],
            dataPoints: ['上证-1.61%失守4200', '成交3.52万亿', '北向流出68.2亿', '3800+个股下跌'],
            url: 'https://finance.eastmoney.com/'
        },
        {
            title: '特朗普宣布将访华！5月13日-15日国事访问，中美元首将举行会谈',
            time: '05-12 午间',
            summary: '据外交部消息，应国家主席邀请，美国总统特朗普将于5月13日至15日对中国进行国事访问。这将是美国总统时隔9年再次访华，上次访华是2017年11月。外交部表示，中美元首将就事关中美关系的重大问题深入交换意见，为变乱交织的世界注入稳定性。这一重大外交事件有望改善中美关系预期，提振市场风险偏好。',
            impact: 'positive',
            relatedSectors: ['整体市场', '中美关系', '外资情绪', '科技出口'],
            dataPoints: ['特朗普5月13-15日访华', '时隔9年再次访华', '元首会谈'],
            url: 'https://www.fmprc.gov.cn/'
        },
        {
            title: '主力资金监控：电子板块净流出255亿创纪录，主力从高位科技撤退',
            time: '05-12 14:30',
            summary: '财联社数据显示，今日主力资金净流入电网设备、证券、铁路公路等板块，净流出电子、计算机、有色金属等板块，其中电子板块净流出255.28亿元，创近期纪录。中际旭创资金净买入19.94亿元位居首位，新易盛、山子高科、天孚通信主力资金净流入居前；中天科技遭净卖出24.83亿元位居首位，工业富联、宁德时代、北方稀土主力资金净流出额居前。',
            impact: 'negative',
            relatedSectors: ['电子', '半导体', '计算机', '高位科技股'],
            dataPoints: ['电子净流出255.28亿', '中际旭创净买入19.94亿', '中天科技净卖出24.83亿'],
            url: 'https://www.cls.cn/'
        },
        {
            title: '大唐发电5连板！电力板块强势护盘，算电协同主线确立',
            time: '05-12 收盘',
            summary: '电力板块今日逆势走强，成为市场最强主线。大唐发电5连板，股价6.70元；韶能股份涨停。算电协同板块表现亮眼，5只个股涨停。四部委联合印发《算电协同行动方案》，叠加夏季用电高峰临近，电力板块硬逻辑清晰。机构持续布局电力赛道，主力资金连续3日净流入。',
            impact: 'positive',
            relatedSectors: ['电力', '电网设备', '特高压', '算电协同', '绿电'],
            dataPoints: ['大唐发电5连板', '电力板块护盘', '算电协同行动方案落地'],
            url: 'https://finance.eastmoney.com/'
        },
        {
            title: '中芯国际并购案获批！国产晶圆代工史上最大并购迈出关键一步',
            time: '05-11',
            summary: '上交所并购重组审核委员会第5次会议正式通过中芯国际发行股份购买资产暨关联交易事项。南下资金已连续5日净买入中芯国际，共计34.3亿港元；今日再度净买入7.82亿港元。标志着国产晶圆代工行业历史上金额最大的并购案向前迈出决定性一步。',
            impact: 'positive',
            relatedSectors: ['半导体制造', '国产替代', '中芯国际概念'],
            dataPoints: ['中芯国际并购获批', '连续5日净买入34.3亿港元'],
            url: 'https://m.cngold.org/'
        },
        {
            title: '中际旭创突破千元！成为公募头号重仓股，北向资金持续加仓',
            time: '05-12 收盘',
            summary: '光通信龙头中际旭创今日股价突破千元大关，成为A股首只千元光模块股。北向资金今日净买入中际旭创19.94亿元，位居榜首。中际旭创、英伟达32亿美元合作，特种光纤G.657.A2价格暴涨650%，AI Scale-Up交换机市场预计2026年增长86%。',
            impact: 'positive',
            relatedSectors: ['光通信', 'CPO', 'AI算力硬件', '中际旭创概念'],
            dataPoints: ['中际旭创突破千元', '北向净买入19.94亿', '特种光纤涨价650%'],
            url: 'https://finance.eastmoney.com/'
        },
        {
            title: '美伊停火协议岌岌可危！原油突破100美元，通胀压力卷土重来',
            time: '05-12 隔夜',
            summary: '美国总统特朗普表示美伊停火协议处于"岌岌可危"状态，伊朗在浓缩铀等问题上拒绝妥协。国际油价5月12日大涨，布伦特原油突破104美元/桶，纽约原油涨至98美元上方。油价飙升可能向更广泛通胀领域蔓延，影响美联储降息节奏。',
            impact: 'negative',
            relatedSectors: ['能源化工', '航空运输', '通胀受益'],
            dataPoints: ['美伊谈判僵局', '原油突破100美元', '通胀压力升温'],
            url: 'https://finance.eastmoney.com/'
        },
        {
            title: '央行Q1货政报告：适度宽松基调延续，密切关注外部输入型通胀',
            time: '05-12',
            summary: '央行发布2026年一季度货币政策执行报告，明确继续实施适度宽松货币政策，保持流动性合理充裕和社会融资条件相对宽松。报告同时指出，近期中东地缘政治事件引起国际原油和部分大宗商品价格上行，对当前我国物价指标回升有一定作用，需密切关注外部输入型通胀影响。',
            impact: 'neutral',
            relatedSectors: ['整体市场', '流动性', '货币政策'],
            dataPoints: ['流动性持续宽松', '关注输入型通胀', '信贷均衡投放'],
            url: 'https://finance.eastmoney.com/'
        }
    ]
};
