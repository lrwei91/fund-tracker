const { contextBridge, ipcRenderer } = require('electron')

// 暴露给 web 端的安全 API（仅持仓库浮窗用得到）
contextBridge.exposeInMainWorld('shell', {
  openHoldingWindow: () => ipcRenderer.invoke('open-holding-window'),
  closeHoldingWindow: () => ipcRenderer.invoke('close-holding-window'),
})
