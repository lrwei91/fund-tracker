const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron')
const path = require('path')

// ============ 配置 ============
const WEB_URL = 'https://fund-tracker-one.vercel.app'

// 浮窗尺寸 + 默认位置（屏幕右下角）
const WIDGET_W = 320
const WIDGET_H = 58
const WIDGET_MARGIN = 20

let mainWin = null
let holdingWin = null

// ============ 注入脚本：把 web 切成"持仓库浮窗模式" ============
const FOCUS_HOLDING_WIDGET_SCRIPT = `
  (function focusWidget() {
    const STYLE_ID = '__shell_holding_widget_style__'
    const CONTROLS_ID = '__shell_holding_controls__'
    const MINIMIZE_ID = '__shell_holding_minimize__'
    const CLOSE_ID = '__shell_holding_close__'
    const ROTATE_MS = 5000

    document.title = '持仓浮窗'
    document.documentElement.classList.add('shell-holding-mode')
    document.body.classList.add('shell-holding-mode')

    const dashTab = document.querySelector('.tab-btn[data-tab="dashboard"]')
    const dashPanel = document.querySelector('#tab-dashboard')
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn === dashTab))
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel === dashPanel))
    try {
      localStorage.setItem('fund_tracker_active_watch_tab', 'default')
    } catch (e) { /* ignore */ }
    const holdingTab = document.querySelector('.watchlist-tab[data-watch-tab="default"]')
    if (holdingTab && !holdingTab.classList.contains('active')) holdingTab.click()

    const watchSection = document.querySelector('.watchlist-section')
    if (watchSection) {
      watchSection.removeAttribute('data-collapsed')
      const body = watchSection.querySelector('.card-body')
      if (body) {
        body.hidden = false
        body.style.display = 'block'
      }
    }

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = [
        'html.shell-holding-mode, body.shell-holding-mode { background: transparent !important; margin: 0 !important; padding: 0 !important; min-height: 100vh !important; overflow: hidden !important; }',
        'body.shell-holding-mode .header, body.shell-holding-mode .tab-bar, body.shell-holding-mode .footer, body.shell-holding-mode .alert-toast-container, body.shell-holding-mode .settings-overlay, body.shell-holding-mode .settings-panel, body.shell-holding-mode .data-overlay, body.shell-holding-mode .data-panel { display: none !important; }',
        'body.shell-holding-mode #main-content { height: 100vh !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important; overflow: hidden !important; }',
        'body.shell-holding-mode .tab-panel { display: none !important; }',
        'body.shell-holding-mode #tab-dashboard { display: block !important; height: 100% !important; }',
        'body.shell-holding-mode #tab-dashboard > section.card { display: none !important; }',
        'body.shell-holding-mode #tab-dashboard > section.watchlist-section { display: flex !important; flex-direction: column !important; height: 100vh !important; min-height: 0 !important; margin: 0 !important; border: 0 !important; border-radius: 10px !important; overflow: hidden !important; background: #050608 !important; box-shadow: 0 10px 30px rgba(0,0,0,.45) !important; box-sizing: border-box !important; }',
        'body.shell-holding-mode .watchlist-section .card-header, body.shell-holding-mode .watchlist-section .watchlist-toolbar, body.shell-holding-mode .watchlist-section .watchlist-add, body.shell-holding-mode .watchlist-section .watchlist-edit-panel, body.shell-holding-mode .watchlist-section .watchlist-header-row, body.shell-holding-mode .watchlist-section .watchlist-status, body.shell-holding-mode .watchlist-section .watchlist-remove-btn { display: none !important; }',
        'body.shell-holding-mode .watchlist-section .card-body { display: block !important; flex: 1 1 auto !important; min-height: 0 !important; padding: 0 42px 0 10px !important; overflow: hidden !important; }',
        'body.shell-holding-mode .watchlist-grid { position: relative !important; display: block !important; height: 100% !important; margin: 0 !important; overflow: hidden !important; }',
        'body.shell-holding-mode .watchlist-empty { height: 100% !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; }',
        'body.shell-holding-mode .watchlist-item { position: absolute !important; inset: 0 !important; display: grid !important; grid-template-columns: minmax(64px, 1fr) 54px 70px !important; align-items: center !important; gap: 8px !important; height: 100% !important; padding: 0 !important; border: 0 !important; background: transparent !important; opacity: 0 !important; transform: translateY(4px) !important; pointer-events: none !important; transition: opacity .22s ease, transform .22s ease !important; -webkit-app-region: no-drag !important; }',
        'body.shell-holding-mode .watchlist-grid.with-cost .watchlist-item { grid-template-columns: minmax(64px, 1fr) 54px 70px !important; }',
        'body.shell-holding-mode .watchlist-item.shell-active-holding { opacity: 1 !important; transform: translateY(0) !important; pointer-events: auto !important; }',
        'body.shell-holding-mode .watchlist-stock-cost { display: none !important; }',
        'body.shell-holding-mode .watchlist-item-main { min-width: 0 !important; display: grid !important; grid-template-columns: minmax(0, 1fr) auto !important; align-items: baseline !important; gap: 5px !important; }',
        'body.shell-holding-mode .watchlist-stock-name { font-size: 13px !important; font-weight: 700 !important; line-height: 1 !important; min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }',
        'body.shell-holding-mode .watchlist-stock-code { font-size: 10px !important; line-height: 1 !important; color: #7b8496 !important; }',
        'body.shell-holding-mode .watchlist-stock-price { font-size: 15px !important; font-weight: 800 !important; line-height: 1 !important; text-align: right !important; letter-spacing: 0 !important; }',
        'body.shell-holding-mode .watchlist-stock-change { font-size: 12px !important; font-weight: 800 !important; line-height: 1 !important; padding: 3px 5px !important; justify-content: center !important; border-radius: 2px !important; }',
        'body.shell-holding-mode .watchlist-stock-change .trend-arrow { display: none !important; }',
        'body.shell-holding-mode.shell-holding-white .watchlist-stock-price, body.shell-holding-mode.shell-holding-white .watchlist-stock-change { color: #f8fafc !important; background: transparent !important; }',
        '#__shell_drag_handle__ { position: fixed; inset: 0; z-index: 2147483645; -webkit-app-region: drag; cursor: grab; }',
        '#__shell_holding_controls__ { position: fixed; top: 3px; right: 4px; z-index: 2147483647; display: flex; align-items: center; gap: 3px; -webkit-app-region: no-drag; }',
        '#__shell_holding_controls__ button { width: 16px; height: 16px; border: 0; border-radius: 999px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.68); font: 12px/16px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; transition: background .12s ease, color .12s ease, transform .12s ease; -webkit-app-region: no-drag; }',
        '#__shell_holding_controls__ button:hover { background: rgba(255,255,255,.22); color: #fff; transform: translateY(-1px); }',
        '#__shell_holding_controls__ button:active { transform: translateY(0); background: rgba(255,255,255,.28); }',
        '#__shell_holding_minimize__ { font-size: 13px !important; line-height: 13px !important; padding-bottom: 2px !important; }',
        '#__shell_holding_close__:hover { background: rgba(255,70,70,.34) !important; }'
      ].join('\\n')
      document.head.appendChild(style)
    }

    function syncHoldingColorMode() {
      let mode = 'market'
      try {
        const settings = JSON.parse(localStorage.getItem('fund_tracker_settings') || '{}') || {}
        if (settings.holdingColorMode === 'white') mode = 'white'
      } catch (e) { /* ignore */ }
      document.documentElement.classList.toggle('shell-holding-white', mode === 'white')
      document.body.classList.toggle('shell-holding-white', mode === 'white')
    }

    syncHoldingColorMode()
    if (!window.__shellHoldingColorBound) {
      window.__shellHoldingColorBound = true
      window.addEventListener('storage', syncHoldingColorMode)
      window.__shellHoldingColorTimer = setInterval(syncHoldingColorMode, 1000)
    }

    function getHoldingItems() {
      return Array.from(document.querySelectorAll('.watchlist-grid .watchlist-item'))
        .filter(item => item.getAttribute('data-code') && item.querySelector('.watchlist-stock-name'))
    }

    function getActiveCode() {
      const active = document.querySelector('.watchlist-item.shell-active-holding')
      return active ? active.getAttribute('data-code') : ''
    }

    function setActiveHoldingItem(nextIndex, preferredCode) {
      const items = getHoldingItems()
      if (!items.length) {
        document.body.dataset.shellHoldingIndex = '0'
        return
      }

      let index = Number(nextIndex)
      if (preferredCode) {
        const matchedIndex = items.findIndex(item => item.getAttribute('data-code') === preferredCode)
        if (matchedIndex >= 0) index = matchedIndex
      }
      if (!Number.isFinite(index) || index < 0 || index >= items.length) index = 0

      items.forEach((item, i) => item.classList.toggle('shell-active-holding', i === index))
      document.body.dataset.shellHoldingIndex = String((index + 1) % items.length)
    }

    function rotateHoldingItems() {
      setActiveHoldingItem(Number(document.body.dataset.shellHoldingIndex || '0'))

      if (window.__shellHoldingTicker) clearTimeout(window.__shellHoldingTicker)
      if (getHoldingItems().length > 1) {
        window.__shellHoldingTicker = setTimeout(rotateHoldingItems, ROTATE_MS)
      } else {
        window.__shellHoldingTicker = null
      }
    }

    function syncHoldingItemsAfterRender() {
      const activeCode = getActiveCode()
      const currentIndex = Number(document.body.dataset.shellHoldingIndex || '0') - 1
      setActiveHoldingItem(currentIndex, activeCode)

      if (window.__shellHoldingTicker) clearTimeout(window.__shellHoldingTicker)
      window.__shellHoldingTicker = null
      if (getHoldingItems().length > 1) {
        window.__shellHoldingTicker = setTimeout(rotateHoldingItems, ROTATE_MS)
      }
    }

    syncHoldingItemsAfterRender()

    const grid = document.querySelector('.watchlist-grid')
    if (grid && !window.__shellHoldingObserver) {
      window.__shellHoldingObserver = new MutationObserver(() => {
        if (window.__shellHoldingSyncFrame) cancelAnimationFrame(window.__shellHoldingSyncFrame)
        window.__shellHoldingSyncFrame = requestAnimationFrame(syncHoldingItemsAfterRender)
      })
      window.__shellHoldingObserver.observe(grid, { childList: true })
    }

    if (!document.getElementById('__shell_drag_handle__')) {
      const handle = document.createElement('div')
      handle.id = '__shell_drag_handle__'
      document.body.appendChild(handle)
    }

    if (!document.getElementById(CONTROLS_ID)) {
      const controls = document.createElement('div')
      controls.id = CONTROLS_ID

      const minimizeBtn = document.createElement('button')
      minimizeBtn.id = MINIMIZE_ID
      minimizeBtn.type = 'button'
      minimizeBtn.textContent = '–'
      minimizeBtn.title = '最小化浮窗'
      minimizeBtn.setAttribute('aria-label', '最小化浮窗')
      minimizeBtn.addEventListener('click', () => {
        if (window.shell && window.shell.minimizeHoldingWindow) window.shell.minimizeHoldingWindow()
      })

      const closeBtn = document.createElement('button')
      closeBtn.id = CLOSE_ID
      closeBtn.type = 'button'
      closeBtn.textContent = '×'
      closeBtn.title = '关闭浮窗并返回主窗口'
      closeBtn.setAttribute('aria-label', '关闭浮窗并返回主窗口')
      closeBtn.addEventListener('click', () => {
        if (window.shell && window.shell.closeHoldingWindow) window.shell.closeHoldingWindow()
      })

      controls.appendChild(minimizeBtn)
      controls.appendChild(closeBtn)
      document.body.appendChild(controls)
    }

    return Boolean(watchSection)
  })()
`

