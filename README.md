# 🎉 恭喜发财

A 股实时行情看板，部署在 Vercel 上。

## 功能

- 📈 **大盘指数** — 上证、深证、创业板、科创50
- ⭐ **自选股** — 添加/移除自选股票 / ETF（5/6/9 开头代码直接当股票查，行情来自腾讯），实时行情
- 💰 **资金流向** — 主力资金（4 档：主力/大单/中单/小单）+ 北向资金（沪股通/深股通拆分）
- 🏭 **板块排行** — 行业板块资金流入/流出 TOP5（diverging bar chart）
- 📅 **自选股资金流** — 自选股 5/20/60 日主力净流入 + 近 10 日趋势（接 push2 fflow/daykline/get 端点）
- 🔥 **市场热度** — 同花顺热榜 + 东财人气榜
- ⚡ **异动提醒** — 涨停 / 炸板 / 跌停 / 昨涨停 四池 + 打板情绪速算（涨停数、炸板率、连板梯队、晋级率，最高板），接 push2ex 四端点
- 🐉 **龙虎榜** — 每日上榜股票 + 净买入金额
- 📰 **财经新闻** — 实时财经资讯

## 技术栈

- **前端**: 原生 HTML + CSS + JavaScript
- **实时行情**: 东方财富 / 腾讯财经等真实行情接口（通过 Vercel Serverless Function 代理，解决跨域）
- **东财统一限流**: `api/_utils.js` 的 `emGet()` 对所有 `*.eastmoney.com` 子域调用串行限流 + 指数退避自动重试（最多 3 次，429/5xx 与网络错误触发，403 不重试）。
- **数据持久化**: 浏览器 localStorage（自选股分组、自选指数、持仓成本）
- **部署**: Vercel

## 项目结构

```
fund-tracker/
├── api/                # Vercel Serverless Function 代理（纯后端）
│   ├── _utils.js       #   emGet 限流 / fetchGbkText / fetchJson / ok / fail
│   ├── market-data.js  #   ?type=index|capital|sector|multiday-flow
│   ├── stock.js        #   自选股实时行情（腾讯 qt.gtimg.cn）
│   ├── stock-search.js #   股票代码搜索
│   ├── fund-flow-120d.js
│   ├── hot-rank.js     #   ?source=ths|em
│   ├── limit-up.js     #   ?type=zt|zb|dt|yzt|summary
│   ├── dragon-tiger.js
│   ├── news.js         #   金十快讯
│   └── global-news.js  #   东财全球资讯
├── modules/            # 浏览器端渲染模块（IIFE 暴露到 window.*）
│   ├── cache.js        #   AppCache: readJson / TimedCache / DailyDataCache
│   ├── state.js        #   AppState: 缓存键 + 运行时 state
│   ├── utils.js
│   ├── render-market.js
│   ├── render-watchlist.js
│   ├── render-signals.js
│   ├── render-alerts.js
│   └── render-news.js
├── scripts/            # 本地开发与校验工具
│   ├── dev-server.js
│   ├── dom-contract-test.js
│   └── api-smoke-test.js
├── app.js              # 入口编排: 状态还原 + 模块 init + 定时刷新
├── index.html
├── styles.css
├── vercel.json
└── package.json
```

## API 端点

| 端点 | 文件 | 主要数据源 | 缓存策略 | 说明 |
|---|---|---|---|---|
| `GET /api/market-data?type=index` | `api/market-data.js` | 腾讯 `qt.gtimg.cn` | 5min TTL (30s) | 上证/深证/创业板/科创50 |
| `GET /api/market-data?type=capital` | `api/market-data.js` | push2 `clist/get` | 5min TTL | 主力资金 + 北向（hexin 北向另源） |
| `GET /api/market-data?type=sector` | `api/market-data.js` | push2 `clist/get` | 5min TTL | 行业板块 TOP5 |
| `GET /api/market-data?type=multiday-flow` | `api/market-data.js` | 同花顺 hyzjl + push2 | 日级持久 | 行业板块资金流入/流出（旧版多日资金，新版用 `fund-flow-120d`） |
| `GET /api/stock?codes=...` | `api/stock.js` | 腾讯 `qt.gtimg.cn` | 日级持久 | 自选股实时行情 |
| `GET /api/stock-search?q=...` | `api/stock-search.js` | searchapi.eastmoney | 无 | 股票代码搜索 |
| `GET /api/fund-flow-120d?codes=&days=` | `api/fund-flow-120d.js` | push2 `fflow/daykline/get` + 腾讯 | 日级持久 | 单股 5–120 日资金流明细 |
| `GET /api/hot-rank?source=ths\|em` | `api/hot-rank.js` | 同花顺 / emappdata + push2 ulist | 日级持久 | 市场热度榜单 |
| `GET /api/limit-up?type=zt\|zb\|dt\|yzt\|summary` | `api/limit-up.js` | push2ex 四端点 | 5min TTL（淘汰） | 打板四池 + 情绪速算 |
| `GET /api/dragon-tiger` | `api/dragon-tiger.js` | datacenter-web RPT_DAILYBILLBOARD | 日级持久 | 龙虎榜 |
| `GET /api/news?cursor=&limit=` | `api/news.js` | 金十 `flash-api.jin10.com` | 日级持久 | 金十快讯分页 |
| `GET /api/global-news?cursor=&limit=` | `api/global-news.js` | np-weblist + finance.eastmoney | 日级持久 | 东财全球资讯分页 |

