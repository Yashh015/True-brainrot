// Show/hide rules for the feed panel. Kept free of Electron so `node --test`
// can drive it with a fake clock.
const SHOW_DELAY = 5000 // quick-reply guard: a reply faster than this never shows the feed
const HIDE_DELAY = 2000 // the banner stays this long before the panel goes
const SNOOZE = 5000 // the banner's "5 more s" button
const IDLE_POLL = 1000 // while you are still at the keyboard (planning), re-check this often

function createCompanion(ui, schedule) {
  let shown = false
  let present = true // Claude (or the panel) is the window in front; away, the panel steps out of sight
  let enabled = true
  let showTimer = null
  let hideTimer = null
  const cancel = t => { if (t) t(); return null }

  // ui.show() is also how a re-prompt clears the banner, so it may run while shown.
  function show() {
    showTimer = cancel(showTimer)
    hideTimer = cancel(hideTimer)
    shown = true
    if (present) ui.show()
  }

  function hide() {
    showTimer = cancel(showTimer)
    hideTimer = cancel(hideTimer)
    if (shown) { shown = false; if (present) ui.hide() }
  }

  // Claude is still working past the guard; wait until you have stepped away too.
  function showWhenIdle() {
    if (!ui.isIdle || ui.isIdle()) show()
    else showTimer = schedule(showWhenIdle, IDLE_POLL)
  }

  // Any session finishing or asking hides the feed, so no per-session count is kept.
  function handBack(kind) {
    showTimer = cancel(showTimer)
    if (!shown || hideTimer) return // hidden already, or already handing back: idle and repeat alerts change nothing
    ui.alert(kind)
    hideTimer = schedule(hide, HIDE_DELAY)
  }

  return {
    event(name) {
      if (name === 'prompt') {
        if (shown) show()
        else if (enabled && !showTimer) showTimer = schedule(showWhenIdle, SHOW_DELAY)
      } else if (name === 'stop') handBack('done')
      else if (name === 'attention') handBack('attention')
      // No 'end': any chat closing anywhere used to slam the panel shut mid-scroll; 'stop' covers it.
    },
    // First launch, at Windows sign-in: wanted on screen for the login, but only beside Claude.
    start: show,
    // Opening it yourself shows it wherever you are, so the first-run login works and Ctrl+Q
    // never looks dead; it still steps aside the next time another app comes to the front.
    open() { present = true; show() },
    close: hide,
    toggleOpen() { shown && present ? hide() : this.open() },
    snooze() {
      if (hideTimer) { cancel(hideTimer); hideTimer = schedule(hide, SNOOZE) }
    },
    // Leaving Claude only hides the panel from view: `shown` is kept, so coming back
    // brings it back, and the done/needs-you chime still plays while you are elsewhere.
    setPresent(now) {
      if (now === present) return
      present = now
      // leave/back move with Claude's own animation; the slide is for the panel's own comings and goings.
      if (shown) now ? (ui.back || ui.show)() : (ui.leave || ui.hide)()
    },
    toggleEnabled() {
      enabled = !enabled
      if (!enabled) hide()
      return enabled
    },
  }
}

module.exports = { createCompanion }
