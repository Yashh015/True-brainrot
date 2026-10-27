const { app, BrowserWindow, WebContentsView, Menu, session, screen, globalShortcut, ipcMain, powerMonitor, shell, dialog, nativeTheme } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { createCompanion } = require('./state')
const { watchClaude, noFade } = require('./winwatch')
const { inFeed, isWebLink } = require('./links')
const { PORT } = require('./install-hooks')

const ASPECT = 9 / 16 // phone-shaped like the feeds themselves, docked right; drag the left edge to change it
const BAR = 44 // height of the tab/banner bar in index.html
const MIN_WIDTH = 320 // narrower than this and the feeds' own layouts break
const BORDER = 1 // the frame index.html draws round the feed
const BG = '#1f1f1f' // Claude desktop's pane colour, so a slow page load never flashes white
const OFF_SWITCH = 'Ctrl+Alt+F'
const IDLE_AFTER = 15 // seconds without mouse or keyboard before the feed may pop up
const SLIDE_MS = 180 // slide in/out from the right edge
const OPEN_KEY = 'Ctrl+Q' // open the feed yourself; press again to close it. Global, so other apps lose Ctrl+Q while this runs
// X and Instagram treat Electron's own user agent as unusual.
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SITES = { x: 'https://x.com', instagram: 'https://www.instagram.com' }
const openOutside = url => { if (isWebLink(url)) shell.openExternal(url) }

// Electron names the data folder after productName, so the rename from Scroll Companion would log
// everyone out of X and Instagram. Keep the original folder. Must run before the lock below.
app.setPath('userData', path.join(app.getPath('appData'), 'scroll-companion'))

