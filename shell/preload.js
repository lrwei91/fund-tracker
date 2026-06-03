const { contextBridge, ipcRenderer } = require('electron')

// 暴露给 web 端的安全 API（仅持仓库按钮用得到）
contextBridge.exposeInMainWorld('shell', {
  openHoldingWindow: () => ipcRenderer.send('open-holding-window'),
})
