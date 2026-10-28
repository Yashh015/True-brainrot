const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('companion', {
  tab: name => ipcRenderer.send('tab', name),
  snooze: () => ipcRenderer.send('snooze'),
  minimise: () => ipcRenderer.send('minimise'),
  zoomReset: () => ipcRenderer.send('zoom-reset'),
  onZoom: fn => ipcRenderer.on('zoom', (_, factor) => fn(factor)),
  quit: () => ipcRenderer.send('quit'),
  onAlert: fn => ipcRenderer.on('alert', (_, kind) => fn(kind)),
  onAccess: fn => ipcRenderer.on('access', (_, view) => fn(view)),
  openApp: () => ipcRenderer.send('open-app'),
  onSettings: fn => ipcRenderer.on('settings', (_, settings) => fn(settings)),
  setSetting: (key, value) => ipcRenderer.send('set-setting', key, value),
  signIn: email => ipcRenderer.send('sign-in', email),
  verifyCode: code => ipcRenderer.send('verify-code', code),
  refresh: () => ipcRenderer.send('refresh'),
  subscribe: () => ipcRenderer.send('subscribe'),
  removeDevice: id => ipcRenderer.send('remove-device', id),
  signOut: () => ipcRenderer.send('sign-out'),
})