## 数据源

| 域名 | 用途 | 走哪条 |
|---|---|---|
| `push2.eastmoney.com` | 指数 / 板块 / 个股资金流 / 榜单补全 | `emGet()` 串行限流 |
| `push2ex.eastmoney.com` | 打板四池（涨停/炸板/跌停/昨涨停） | `emGet()` 串行限流 |
| `datacenter-web.eastmoney.com` | 龙虎榜 RPT_DAILYBILLBOARD | `emGet()` 串行限流 |
| `emappdata.eastmoney.com` | 东财人气榜 | `emGet()` 串行限流 |
| `searchapi.eastmoney.com` | 股票代码搜索 | `emGet()` 串行限流 |
| `np-weblist.eastmoney.com` | 东财全球快讯 | `emGet()` 串行限流 |
| `qt.gtimg.cn` (腾讯) | 大盘指数 / 自选股实时行情 / 资金流名称补全 | 直连，GBK 解码 |
| `dq.10jqka.com.cn` (同花顺) | 同花顺热榜 | 直连 |
| `data.hexin.cn` (和信) | 北向资金 dayChart | `fetchJson` 直连 |
| `data.10jqka.com.cn` (同花顺) | 行业板块资金流（备选源） | 直连，GBK 解码 |
| `flash-api.jin10.com` (金十) | 财经快讯 | `fetchJson`，带签名头 |

> 单一 `api/_utils.js` 中的 `emGet()` 负责 `*.eastmoney.com` 全域串行限流，腾讯 / 同花顺 / hexin / jin10 等非东财域不参与限流，独立超时与 header。

## 缓存策略

- **日级持久**（`readDailyDataCache` / `writeDailyDataCache`）: 跨会话复用、当日有效、跨日失效；用于自选股行情、自选股资金流、热榜、龙虎榜、新闻等"一天内重复刷"的接口。
- **5 分钟 TTL**（`readTimedCache` / `writeTimedCache`）: 用于大盘/资金/板块等"实时性高、跨日也要刷"的接口。
- **5 分钟 TTL 已淘汰**: `SHORT_CACHE_KEYS.newsJin10` / `.newsEastmoney` / `.limitUpSummary` 实际不再被 `readTimedCache` 读（这些数据已全部走日级），仅作为命名历史保留；后续会清理。
- **启动清理 v1 旧 cache**: `modules/cache.js` 的 `cleanupLegacyCaches()` 会在首次调用 `readJson` / `readDailyDataCache` 时自动执行一次（懒清理），删除 `fund_tracker_multiday_flow_cache`（已被自选股资金流替代）、`fund_tracker_fund_flow_cache`（v1，已升 v2）、`fund_tracker_prev_pct`（已搬到 `index_prev_pct`）等遗留 key。

## 本地开发

```bash
npm run dev         # 起本地服务（静态 + api 代理），http://127.0.0.1:4173
npm run check       # node --check app.js / api/*.js / scripts/*.js + dom-contract-test
npm run test:api    # 对所有 api/* 端点做真实 HTTP 冒烟测试（需要外网）
```

`npm run check` 包含三步：先对 `app.js` 与所有 `api/*.js`、`scripts/*.js` 做 `node --check` 语法检查，再跑 `scripts/dom-contract-test.js` 校验 `index.html` 与各 render 模块之间的 DOM 契约。

`npm run test:api` 走真实外网（依赖 `node --check` 通过 + 网络可达东方财富/腾讯/同花顺/金十等域）。

## 部署

```bash
vercel --prod
```

## 自选股说明

- 自选股分组、自选指数、持仓成本和股数保存在浏览器 `localStorage` 中，清除浏览器缓存会丢失
- 顶部“导入/导出”会备份/恢复自选股分组、当前分组、自选指数、持仓成本和股数
- 实时行情通过 `/api/stock` 代理获取，不依赖任何外部前端库
- 支持沪深 A 股代码（6位数字），自动识别 sh/sz 前缀
- 项目不再内置静态假数据；外部真实数据源不可用时，页面会显示失败态或空态

## 数据来源

- **实时行情 / 搜索 / 榜单 / 解禁 / 新闻**: 东方财富、腾讯财经等公开接口
- **资金 / 板块**: 当前不使用不稳定或无法验证的接口填充数值；没有可靠真实源时显示空态

> ⚠️ 数据仅供参考，不构成投资建议。投资有风险，入市需谨慎。
