const { app, BrowserWindow, ipcMain, Menu, protocol, screen } = require('electron')
const fs = require('fs')
const path = require('path')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fund-tracker',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const APP_ROOT = path.join(__dirname, 'app')
const RENDERER_ROOT = path.join(__dirname, 'renderer')

const WIDGET_W = 320
const WIDGET_H = 58
const WIDGET_MARGIN = 20

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

let mainWin = null
let holdingWin = null
let lastHiddenWindow = 'main'

const MAIN_WINDOW_CHROME = process.platform === 'darwin'
  ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 14 } }
  : {}

function appUrl(pathname) {
  return `fund-tracker://app/${String(pathname || 'index.html').replace(/^\/+/, '')}`
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': MIME['.json'] },
  })
}

function isInside(root, target) {
  const relative = path.relative(root, target)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function createMemoryResponse() {
  const chunks = []
  const headers = new Map()

  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(String(name), String(value))
    },
    getHeader(name) {
      return headers.get(String(name))
    },
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || '')))
    },
    end(chunk) {
      if (chunk !== undefined) this.write(chunk)
    },
    toResponse() {
      if (!headers.has('Content-Type')) headers.set('Content-Type', MIME['.json'])
      return new Response(Buffer.concat(chunks), {
        status: this.statusCode || 200,
        headers: Object.fromEntries(headers.entries()),
      })
    },
  }
}

async function handleApi(pathname, searchParams) {
  const apiName = pathname.replace(/^\/api\//, '').replace(/\.js$/, '')
  if (!/^[a-z0-9-]+$/i.test(apiName)) {
    return jsonResponse(404, { success: false, message: 'API not found' })
  }

  const handlerPath = path.join(APP_ROOT, 'api', `${apiName}.js`)
  const apiRoot = path.join(APP_ROOT, 'api')
  if (!isInside(apiRoot, handlerPath) || !fs.existsSync(handlerPath)) {
    return jsonResponse(404, { success: false, message: 'API not found' })
  }

  try {
    if (!app.isPackaged) delete require.cache[require.resolve(handlerPath)]
    const handler = require(handlerPath)
    const req = { query: Object.fromEntries(searchParams.entries()) }
    const res = createMemoryResponse()
    await Promise.resolve(handler(req, res))
    return res.toResponse()
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      message: error && error.message ? error.message : 'API failed',
    })
  }
}

async function staticResponse(root, pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname
  const filePath = path.normalize(path.join(root, requestPath))

  if ((!isInside(root, filePath) && filePath !== path.join(root, 'index.html'))
    || !fs.existsSync(filePath)
    || fs.statSync(filePath).isDirectory()) {
    return new Response('Not found', { status: 404 })
  }

  const body = await fs.promises.readFile(filePath)
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' },
  })
}

function registerLocalProtocol() {
  protocol.handle('fund-tracker', async (request) => {
    try {
      const url = new URL(request.url)
      const pathname = decodeURIComponent(url.pathname)
      if (url.hostname !== 'app') {
        return new Response('Not found', { status: 404 })
      }

      if (pathname.startsWith('/api/')) {
        return handleApi(pathname, url.searchParams)
      }

      if (pathname.startsWith('/renderer/')) {
        return staticResponse(RENDERER_ROOT, pathname.replace(/^\/renderer/, '') || '/holding-widget.html')
      }

      return staticResponse(APP_ROOT, pathname)
    } catch (error) {
      return jsonResponse(500, {
        success: false,
        message: error && error.message ? error.message : 'Protocol failed',
      })
    }
  })
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

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 592,
    height: 820,
    minWidth: 540,
    minHeight: 680,
    title: '恭喜发财',
    backgroundColor: '#050608',
    ...MAIN_WINDOW_CHROME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWin.loadURL(appUrl('index.html'))
  Menu.setApplicationMenu(null)
  mainWin.on('minimize', () => { lastHiddenWindow = 'main' })
  mainWin.on('closed', () => { mainWin = null })
}

function refreshHoldingWidget() {
  if (!holdingWin || holdingWin.isDestroyed()) return
  holdingWin.webContents.send('holding-widget-refresh')
}

function createHoldingWidget() {
  if (holdingWin && !holdingWin.isDestroyed()) return holdingWin

  holdingWin = new BrowserWindow({
    ...getWidgetBounds(),
    title: '持仓库',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
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
  holdingWin.loadURL(appUrl('renderer/holding-widget.html'))

  holdingWin.webContents.on('did-finish-load', () => {
    refreshHoldingWidget()
    if (holdingWin && !holdingWin.isDestroyed()) {
      holdingWin.show()
      holdingWin.focus()
    }
  })

  holdingWin.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      restoreMainWindow()
    }
  })

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

function restoreMainWindow() {
  if (holdingWin && !holdingWin.isDestroyed()) holdingWin.hide()
  if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) {
    mainWin.show()
    mainWin.focus()
  }
}

function minimizeHoldingWidget() {
  if (holdingWin && !holdingWin.isDestroyed()) {
    holdingWin.hide()
    lastHiddenWindow = 'holding'
  }
}

function closeHoldingWidget() {
  if (holdingWin && !holdingWin.isDestroyed()) holdingWin.hide()
}

function showAppFromDock() {
  const hasVisibleWindow = BrowserWindow.getAllWindows().some((win) => !win.isDestroyed() && win.isVisible())
  if (hasVisibleWindow) return

  if (lastHiddenWindow === 'holding' && holdingWin && !holdingWin.isDestroyed()) {
    holdingWin.setBounds(getWidgetBounds())
    refreshHoldingWidget()
    holdingWin.show()
    holdingWin.focus()
    return
  }

  if (mainWin && !mainWin.isDestroyed()) {
    restoreMainWindow()
    return
  }

  createMainWindow()
}

function openHoldingWidget() {
  if (holdingWin && !holdingWin.isDestroyed()) {
    holdingWin.setBounds(getWidgetBounds())
    refreshHoldingWidget()
    if (!holdingWin.isVisible()) holdingWin.show()
    holdingWin.focus()
  } else {
    createHoldingWidget()
  }

  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.hide()
    lastHiddenWindow = 'main'
  }

  return { ok: true }
}

ipcMain.handle('open-holding-window', () => openHoldingWidget())
ipcMain.handle('minimize-holding-window', () => {
  minimizeHoldingWidget()
  return { ok: true }
})
ipcMain.handle('maximize-holding-window', () => {
  restoreMainWindow()
  return { ok: true }
})
ipcMain.handle('close-holding-window', () => {
  closeHoldingWidget()
  return { ok: true }
})

app.whenReady().then(() => {
  registerLocalProtocol()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    else showAppFromDock()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
