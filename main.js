const { app, BrowserWindow, WebContentsView, session, screen, globalShortcut, ipcMain, powerMonitor, shell, dialog } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { createCompanion } = require('./state')
const { PORT } = require('./install-hooks')

const WIDTH = 0.3 // starting share of the screen, docked right; drag the left edge to change it
const BAR = 36 // height of the tab/banner bar in index.html
const OFF_SWITCH = 'Ctrl+Alt+F'
const IDLE_AFTER = 15 // seconds without mouse or keyboard before the feed may pop up
const SLIDE_MS = 180 // slide in/out from the right edge
const OPEN_KEY = 'Super+Y' // Win+Y; Windows keeps Win+Z for itself. Open the feed yourself; press again to close it
// X and Instagram treat Electron's own user agent as unusual.
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
// Sign-in pop-ups from these stay in the panel, so the login lands in the feed session.
const SIGN_IN = ['x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'accounts.google.com', 'appleid.apple.com']
const SITES = { x: 'https://x.com', instagram: 'https://www.instagram.com' }

// A second copy would crash on the busy port; let the first one win.
// quit() is async, so return too or the rest of this file still runs.
if (!app.requestSingleInstanceLock()) { app.quit(); return }

app.whenReady().then(() => {
  const feed = session.fromPartition('persist:feed') // log in once, cookies survive restarts
  feed.setUserAgent(CHROME_UA)
  // The feed gets no camera, mic, location, notifications or clipboard: it can only show pages.
  feed.setPermissionRequestHandler((_, __, allow) => allow(false))
  feed.setPermissionCheckHandler(() => false)

  const { workArea } = screen.getPrimaryDisplay()
  // The width you dragged it to last time, kept next to the feed's cookies.
  const sizeFile = path.join(app.getPath('userData'), 'width.json')
  let width = Math.round(workArea.width * WIDTH)
  try { width = JSON.parse(fs.readFileSync(sizeFile, 'utf8')) } catch {}
  const win = new BrowserWindow({
    x: workArea.x + workArea.width - width, y: workArea.y, width, height: workArea.height,
    frame: false, show: false, skipTaskbar: true, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required' },
  })
  win.loadFile('index.html')

  // One view per site, kept alive while detached so each keeps its scroll position.
  const views = {}
  for (const [name, url] of Object.entries(SITES)) {
    views[name] = new WebContentsView({ webPreferences: { session: feed } })
    views[name].webContents.loadURL(url)
    // Sign-in pop-ups open over the panel; every other new-window link goes to your normal browser.
    views[name].webContents.setWindowOpenHandler(({ url }) => {
      const host = url.startsWith('https://') && new URL(url).hostname
      if (host && SIGN_IN.some(d => host === d || host.endsWith('.' + d)))
        return { action: 'allow', overrideBrowserWindowOptions: { parent: win, autoHideMenuBar: true } }
      if (host) shell.openExternal(url)
      return { action: 'deny' }
    })
  }
  let current = 'x'
  const layout = () => {
    const [w, h] = win.getContentSize()
    views[current].setBounds({ x: 0, y: BAR, width: w, height: h - BAR })
  }
  win.contentView.addChildView(views[current])
  layout()
  win.on('resize', layout)
  win.on('resized', () => fs.writeFile(sizeFile, JSON.stringify(win.getSize()[0]), () => {}))

  const pauseVideo = () => {
    for (const v of Object.values(views))
      v.webContents.executeJavaScript("document.querySelectorAll('video').forEach(v => v.pause())").catch(() => {})
  }

  // Slides from wherever it is now, so a show during a hide (or the reverse) turns round smoothly.
  const inX = () => workArea.x + workArea.width - win.getSize()[0]
  const outX = workArea.x + workArea.width
  let slide = null
  const slideTo = (to, done) => {
    clearInterval(slide)
    const from = win.getPosition()[0]
    const start = Date.now()
    slide = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / SLIDE_MS)
      win.setPosition(Math.round(from + (to - from) * (1 - (1 - t) ** 3)), workArea.y) // ease-out
      if (t === 1) { clearInterval(slide); if (done) done() }
    }, 16)
  }

  const companion = createCompanion({
    show: () => {
      win.webContents.send('alert', null)
      if (!win.isVisible()) { win.setPosition(outX, workArea.y); win.showInactive() } // never steal focus from Claude
      slideTo(inX())
    },
    alert: kind => { pauseVideo(); win.webContents.send('alert', kind) },
    hide: () => { pauseVideo(); slideTo(outX, () => win.hide()) }, // hiding hands focus back to the Claude window
    isIdle: () => powerMonitor.getSystemIdleTime() >= IDLE_AFTER, // planning = typing/reading, so it stays away
  }, (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t) })

  ipcMain.on('tab', (_, name) => {
    if (!views[name] || name === current) return
    win.contentView.removeChildView(views[current])
    current = name
    win.contentView.addChildView(views[current])
    layout()
  })
  ipcMain.on('snooze', () => companion.snooze())
  ipcMain.on('minimise', () => companion.close())
  ipcMain.on('quit', () => app.quit())

  http.createServer((req, res) => {
    // curl sends no Origin; a web page in your browser does, and gets ignored.
    if (req.method === 'POST' && !req.headers.origin) companion.event(req.url.slice(1))
    res.writeHead(204).end() // no body: UserPromptSubmit output would reach Claude's context
  }).on('error', err => {
    // Something else holds the port: say so instead of crashing with a stack trace.
    dialog.showErrorBox('Scroll Companion', `Can't listen on port ${PORT}: ${err.message}`)
    app.quit()
  }).listen(PORT, '127.0.0.1')

  globalShortcut.register(OFF_SWITCH, () => companion.toggleEnabled())
  globalShortcut.register(OPEN_KEY, () => companion.toggleOpen())
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: [app.getAppPath()] })

  companion.open() // shown on start so you can log in
})

app.on('will-quit', () => globalShortcut.unregisterAll())