// ============ 注入脚本：主窗口右上角浮动按钮 ============
const INJECT_FLOAT_BTN_SCRIPT = `
  (function injectBtn() {
    if (!window.shell || !window.shell.openHoldingWindow) return false
    const BTN_ID = '__shell_holding_btn__'
    let btn = document.getElementById(BTN_ID)
    if (!btn) {
      btn = document.createElement('button')
      btn.id = BTN_ID
      btn.type = 'button'
      btn.innerHTML = '<span class="shell-holding-icon">▣</span><span>持仓浮窗</span>'
      btn.title = '打开持仓浮窗'
      btn.setAttribute('aria-label', '打开持仓浮窗')
      btn.style.cssText = [
        'position:fixed','top:14px','right:14px','z-index:2147483647',
        'display:inline-flex','align-items:center','gap:6px',
        'height:34px','padding:0 12px','border:1px solid rgba(255,255,255,.14)',
        'background:rgba(15,23,42,.92)','color:#fff','border-radius:8px',
        'cursor:pointer','font:600 13px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        'box-shadow:0 8px 28px rgba(0,0,0,.25)','user-select:none',
        'transition:transform .15s, background .15s, opacity .15s','-webkit-app-region:no-drag'
      ].join(';')
      btn.onmouseenter = () => { if (!btn.disabled) btn.style.transform = 'translateY(-1px)' }
      btn.onmouseleave = () => { btn.style.transform = 'translateY(0)' }
      document.body.appendChild(btn)
    }
    btn.onclick = async () => {
      if (btn.disabled) return
      const old = btn.innerHTML
      btn.disabled = true
      btn.style.opacity = '.72'
      btn.innerHTML = '<span>打开中…</span>'
      try {
        const result = await window.shell.openHoldingWindow()
        if (!result || !result.ok) throw new Error(result && result.error ? result.error : 'open failed')
      } catch (err) {
        btn.innerHTML = '<span>打开失败</span>'
        setTimeout(() => { btn.innerHTML = old }, 1200)
      } finally {
        btn.disabled = false
        btn.style.opacity = '1'
      }
    }
    return true
  })()
`

