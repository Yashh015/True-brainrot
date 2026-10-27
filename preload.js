const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('companion', {
  tab: name => ipcRenderer.send('tab', name),
  snooze: () => ipcRenderer.send('snooze'),
  minimise: () => ipcRenderer.send('minimise'),
  ratio: () => ipcRenderer.send('ratio'),
  onRatio: fn => ipcRenderer.on('ratio', (_, name) => fn(name)),
  quit: () => ipcRenderer.send('quit'),
  onAlert: fn => ipcRenderer.on('alert', (_, kind) => fn(kind)),
})
