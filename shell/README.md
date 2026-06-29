# fund-tracker 桌面壳

这是 fund-tracker 的本地 Electron 桌面应用。

打包后的应用名是 `恭喜发财`。桌面端不再加载线上 Vercel 页面；主窗口加载打包进应用内的本地看板资源，行情 API 通过 Electron 自定义协议转发到本地 `api/*.js` 处理器。

## 当前行为

- 主窗口加载本地 fund-tracker 看板。
- 主窗口右上角在 Electron 环境下显示 **浮窗** 按钮。
- 点击按钮后，在当前屏幕右下角打开一个极简、单行、置顶的持仓浮窗。
- 持仓浮窗是独立本地 renderer，不再加载完整看板再裁剪 DOM。
- 如果持仓股有多条，浮窗每 5 秒自动轮播下一条。
- 设置面板里的「桌面浮窗 / 价格颜色」可控制浮窗价格和涨跌幅颜色：默认按红绿显示，也可改为全部白色。
- 设置面板里的「桌面浮窗 / 不透明度」可控制浮窗透明度：默认 100%，最低 0%。
- 浮窗整体可以拖动；右上角提供 `-`、`□` 和 `x` 三个按钮。
- 点击 `-` 只隐藏浮窗，不主动拉起主窗口；点击 `□` 或按 `Esc` 会隐藏浮窗并返回主窗口；点击 `x` 只关闭浮窗。

## 开发

首次安装依赖：

```bash
cd shell
npm install
```

启动桌面壳：

```bash
cd shell
npm start
```

如需通过 Chrome DevTools Protocol 调试：

```bash
cd shell
npm start -- --remote-debugging-port=9229
```

## 构建

构建产物会输出到 `shell/dist/`。

构建 macOS DMG：

```bash
cd shell
npm run build:mac
```

构建 Windows x64 NSIS 安装包：

```bash
cd shell
npm run build:win
```

同时构建 macOS 和 Windows：

```bash
cd shell
npm run build:all
```

当前 `package.json` 中的构建目标：

| 命令 | 目标平台 | 输出类型 |
|---|---|---|
| `npm run build:mac` | macOS | `.dmg` |
| `npm run build:win` | Windows x64 | NSIS `.exe` 安装器 |
| `npm run build:all` | macOS + Windows x64 | 同时输出两个平台产物 |

在 macOS 或 Linux 上构建出的 Windows 安装包未签名。macOS 构建也默认未签名，除非后续补充签名和 notarization 配置。

## macOS 首次启动拦截处理

如果 macOS 为整个应用打上隔离属性，Gatekeeper 可能会拦截未签名构建，导致应用无法正常启动。将 DMG 里的应用拖到 `/Applications` 后，在目标 Mac 上执行一次：

```bash
xattr -cr "/Applications/恭喜发财.app"
chmod +x "/Applications/恭喜发财.app/Contents/MacOS/恭喜发财"
```

上面的应用名来自 `shell/package.json` 里的 `build.productName`。如果后续修改 `productName`，这里的路径也要同步调整。

## 文件说明

- `main.js`：Electron 主进程，负责窗口创建、IPC、自定义协议和本地 API 转发。
- `preload.js`：向本地 renderer 暴露 `window.shell.openHoldingWindow()`、`window.shell.minimizeHoldingWindow()`、`window.shell.maximizeHoldingWindow()`、`window.shell.closeHoldingWindow()` 和浮窗刷新事件。
- `renderer/`：Electron 专用本地 renderer，目前包含独立持仓浮窗页面。
- `package.json`：Electron 和 electron-builder 配置。
- `dist/`：本地构建产物目录，已被 `shell/.gitignore` 忽略。

## 维护说明

主窗口里的 `fetch('/api/...')` 会在桌面端变成 `fund-tracker://app/api/...` 请求，并由 `main.js` 转给仓库根目录的 `api/*.js`。新增 API 文件后，需要确认 `shell/package.json` 的 `build.files` 仍会把它打包进 `web/api/`。

持仓浮窗读取与主窗口同源的 `localStorage`：`fund_tracker_watchlist_tabs`、`fund_tracker_watch_quote_cache` 和 `fund_tracker_settings`。如果后续改动自选股存储结构，需要同步更新 `renderer/holding-widget.js`。
