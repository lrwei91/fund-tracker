const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron')
const path = require('path')

// ============ 配置 ============
const WEB_URL = 'https://fund-tracker-one.vercel.app'

// 浮窗尺寸 + 默认位置（屏幕右下角）
const WIDGET_W = 420
const WIDGET_H = 580

let mainWin = null
let holdingWin = null

// ============ 注入脚本：把 web 切成"持仓库浮窗模式" ============
const FOCUS_HOLDING_WIDGET_SCRIPT = `
  (function focusWidget() {
    // 1. 透明 body（web 本身就是深色主题，直接透出来）
    document.documentElement.style.background = 'transparent'
    document.body.style.cssText = 'background:transparent;margin:0;padding:0;min-height:100vh;'

    // 2. 切到 dashboard 主 tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
    const dashTab = document.querySelector('.tab-btn[data-tab="dashboard"]')
    const dashPanel = document.querySelector('#tab-dashboard')
    if (dashTab) dashTab.classList.add('active')
    if (dashPanel) dashPanel.classList.add('active')

    // 3. 隐藏外层 chrome（header、tab-bar、footer、alert、设置面板等）
    const hideAll = ['.header', '.tab-bar', '.footer', '.alert-toast-container',
                     '.settings-overlay', '.settings-panel',
                     '.data-overlay', '.data-panel']
    hideAll.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.style.display = 'none')
    })

    // 4. dashboard 下只留自选股 section
    document.querySelectorAll('#tab-dashboard > section.card').forEach(s => {
      if (!s.classList.contains('watchlist-section')) s.style.display = 'none'
    })

    // 5. 自选股 section 内部：藏掉所有非内容元素
    const watchSection = document.querySelector('.watchlist-section')
    if (watchSection) {
      watchSection.removeAttribute('data-collapsed')
      const body = watchSection.querySelector('.card-body')
      if (body) body.style.display = 'block'

      // 按你要求：不要顶部"持仓库"行、不要"持仓股/候选股"tab、不要表头、不要其他按钮
      const hideInside = [
        '.card-header',              // 顶部"持仓库"标题行
        '.watchlist-tabs',           // 持仓股/候选股 tab 容器
        '.watchlist-tab-add',        // + 按钮（新增分组）
        '.watchlist-add',            // 添加股票输入框
        '.watchlist-header-row',     // 表头（股票名/股价/涨跌幅）
        '.watchlist-status'          // 状态信息
      ]
      hideInside.forEach(sel => {
        watchSection.querySelectorAll(sel).forEach(el => el.style.display = 'none')
      })

      // 强制藏删除按钮（hover 才出现）
      const removeStyle = document.createElement('style')
      removeStyle.textContent = '.watchlist-section .watchlist-remove-btn { display:none !important; }'
      document.head.appendChild(removeStyle)

      // 浮窗化样式：占满 + 圆角 + 阴影（用 web 自带的深色背景 #000）
      watchSection.style.cssText += [
        ';border-radius:14px',
        'box-shadow:0 12px 40px rgba(0,0,0,0.5)',
        'overflow:hidden',
        'background:#000',
        'margin:0',
        'width:100%',
        'box-sizing:border-box'
      ].join(';')
    }

    // 6. 顶部加一个不可见拖动 handle（无边框窗口的拖动区）
    if (!document.getElementById('__shell_drag_handle__')) {
      const handle = document.createElement('div')
      handle.id = '__shell_drag_handle__'
      handle.style.cssText = [
        'position:fixed','top:0','left:0','right:0','height:18px',
        'z-index:2147483647',
        '-webkit-app-region:drag','cursor:grab'
      ].join(';')
      document.body.appendChild(handle)
    }

    document.title = '持仓库'
  })()
`

