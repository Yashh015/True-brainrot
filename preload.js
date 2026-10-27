const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('companion', {
  tab: name => ipcRenderer.send('tab', name),
  snooze: () => ipcRenderer.send('snooze'),
  minimise: () => ipcRenderer.send('minimise'),
  zoomReset: () => ipcRenderer.send('zoom-reset'),
  onZoom: fn => ipcRenderer.on('zoom', (_, factor) => fn(factor)),
  quit: () => ipcRenderer.send('quit'),
  onAlert: fn => ipcRenderer.on('alert', (_, kind) => fn(kind)),
})