// A second copy would crash on the busy port; let the first one win.
// quit() is async, so return too or the rest of this file still runs.
if (!app.requestSingleInstanceLock()) { app.quit(); return }

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark' // X and Instagram follow it, so the feeds match Claude's dark panes
  // Electron's default menu is invisible on a frameless window but its shortcuts still fire:
  // Ctrl+W, pressed out of browser habit while scrolling, closed the window and quit the app.
  Menu.setApplicationMenu(null)
  const feed = session.fromPartition('persist:feed') // log in once, cookies survive restarts
  feed.setUserAgent(CHROME_UA)
  // The feed gets no camera, mic, location, notifications or clipboard: it can only show pages.
  feed.setPermissionRequestHandler((_, __, allow) => allow(false))
  feed.setPermissionCheckHandler(() => false)
  // Every page in the feed session, the sign-in pop-ups included, stays on FEED_HOSTS.
  app.on('web-contents-created', (_, contents) => {
    if (contents.session !== feed) return
    const guard = (event, url) => { if (!inFeed(url)) { event.preventDefault(); openOutside(url) } }
    contents.on('will-navigate', guard)
    contents.on('will-redirect', guard)
    // Sign-in pop-ups open over the panel; every other new-window link goes to your normal browser.
    contents.setWindowOpenHandler(({ url }) => {
      if (inFeed(url)) return { action: 'allow', overrideBrowserWindowOptions: { parent: win, autoHideMenuBar: true } }
      openOutside(url)
      return { action: 'deny' }
    })
  })

  const { workArea } = screen.getPrimaryDisplay()
  // The width you dragged it to last time, kept next to the feed's cookies.
  const sizeFile = path.join(app.getPath('userData'), 'width.json')
  let width = Math.round(workArea.height * ASPECT)
  try { width = JSON.parse(fs.readFileSync(sizeFile, 'utf8')) } catch {}
  // A corrupt file, or a width saved on a bigger screen, must never put the panel off-screen.
  width = Number.isFinite(width) ? Math.min(Math.max(Math.round(width), MIN_WIDTH), Math.round(workArea.width * 0.6)) : Math.round(workArea.height * ASPECT)
  const win = new BrowserWindow({
    x: workArea.x + workArea.width - width, y: workArea.y, width, height: workArea.height,
    minWidth: MIN_WIDTH, frame: false, show: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: BG,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required' },
  })
  win.loadFile('index.html')
  noFade(win.getNativeWindowHandle())

  // One view per site, kept alive while detached so each keeps its scroll position.
  const views = {}
  for (const [name, url] of Object.entries(SITES)) {
    views[name] = new WebContentsView({ webPreferences: { session: feed } })
    views[name].setBackgroundColor(BG)
    views[name].webContents.loadURL(url)
  }
  let current = 'x'
  const layout = () => {
    const [w, h] = win.getContentSize()
    views[current].setBounds({ x: BORDER, y: BAR, width: w - 2 * BORDER, height: h - BAR - BORDER })
  }
  win.contentView.addChildView(views[current])
  layout()
  win.on('resize', layout)
  win.on('resized', () => {
    width = win.getSize()[0]
    fs.writeFile(sizeFile, JSON.stringify(width), () => {})
  })

  const pauseVideo = () => {
    for (const v of Object.values(views))
      v.webContents.executeJavaScript("document.querySelectorAll('video').forEach(v => v.pause())").catch(() => {})
  }

  // Chromium writes cookies to disk on its own timer; a crash or a killed process before that
  // loses a login you just made. Write them now, each time the panel steps away and on quit.
  const saveLogins = () => feed.cookies.flushStore().catch(() => {})

  // Slides from wherever it is now, so a show during a hide (or the reverse) turns round smoothly.
  // Every move re-states the size: at 125% scaling setPosition alone rounds the width
  // a pixel or two each frame, and a slide is ~10 frames, so the panel grew past the screen edge.
  const place = x => win.setBounds({ x, y: workArea.y, width, height: workArea.height })
  const inX = () => workArea.x + workArea.width - width
  const outX = workArea.x + workArea.width
  let slide = null
  const slideTo = (to, done) => {
    clearInterval(slide)
    const from = win.getPosition()[0]
    const start = Date.now()
    slide = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / SLIDE_MS)
      place(Math.round(from + (to - from) * (1 - (1 - t) ** 3))) // ease-out
      if (t === 1) { clearInterval(slide); if (done) done() }
    }, 16)
  }

  const companion = createCompanion({
    show: () => {
      win.webContents.send('alert', null)
      if (!win.isVisible()) { place(outX); win.showInactive() } // never steal focus from Claude
      slideTo(inX())
    },
    alert: kind => { pauseVideo(); win.webContents.send('alert', kind) },
    hide: () => { pauseVideo(); saveLogins(); slideTo(outX, () => win.hide()) }, // hiding hands focus back to the Claude window
    // Following Claude out and back is instant, no slide and no fade: copying Claude's own
    // minimise animation looked a beat slow, so the panel is gone the moment Claude starts to go.
    leave: () => {
      clearInterval(slide)
      pauseVideo()
      saveLogins()
      win.hide()
    },
    back: () => {
      clearInterval(slide)
      place(inX())
      win.showInactive()
    },
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

  // Alt+F4 or any other window close just puts the panel away; only the × button, the busy-port
  // dialog or Windows shutting down quits. One window gone means the whole app gone otherwise.
  let quitting = false
  app.on('before-quit', () => { quitting = true })
  win.on('session-end', () => { quitting = true }) // log off / restart: never hold Windows up
  win.on('close', event => { if (!quitting) { event.preventDefault(); companion.close() } })

  http.createServer((req, res) => {
    // curl sends no Origin; a web page in your browser does, and gets ignored.
    if (req.method === 'POST' && !req.headers.origin) companion.event(req.url.slice(1))
    res.writeHead(204).end() // no body: UserPromptSubmit output would reach Claude's context
  }).on('error', err => {
    // Something else holds the port: say so instead of crashing with a stack trace.
    dialog.showErrorBox('True Brainrot', `Can't listen on port ${PORT}: ${err.message}`)
    app.quit()
  }).listen(PORT, '127.0.0.1')

  // The feed belongs to Claude: switch to another app, minimise Claude or close it to the
  // tray, and the panel steps out of sight at once; come back and it returns.
  const stopWatching = watchClaude(present => companion.setPresent(present))
  app.on('will-quit', () => { stopWatching(); saveLogins() })

  globalShortcut.register(OFF_SWITCH, () => companion.toggleEnabled())
  globalShortcut.register(OPEN_KEY, () => companion.toggleOpen())
  // Installed, the exe is the app. From `npm start` it is electron.exe, which needs this folder passed in.
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] })

  companion.open() // shown on start so you can log in
})

app.on('will-quit', () => globalShortcut.unregisterAll())
