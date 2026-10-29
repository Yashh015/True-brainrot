const { app, BrowserWindow, WebContentsView, Menu, Tray, nativeImage, session, screen, globalShortcut, ipcMain, powerMonitor, shell, dialog, nativeTheme, clipboard } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { createCompanion } = require('./state')
const { watchClaude, noFade, hwndOf } = require('./winwatch')
const { inFeed, isWebLink, leavesFeed } = require('./links')
const { PORT } = require('./install-hooks')
const { toSetDetails } = require('./cookies')
const { createAccount } = require('./account')
const CONFIG = require('./config.json') // the Supabase project, written from .env by make-config.js
const { FREE } = require('./access')
const { STEPS, screenFor, checklist } = require('./onboarding')
// What the plugin needs, in the order the card shows it; the Copy buttons put these on the clipboard.
const PLUGIN_COMMANDS = ['/plugin marketplace add Yashh015/True-brainrot', '/plugin install true-brainrot@true-brainrot']
// The privacy page will live on the landing page. While this is empty the button is hidden.
const PRIVACY_URL = ''
const HOOKS = new Set(['prompt', 'stop', 'attention']) // the three the plugin sends
const { logoBitmap } = require('./icon')
let tray = null // kept at module level: a tray held only by a closure is garbage-collected and vanishes

