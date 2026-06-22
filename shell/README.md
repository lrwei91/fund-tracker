# fund-tracker 桌面壳

这是 fund-tracker 托管 Web 应用的 Electron 桌面壳：

https://fund-tracker-one.vercel.app

打包后的应用名是 `恭喜发财`。桌面壳会直接加载线上 Web 应用，所以普通 Web 发版后，重启桌面应用即可加载最新页面；只有 `shell/` 目录内文件变化时，才需要重新构建桌面壳。

## 当前行为

- 主窗口加载线上 fund-tracker 看板。
- 主窗口右上角会注入固定的 **持仓浮窗** 按钮。
- 点击按钮后，在当前屏幕右下角打开一个极简、单行、置顶的持仓浮窗。
- 持仓浮窗加载同一个线上 URL，自动切到行情看板，并注入桌面壳专用的紧凑视图模式，只保留一条自选股信息。
- 如果持仓股有多条，浮窗每 5 秒自动轮播下一条。
- 持仓浮窗会隐藏主头部、顶部 Tab、非自选股卡片、自选股分组 Tab、添加输入框、表头、编辑面板、状态文案和删除按钮。
- 设置面板里的「桌面浮窗 / 价格颜色」可控制浮窗价格和涨跌幅颜色：默认按红绿显示，也可改为全部白色。
- 浮窗会先在后台完成 DOM 裁剪，再显示窗口，避免打开时闪出完整网页。
- 浮窗整体可以拖动；右上角提供 `-` 和 `x` 两个按钮。
- 点击 `-` 只隐藏浮窗，不主动拉起主窗口；点击 `x` 或按 `Esc` 会隐藏浮窗并返回主窗口。

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

- `main.js`：Electron 主进程，负责窗口创建、IPC、浮窗按钮注入和持仓浮窗 DOM 裁剪。
- `preload.js`：向线上 Web 页面暴露 `window.shell.openHoldingWindow()`、`window.shell.minimizeHoldingWindow()` 和 `window.shell.closeHoldingWindow()`。
- `package.json`：Electron 和 electron-builder 配置。
- `dist/`：本地构建产物目录，已被 `shell/.gitignore` 忽略。

## 维护说明

持仓浮窗依赖线上 Web 页面的 DOM selector。如果后续 Web 结构调整后，浮窗变空白或显示了过多内容，优先检查 `main.js` 中的 `FOCUS_HOLDING_WIDGET_SCRIPT`。

关键 selector：

| Selector | 作用 |
|---|---|
| `.tab-btn[data-tab="dashboard"]` | 将线上页面切到行情看板 |
| `#tab-dashboard` | 包含自选股卡片的行情看板容器 |
| `#tab-dashboard > section.card` | 默认隐藏行情看板下的所有卡片 |
| `.watchlist-section` | 持仓浮窗中唯一保留的卡片 |
| `.watchlist-grid` | 持仓浮窗中的可滚动自选股列表 |
| `.header`, `.tab-bar`, `.footer` | 持仓浮窗模式下隐藏的页面外层区域 |

`openHoldingWindow()`、`minimizeHoldingWindow()` 和 `closeHoldingWindow()` 使用 `ipcRenderer.invoke`，因此注入按钮可以根据主进程返回值展示打开中或打开失败状态。