function safeExecute(win, script) {
  if (!win || win.isDestroyed()) return Promise.resolve(null)
  return win.webContents.executeJavaScript(script).catch(() => null)
}

function injectMainButton(win) {
  const delays = [0, 400, 1200, 2500]
  delays.forEach((delay) => {
    setTimeout(() => safeExecute(win, INJECT_FLOAT_BTN_SCRIPT), delay)
  })
}

async function prepareHoldingWidget(win) {
  if (!win || win.isDestroyed()) return false
  for (let i = 0; i < 12; i += 1) {
    const ready = await safeExecute(win, FOCUS_HOLDING_WIDGET_SCRIPT)
    if (ready) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

function getWidgetBounds() {
  const sourceWin = mainWin && !mainWin.isDestroyed() ? mainWin : BrowserWindow.getFocusedWindow()
  const display = sourceWin ? screen.getDisplayMatching(sourceWin.getBounds()) : screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  return {
    x: x + width - WIDGET_W - WIDGET_MARGIN,
    y: y + height - WIDGET_H - WIDGET_MARGIN,
    width: WIDGET_W,
    height: WIDGET_H,
  }
}

// ============ 主窗口 ============
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    title: '恭喜发财',
    backgroundColor: '#050608',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWin.loadURL(WEB_URL)
  Menu.setApplicationMenu(null)
  mainWin.webContents.on('did-finish-load', () => injectMainButton(mainWin))
  mainWin.webContents.on('dom-ready', () => injectMainButton(mainWin))
  mainWin.webContents.on('did-navigate-in-page', () => injectMainButton(mainWin))
  mainWin.on('closed', () => { mainWin = null })
}

// ============ 持仓库浮窗 ============
function createHoldingWidget() {
  if (holdingWin && !holdingWin.isDestroyed()) return holdingWin

  holdingWin = new BrowserWindow({
    ...getWidgetBounds(),
    title: '持仓库',
    // 注意：不设 parent —— macOS 上 parent/child 是 window group，hide/show 会互相干扰
    frame: false,            // 无标题栏
    transparent: true,       // 透明背景
    backgroundColor: '#00000000',
    alwaysOnTop: true,       // 置顶
    skipTaskbar: true,       // 不在 dock / win 任务栏显示
    show: false,             // 等 DOM 切成浮窗模式后再显示，避免闪完整页面
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

  holdingWin.webContents.on('did-finish-load', async () => {
    await prepareHoldingWidget(holdingWin)
    if (holdingWin && !holdingWin.isDestroyed()) {
      holdingWin.show()
      holdingWin.focus()
    }
  })
  holdingWin.webContents.on('dom-ready', () => {
    prepareHoldingWidget(holdingWin)
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

// 最小化浮窗：只隐藏浮窗，不打断主窗口当前状态
function minimizeHoldingWidget() {
  if (holdingWin && !holdingWin.isDestroyed()) holdingWin.hide()
}

// 点击 📊 按钮：隐藏主窗口 + 显示浮窗
function openHoldingWidget() {
  if (holdingWin && !holdingWin.isDestroyed()) {
    holdingWin.setBounds(getWidgetBounds())
    prepareHoldingWidget(holdingWin)
    if (!holdingWin.isVisible()) holdingWin.show()
    holdingWin.focus()
  } else {
    createHoldingWidget()
  }

  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.hide()
  }

  return { ok: true }
}

// ============ IPC ============
ipcMain.handle('open-holding-window', () => openHoldingWidget())
ipcMain.handle('minimize-holding-window', () => {
  minimizeHoldingWidget()
  return { ok: true }
})
ipcMain.handle('close-holding-window', () => {
  restoreMainWindow()
  return { ok: true }
})

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
