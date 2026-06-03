# 基金追踪 - 桌面壳

Electron 壳，把 [fund-tracker web](https://fund-tracker-one.vercel.app) 套成 mac/win 桌面应用。

## 行为

- 主窗口加载 web 主页，右上角注入 **📊 持仓库** 浮动按钮
- 点击按钮 → 新开一个 960×720 的小窗，加载同一个 URL，通过注入脚本**只显示自选股（=持仓库）section**，其他全部隐藏
- 持仓库里的 3 个分组 tab（行情下自选股可以新建分组）会原样保留
- web 端发版后，**重启 app 拉的就是最新内容**，不需要重新打包

## 开发

```bash
cd shell
npm install
npm start
```

## 打包

```bash
# mac（出 .dmg）
npm run build:mac

# win（出 .exe 安装器；可在 mac/linux 上交叉打包，未签名）
npm run build:win

# 两个平台一起
npm run build:all
```

产物在 `shell/dist/`。

## 文件说明

- `main.js` —— Electron 主进程：窗口创建、IPC、注入脚本
- `preload.js` —— 暴露 `window.shell.openHoldingWindow()` 给 web 调用
- `package.json` —— electron-builder 配置

## web 端 DOM 选择器（注入脚本依赖）

如果 web 改版后样式/选择器变了，重点检查 `main.js` 里 `FOCUS_HOLDING_SCRIPT` 的这些 selector：

| 选择器 | 作用 |
|---|---|
| `.tab-btn[data-tab="dashboard"]` | 主 tab 切到行情 |
| `.header-right` | 藏头部右侧按钮 |
| `.tab-bar` | 藏顶部主 tab 栏 |
| `#tab-dashboard > section.card` | dashboard 下所有卡片 |
| `.watchlist-section` | 保留的自选股卡片 |
| `.footer` | 藏底部 |
| `#header-title` | 标题改文案 |
