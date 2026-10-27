// Show/hide rules for the feed panel. Kept free of Electron so `node --test`
// can drive it with a fake clock.
const SHOW_DELAY = 5000 // quick-reply guard: a reply faster than this never shows the feed
const HIDE_DELAY = 2000 // the banner stays this long before the panel goes
const SNOOZE = 5000 // the banner's "5 more s" button

function createCompanion(ui, schedule) {
  let shown = false
  let enabled = true
  let showTimer = null
  let hideTimer = null
  const cancel = t => { if (t) t(); return null }

  // ui.show() is also how a re-prompt clears the banner, so it may run while shown.
  function show() {
    showTimer = cancel(showTimer)
    hideTimer = cancel(hideTimer)
    shown = true
    ui.show()
  }

  function hide() {
    showTimer = cancel(showTimer)
    hideTimer = cancel(hideTimer)
    if (shown) { shown = false; ui.hide() }
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
        else if (enabled && !showTimer) showTimer = schedule(show, SHOW_DELAY)
      } else if (name === 'stop') handBack('done')
      else if (name === 'attention') handBack('attention')
      else if (name === 'end') hide()
    },
    open: show,
    snooze() {
      if (hideTimer) { cancel(hideTimer); hideTimer = schedule(hide, SNOOZE) }
    },
    toggleEnabled() {
      enabled = !enabled
      if (!enabled) hide()
      return enabled
    },
  }
}

module.exports = { createCompanion }
