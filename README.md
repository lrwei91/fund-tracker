# 恭喜发财 Electron 应用

本分支只保留本地 Electron 桌面应用。主窗口、行情看板、API 代理和持仓浮窗都随应用一起打包。

## 功能

- 大盘指数：上证、深证、创业板、科创 50
- 自选股：分组、搜索、添加/移除、持仓成本编辑
- 资金流向：主力/大单/中单/小单、沪股通/深股通
- 自选股资金流：5/20/60 日主力净流入和趋势
- 市场信号：热榜、龙虎榜、涨停/炸板/跌停/昨涨停
- 财经快讯：金十快讯、东方财富资讯
- 桌面浮窗：独立 Electron renderer，读取主窗口本地数据

## 目录结构

```text
.
├── app/                  # 主窗口本地 renderer 和本地 API
│   ├── api/              # Electron 自定义协议转发的 API handler
│   ├── modules/          # 主窗口渲染模块
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── renderer/             # Electron 专用独立 renderer
│   ├── holding-widget.html
│   ├── holding-widget.css
│   └── holding-widget.js
├── main.js               # Electron 主进程、窗口、协议、IPC
├── preload.js            # 安全暴露 window.shell
├── package.json          # Electron 启动和打包配置
└── package-lock.json
```

## 开发

```bash
npm install
npm start
```

如需打开 Chrome DevTools Protocol：

```bash
npm start -- --remote-debugging-port=9229
```

## 构建

```bash
npm run build:mac
npm run build:win
npm run build:all
```

构建产物输出到 `dist/`，该目录不入库。

## 运行模型

`main.js` 注册 `fund-tracker://app/` 自定义协议：

- `fund-tracker://app/index.html` 加载 `app/index.html`
- `fund-tracker://app/api/...` 转发到 `app/api/*.js`
- `fund-tracker://app/renderer/holding-widget.html` 加载 `renderer/holding-widget.html`

主窗口和浮窗共享同源 `localStorage`。如果修改自选股、报价缓存或设置的存储结构，需要同步检查 `renderer/holding-widget.js`。

## 数据说明

行情和新闻来自东方财富、腾讯财经、同花顺、金十等公开接口。本应用仅做本地展示和代理转发，数据仅供参考，不构成投资建议。