const ASPECT = 9 / 16 // phone-shaped like the feeds themselves, docked right; drag the left edge to change it
// Chrome's own zoom steps, so Ctrl+wheel and Ctrl+= / - feel the same as in a browser.
const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
const BAR = 36 // height of the tab/banner bar in index.html, level with Claude desktop's header line
const MIN_WIDTH = 320 // narrower than this and the feeds' own layouts break
const BORDER = 1 // the frame index.html draws round the feed
const BG = '#1f1f1f' // Claude desktop's pane colour, so a slow page load never flashes white
const OFF_SWITCH = 'Ctrl+Alt+F'
const IDLE_AFTER = 15 // seconds without mouse or keyboard before the feed may pop up
const SLIDE_MS = 180 // slide in/out from the right edge
const CRASH_TRIES = 3 // reloads after a feed page crashes, before it waits for the Reload button
const OPEN_KEY = 'Ctrl+Q' // open the feed yourself; press again to close it. Taken only while Claude is in front
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

  let { workArea } = screen.getPrimaryDisplay() // updated by redock when screens change
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
  // The app's own pages never navigate: a dropped link or a stray script would otherwise load
  // another site with the companion bridge (sign out, settings, quit) still attached.
  const stayPut = contents => {
    contents.on('will-navigate', event => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }
  stayPut(win.webContents)

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
  const crashes = { x: 0, instagram: 0 } // crashes since the site last loaded
  const showCrashed = () => win.webContents.send('crashed', crashes[current] > CRASH_TRIES)
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
    // A crashed or killed feed page would stay blank for good: load the site again. A page that
    // crashes on every load gets 3 tries, then the bar's Reload button (showCrashed) takes over.
    page.on('render-process-gone', () => {
      if (++crashes[name] > CRASH_TRIES) return showCrashed()
      setTimeout(() => { if (feedOn) page.loadURL(SITES[name]).catch(() => {}) }, 3000)
    })
    page.on('did-finish-load', () => { if (page.getURL() !== 'about:blank') { crashes[name] = 0; checkLogins() } })
  }
  win.webContents.on('before-input-event', zoomKeys(() => current))
  win.webContents.on('did-finish-load', showZoom)
  ipcMain.on('reload', () => {
    crashes[current] = 0
    showCrashed()
    if (feedOn) views[current].webContents.loadURL(SITES[current]).catch(() => {})
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
  const outX = () => workArea.x + workArea.width
  let slide = null
  // A screen unplugged, resized or rescaled: dock to the primary one again, at a width that fits it.
  const redock = () => {
    workArea = screen.getPrimaryDisplay().workArea
    width = fit(width)
    clearInterval(slide)
    place(win.isVisible() ? inX() : outX())
  }
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, redock)
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
      if (!win.isVisible()) { place(outX()); win.showInactive() } // never steal focus from Claude
      slideTo(inX())
    },
    alert: kind => { pauseVideo(); win.webContents.send('alert', kind) },
    hide: () => { pauseVideo(); saveLogins(); slideTo(outX(), () => win.hide()) }, // hiding hands focus back to the Claude window
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
    showCrashed()
  })

  // The feed shows only while the account allows it; otherwise index.html shows the gate screen.
  const account = createAccount({ ...CONFIG, dir: app.getPath('userData'), onChange: () => applyAccess() })
  let appWin = null // the True Brainrot window, made on first open (openApp, below)
  // Your choices, kept next to the width: Start with Windows (it used to be forced on every start)
  // and whether setup is done (the window opens by itself only on the first start after installing).
  const prefsFile = path.join(app.getPath('userData'), 'prefs.json')
  const prefs = { openAtLogin: true, setupDone: false, step: 'email', connected: false, chimeOff: false }
  let saved = {} // the file as it was, so a missing key can be told from a default one
  try { saved = JSON.parse(fs.readFileSync(prefsFile, 'utf8')) } catch {}
  Object.assign(prefs, saved)
  const savePrefs = () => fs.writeFile(prefsFile, JSON.stringify(prefs), () => {})
  // An install from before this flow has an email and no step: it belongs on the profile, not in a
  // walkthrough it has already done.
  if (saved.step === undefined) prefs.step = account.view().email && prefs.setupDone ? 'done' : 'email'
  // Both windows show the account: the sidebar its gate, the app window the profile.
  const send = (channel, data) => { for (const w of [win, appWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, data) }
  const applyAccess = () => {
    const view = account.view()
    send('access', view)
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

  // X and Instagram each set one cookie that only exists while signed in. Read the names only, never
  // the values. Electron's own domain filter mishandles the leading dot on these, so match here.
  let loggedIn = false
  const checkLogins = async () => {
    const all = await feed.cookies.get({}).catch(() => [])
    const has = (name, domain) => all.some(c => c.name === name && c.domain.endsWith(domain))
    const now = has('auth_token', 'x.com') || has('sessionid', 'instagram.com')
    if (now === loggedIn) return
    loggedIn = now
    sendSettings()
  }

  ipcMain.on('sign-in', (_, email) => {
    prefs.step = 'how-1' // a second account must never inherit the first one's 'done'
    savePrefs()
    account.signIn(String(email).trim()).catch(() => {})
    sendSettings() // the email is stored synchronously, so the card can change now
  })
  ipcMain.on('verify-code', (_, code) => account.verifyCode(String(code).replace(/\D/g, '')).catch(() => {}))
  ipcMain.on('refresh', refresh)
  ipcMain.on('remove-device', (_, id) => account.removeDevice(String(id)).catch(() => {}))
  ipcMain.on('sign-out', () => {
    prefs.step = 'email'
    savePrefs()
    account.signOut().catch(() => {})
    sendSettings()
  })
  ipcMain.on('subscribe', async () => {
    const url = await account.checkoutUrl().catch(() => null)
    if (!url) return send('access', { ...account.view(), error: 'Subscriptions open soon.' })
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
  // The window is a data: page, so it has no secure-context clipboard of its own.
  ipcMain.on('copy', (_, index) => {
    const command = PLUGIN_COMMANDS[index]
    if (command) clipboard.writeText(command)
  })
  // Its pages never navigate, so the privacy page opens in your normal browser.
  ipcMain.on('open-privacy', () => { if (PRIVACY_URL) openOutside(PRIVACY_URL) })

  // Alt+F4 or any other window close just puts the panel away; only the × button, the busy-port
  // dialog or Windows shutting down quits. One window gone means the whole app gone otherwise.
  let quitting = false
  app.on('before-quit', () => { quitting = true })
  win.on('session-end', () => { quitting = true }) // log off / restart: never hold Windows up
  win.on('close', event => { if (!quitting) { event.preventDefault(); companion.close() } })

  // The True Brainrot window: sign in, the account and settings, whether or not Claude is open.
  const logo = nativeImage.createFromBitmap(logoBitmap(32), { width: 32, height: 32, scaleFactor: 2 })
  const appPage = 'data:text/html;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8'))
  const openApp = () => {
    if (appWin && !appWin.isDestroyed()) { appWin.show(); appWin.focus(); return }
    appWin = new BrowserWindow({
      width: 460, height: 760, minWidth: 380, minHeight: 600, title: 'True Brainrot', icon: logo,
      backgroundColor: '#1b1209', show: false, webPreferences: { preload: path.join(__dirname, 'preload.js') },
    })
    stayPut(appWin.webContents)
    appWin.loadURL(appPage)
    appWin.webContents.on('did-finish-load', () => { applyAccess(); sendSettings(); checkLogins(); refresh() })
    appWin.once('ready-to-show', () => appWin.show())
    // Its × only hides it: the app keeps running in the tray, ready for Claude.
    appWin.on('close', event => { if (!quitting) { event.preventDefault(); appWin.hide() } })
  }
  ipcMain.on('open-app', openApp)

  tray = new Tray(logo)
  tray.setToolTip('True Brainrot')
  tray.on('click', openApp)
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open True Brainrot', click: openApp }, { label: 'Quit', click: () => app.quit() }]))

  // Installed, the exe is the app. From `npm start` it is electron.exe, which needs this folder passed in.
  const loginItem = () => app.setLoginItemSettings({ name: 'True Brainrot', openAtLogin: prefs.openAtLogin === true, path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] })
  // One payload for both windows: the page renders the card and the checklist it is given, so the
  // rules stay in onboarding.js rather than being written twice.
  const sendSettings = () => send('settings', {
    openAtLogin: prefs.openAtLogin === true,
    paused: !companion.isEnabled(),
    step: prefs.step,
    screen: screenFor({ email: account.view().email, step: prefs.step }),
    connected: prefs.connected === true,
    chimeOff: prefs.chimeOff === true,
    loggedIn,
    checklist: checklist({ connected: prefs.connected, loggedIn, chimeOff: prefs.chimeOff }),
    free: FREE,
    commands: PLUGIN_COMMANDS,
    privacy: PRIVACY_URL !== '',
  })
  ipcMain.on('set-setting', (_, key, value) => {
    if (key === 'openAtLogin') {
      prefs.openAtLogin = value === true
      savePrefs()
      loginItem()
    } else if (key === 'paused' && (value === true) === companion.isEnabled()) companion.toggleEnabled()
    else if (key === 'step' && STEPS.includes(value)) { prefs.step = value; savePrefs() }
    else if (key === 'chimeOff') { prefs.chimeOff = value === true; savePrefs() }
    sendSettings()
  })

  http.createServer((req, res) => {
    // curl sends no Origin; a web page in your browser does, and gets ignored.
    if (req.method === 'POST' && !req.headers.origin) {
      const name = req.url.slice(1)
      // The first hook proves the plugin is installed: that is what ticks the checklist.
      if (HOOKS.has(name) && !prefs.connected) { prefs.connected = true; savePrefs(); sendSettings() }
      companion.event(name)
    }
    res.writeHead(204).end() // no body: UserPromptSubmit output would reach Claude's context
  }).on('error', err => {
    // Something else holds the port: say so instead of crashing with a stack trace.
    dialog.showErrorBox('True Brainrot', `Can't listen on port ${PORT}: ${err.message}`)
    app.quit()
  }).listen(PORT, '127.0.0.1')

  // The feed belongs to Claude: switch to another app, minimise Claude or close it to the
  // tray, and the panel steps out of sight at once; come back and it returns.
  // The app window counts as "not Claude", so the panel never covers it.
  // Ctrl+Q is held only while Claude or the panel is in front, so every other app keeps its own Ctrl+Q.
  const holdOpenKey = present => {
    if (!present) globalShortcut.unregister(OPEN_KEY)
    else if (!globalShortcut.isRegistered(OPEN_KEY)) globalShortcut.register(OPEN_KEY, () => companion.toggleOpen())
  }
  const stopWatching = watchClaude(present => { holdOpenKey(present); companion.setPresent(present) },
    hwnd => Boolean(appWin) && !appWin.isDestroyed() && hwnd === hwndOf(appWin.getNativeWindowHandle()))
  app.on('will-quit', () => { stopWatching(); saveLogins() })

  globalShortcut.register(OFF_SWITCH, () => { companion.toggleEnabled(); sendSettings() })
  loginItem()

  // Starting True Brainrot again (Start menu, a desktop shortcut) while it already runs opens its window.
  app.on('second-instance', openApp)

  refresh()
  setInterval(refresh, 6 * 60 * 60 * 1000) // a cancelled or renewed subscription shows up within 6 h
  setInterval(applyAccess, 60 * 1000) // a trial ending mid-session locks within a minute

  // Right after installing, the first start opens the window so you can sign in. From then on it
  // opens only when you ask: tray icon, Start menu, or the sidebar's Open app.
  if (!prefs.setupDone) {
    openApp()
    prefs.setupDone = true
    savePrefs()
  }
})

app.on('will-quit', () => globalShortcut.unregisterAll())
