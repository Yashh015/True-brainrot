const { app, BrowserWindow, WebContentsView, Menu, session, screen, globalShortcut, ipcMain, powerMonitor, shell, dialog, nativeTheme } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { createCompanion } = require('./state')
const { watchClaude, noFade } = require('./winwatch')
const { inFeed, isWebLink, leavesFeed } = require('./links')
const { PORT } = require('./install-hooks')
const { toSetDetails } = require('./cookies')
const { createAccount, LINK } = require('./account')
const CONFIG = require('./config.json') // the Supabase project, written from .env by make-config.js

const ASPECT = 9 / 16 // phone-shaped like the feeds themselves, docked right; drag the left edge to change it
// Chrome's own zoom steps, so Ctrl+wheel and Ctrl+= / - feel the same as in a browser.
const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
const BAR = 44 // height of the tab/banner bar in index.html
const MIN_WIDTH = 320 // narrower than this and the feeds' own layouts break
const BORDER = 1 // the frame index.html draws round the feed
const BG = '#1f1f1f' // Claude desktop's pane colour, so a slow page load never flashes white
const OFF_SWITCH = 'Ctrl+Alt+F'
const IDLE_AFTER = 15 // seconds without mouse or keyboard before the feed may pop up
const SLIDE_MS = 180 // slide in/out from the right edge
const OPEN_KEY = 'Ctrl+Q' // open the feed yourself; press again to close it. Global, so other apps lose Ctrl+Q while this runs
// X and Instagram treat Electron's own user agent as unusual, so present as plain Chrome. The
// version is the engine's real one: a made-up version that disagrees with what the page's own
// checks see is a bot signal, and a fixed one goes stale with every Electron update.
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`
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
  // Log in once: the login cookie survives restarts, encrypted (enableCookieEncryption fuse).
  // Electron has no password manager, so a password typed into X or Instagram is never stored.
  const feed = session.fromPartition('persist:feed')
  feed.setUserAgent(CHROME_UA)
  // The feed gets no camera, mic, location, notifications or clipboard: it can only show pages.
  feed.setPermissionRequestHandler((_, __, allow) => allow(false))
  feed.setPermissionCheckHandler(() => false)
  // Every page in the feed session, the sign-in pop-ups included, stays on FEED_HOSTS.
  app.on('web-contents-created', (_, contents) => {
    if (contents.session !== feed) return
    const guard = event => {
      if (!leavesFeed(event)) return
      event.preventDefault()
      openOutside(event.url)
    }
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
  // A corrupt file, or a width saved on a bigger screen, must never put the panel off-screen.
  const fit = w => Math.min(Math.max(Math.round(w), MIN_WIDTH), Math.round(workArea.width * 0.6))
  let width = fit(workArea.height * ASPECT)
  try { const saved = JSON.parse(fs.readFileSync(sizeFile, 'utf8')); if (Number.isFinite(saved)) width = fit(saved) } catch {}
  const win = new BrowserWindow({
    x: workArea.x + workArea.width - width, y: workArea.y, width, height: workArea.height,
    minWidth: MIN_WIDTH, frame: false, show: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: BG,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required' },
  })
  // The built app switches off file:// pages' extra powers (grantFileProtocolExtraPrivileges fuse),
  // which leaves a loadFile page blank. Handing over the HTML itself needs no file access at all.
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')))
  noFade(win.getNativeWindowHandle())

  // Logins saved before encryption was switched on are still plain text on disk: write them back.
  // Done before the feeds load, or a cookie a site refreshes meanwhile is overwritten with the old one.
  const encrypted = feed.cookies.get({})
    .then(all => Promise.all(all.map(c => feed.cookies.set(toSetDetails(c)).catch(() => {}))))
    .then(() => feed.cookies.flushStore()).catch(() => {})

  // One view per site, kept alive while detached so each keeps its scroll position. Nothing loads
  // until the account allows the feed (applyAccess below), so a locked panel never runs X or Instagram.
  const views = {}
  for (const name of Object.keys(SITES)) {
    views[name] = new WebContentsView({ webPreferences: { session: feed } })
    views[name].setBackgroundColor(BG)
  }
  let current = 'x'
  let feedOn = false
  const layout = () => {
    const [w, h] = win.getContentSize()
    views[current].setBounds({ x: BORDER, y: BAR, width: w - 2 * BORDER, height: h - BAR - BORDER })
  }
  win.on('resize', layout)
  win.on('resized', () => {
    width = win.getSize()[0]
    fs.writeFile(sizeFile, JSON.stringify(width), () => {})
  })

  // Zoom, per site, remembered next to the width. Chromium only zooms on Ctrl+wheel or Ctrl+=
  // when a menu or page asks it to, and the menu is gone, so the panel does it itself.
  const zoomFile = path.join(app.getPath('userData'), 'zoom.json')
  const zoom = {}
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(zoomFile, 'utf8')))) if (ZOOMS.includes(v)) zoom[k] = v } catch {}
  const showZoom = () => win.webContents.send('zoom', zoom[current] || 1)
  const setZoom = (name, factor) => {
    zoom[name] = factor
    views[name].webContents.setZoomFactor(factor)
    fs.writeFile(zoomFile, JSON.stringify(zoom), () => {})
    if (name === current) showZoom()
  }
  const stepZoom = (name, by) => {
    const at = ZOOMS.indexOf(zoom[name] || 1)
    setZoom(name, ZOOMS[Math.min(Math.max(at + by, 0), ZOOMS.length - 1)])
  }
  // Ctrl+= / Ctrl+- / Ctrl+0, wherever the keyboard is in the panel: in a feed you've clicked
  // into, or still on the bar above it (the panel opens without focus, so that's the usual case).
  const zoomKeys = name => (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt) return
    const by = { '=': 1, '+': 1, '-': -1 }[input.key]
    if (by) stepZoom(name(), by)
    else if (input.key === '0') setZoom(name(), 1)
    else return
    event.preventDefault()
  }
  for (const [name, view] of Object.entries(views)) {
    const page = view.webContents
    page.on('zoom-changed', (_, direction) => stepZoom(name, direction === 'in' ? 1 : -1))
    page.on('before-input-event', zoomKeys(() => name))
    // Chromium can drop the zoom when a page reloads; put it back every time.
    page.on('did-finish-load', () => page.setZoomFactor(zoom[name] || 1))
    // At Windows sign-in the app often starts before the network is up, leaving a blank feed.
    // Try again every few seconds; -3 is a navigation the page or you cancelled, not a failure.
    page.on('did-fail-load', (_, code, __, url, isMainFrame) => {
      if (isMainFrame && code !== -3) setTimeout(() => { if (feedOn) page.loadURL(url) }, 3000)
    })
  }
  win.webContents.on('before-input-event', zoomKeys(() => current))
  win.webContents.on('did-finish-load', showZoom)

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
    if (feedOn) win.contentView.removeChildView(views[current])
    current = name
    if (feedOn) win.contentView.addChildView(views[current])
    layout()
    showZoom()
  })

  // The feed shows only while the account allows it; otherwise index.html shows the gate screen.
  const account = createAccount({ ...CONFIG, dir: app.getPath('userData'), onChange: () => applyAccess() })
  const applyAccess = () => {
    const view = account.view()
    win.webContents.send('access', view)
    if (view.ok === feedOn) return
    feedOn = view.ok
    if (feedOn) {
      for (const [name, url] of Object.entries(SITES))
        encrypted.then(() => views[name].webContents.loadURL(url)).catch(() => {}) // did-fail-load retries
      win.contentView.addChildView(views[current])
      layout()
    } else {
      pauseVideo()
      win.contentView.removeChildView(views[current])
      for (const v of Object.values(views)) v.webContents.loadURL('about:blank').catch(() => {})
    }
  }
  win.webContents.on('did-finish-load', applyAccess)
  const refresh = () => account.refresh().catch(() => {}).finally(applyAccess)

  ipcMain.on('sign-in', (_, email) => account.signIn(String(email).trim()).catch(() => {}))
  ipcMain.on('refresh', refresh)
  ipcMain.on('remove-device', (_, id) => account.removeDevice(String(id)).catch(() => {}))
  ipcMain.on('sign-out', () => account.signOut().catch(() => {}))
  ipcMain.on('subscribe', async () => {
    const url = await account.checkoutUrl().catch(() => null)
    if (!url) return win.webContents.send('access', { ...account.view(), error: 'Subscriptions open soon.' })
    openOutside(url)
    // The payment reaches the server within seconds or so: look for it for 2 minutes.
    for (let i = 0; i < 12 && !account.view().ok; i++) {
      await new Promise(done => setTimeout(done, 10000))
      await refresh()
    }
  })
  ipcMain.on('snooze', () => companion.snooze())
  ipcMain.on('minimise', () => companion.close())
  // Next preset; from Custom it starts again at the first. The panel stays docked right.
  ipcMain.on('zoom-reset', () => setZoom(current, 1))
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
  app.setLoginItemSettings({ name: 'True Brainrot', openAtLogin: true, path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] })

  // Windows opens truebrainrot:// links (the sign-in email) with this app; a running copy gets them
  // through second-instance, a copy started by the link finds it in its own arguments.
  app.setAsDefaultProtocolClient('truebrainrot', process.execPath, app.isPackaged ? [] : [app.getAppPath()])
  const openLink = argv => {
    const link = argv.find(arg => arg.startsWith(LINK))
    if (link) { companion.open(); account.openLink(link).catch(() => {}) }
  }
  app.on('second-instance', (_, argv) => openLink(argv))
  openLink(process.argv)

  refresh()
  setInterval(refresh, 6 * 60 * 60 * 1000) // a cancelled or renewed subscription shows up within 6 h
  setInterval(applyAccess, 60 * 1000) // a trial ending mid-session locks within a minute

  companion.start() // shown beside Claude on first launch so you can log in; never over the desktop
})

app.on('will-quit', () => globalShortcut.unregisterAll())