// ============ 注入脚本：主窗口右上角浮动按钮 ============
const INJECT_FLOAT_BTN_SCRIPT = `
  (function injectBtn() {
    if (document.getElementById('__shell_holding_btn__')) return
    const btn = document.createElement('div')
    btn.id = '__shell_holding_btn__'
    btn.innerText = '📊 持仓库'
    btn.style.cssText = [
      'position:fixed','top:14px','right:14px','z-index:2147483647',
      'padding:8px 14px','background:#1677ff','color:#fff',
      'border-radius:6px','cursor:pointer','font-size:13px',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'box-shadow:0 2px 10px rgba(0,0,0,0.2)','user-select:none',
      'transition:transform .15s'
    ].join(';')
    btn.onmouseenter = () => btn.style.transform = 'scale(1.05)'
    btn.onmouseleave = () => btn.style.transform = 'scale(1)'
    btn.onclick = () => window.shell.openHoldingWindow()
    document.body.appendChild(btn)
  })()
`

// 等 SPA 渲染完再注入（文档 load 完 ≠ 内部 JS 渲染完）
function inject(win, script, delay = 1000) {
  setTimeout(() => {
    win.webContents.executeJavaScript(script).catch(() => {})
  }, delay)
}

// ============ 主窗口 ============
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    title: '基金追踪',
    backgroundColor: '#fff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWin.loadURL(WEB_URL)
  Menu.setApplicationMenu(null)
  mainWin.webContents.on('did-finish-load', () => {
    inject(mainWin, INJECT_FLOAT_BTN_SCRIPT, 800)
  })
}

// ============ 持仓库浮窗 ============
function createHoldingWidget() {
  if (holdingWin && !holdingWin.isDestroyed()) return holdingWin

  // 默认位置：屏幕右下角
  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = display.workAreaSize

  holdingWin = new BrowserWindow({
    width: WIDGET_W,
    height: WIDGET_H,
    x: sw - WIDGET_W - 20,
    y: sh - WIDGET_H - 20,
    title: '持仓库',
    // 注意：不设 parent —— macOS 上 parent/child 是 window group，hide/show 会互相干扰
    frame: false,            // 无标题栏
    transparent: true,       // 透明背景
    backgroundColor: '#00000000',
    alwaysOnTop: true,       // 置顶
    skipTaskbar: true,       // 不在 dock / win 任务栏显示
    resizable: true,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  holdingWin.setMenuBarVisibility(false)
  holdingWin.loadURL(WEB_URL)

  holdingWin.webContents.on('did-finish-load', () => {
    inject(holdingWin, FOCUS_HOLDING_WIDGET_SCRIPT, 1200)
  })

  // Esc 关闭浮窗（聚焦浮窗时按 Esc 才会触发）
  holdingWin.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      restoreMainWindow()
    }
  })

  // 手动管生命周期：主窗口关闭时带走浮窗（替代原来 parent 的效果）
  if (mainWin && !mainWin.isDestroyed()) {
    const onMainClose = () => {
      if (holdingWin && !holdingWin.isDestroyed()) holdingWin.destroy()
    }
    mainWin.on('close', onMainClose)
    holdingWin.on('closed', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.removeListener('close', onMainClose)
      }
      holdingWin = null
    })
  } else {
    holdingWin.on('closed', () => { holdingWin = null })
  }

  return holdingWin
}

// 关闭浮窗 + 显示主窗口
function restoreMainWindow() {
  if (holdingWin && !holdingWin.isDestroyed()) holdingWin.hide()
  if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) {
    mainWin.show()
    mainWin.focus()
  }
}

// 点击 📊 按钮：隐藏主窗口 + 显示浮窗
function openHoldingWidget() {
  if (mainWin && !mainWin.isDestroyed()) mainWin.hide()

  if (holdingWin && !holdingWin.isDestroyed()) {
    if (!holdingWin.isVisible()) holdingWin.show()
    holdingWin.focus()
  } else {
    createHoldingWidget()  // 内部会自己 show
  }
}

// ============ IPC ============
ipcMain.on('open-holding-window', openHoldingWidget)

// ============ App 生命周期 ============
app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
