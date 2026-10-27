const test = require('node:test')
const assert = require('node:assert')
const { createCompanion } = require('./state')

// Fake clock: tick(ms) runs every timer that falls due, in order.
function rig(isIdle = () => true) {
  const log = []
  let timers = []
  let now = 0
  const schedule = (fn, ms) => {
    const t = { at: now + ms, fn }
    timers.push(t)
    return () => { timers = timers.filter(x => x !== t) }
  }
  const tick = ms => {
    const end = now + ms
    for (;;) {
      const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      timers = timers.filter(t => t !== due)
      now = due.at
      due.fn()
    }
    now = end
  }
  const c = createCompanion({
    show: () => log.push('show'),
    hide: () => log.push('hide'),
    alert: kind => log.push('alert:' + kind),
    isIdle: () => isIdle(),
  }, schedule)
  return { c, log, tick }
}

test('a quick reply never shows the feed', () => {
  const { c, log, tick } = rig()
  c.event('prompt'); tick(3000); c.event('stop'); tick(10000)
  assert.deepStrictEqual(log, [])
})

test('a slow reply shows, then alerts and hides after 2 s', () => {
  const { c, log, tick } = rig()
  c.event('prompt'); tick(5000)
  assert.deepStrictEqual(log, ['show'])
  c.event('stop'); tick(1999)
  assert.deepStrictEqual(log, ['show', 'alert:done'])
  tick(1)
  assert.deepStrictEqual(log, ['show', 'alert:done', 'hide'])
})

test('needs-you gets its own alert', () => {
  const { c, log, tick } = rig()
  c.event('prompt'); tick(5000); c.event('attention')
  assert.deepStrictEqual(log, ['show', 'alert:attention'])
})

test('idle notification while hidden changes nothing', () => {
  const { c, log, tick } = rig()
  c.event('prompt'); tick(5000); c.event('stop'); tick(2000)
  c.event('attention'); tick(10000)
  assert.deepStrictEqual(log, ['show', 'alert:done', 'hide'])
})

test('a new prompt during the banner keeps the panel', () => {
  const { c, log, tick } = rig()
  c.event('prompt'); tick(5000); c.event('stop'); tick(1000)
  c.event('prompt'); tick(10000)
  assert.deepStrictEqual(log, ['show', 'alert:done', 'show'])
})

test('snooze gives 5 more seconds from the click', () => {
  const { c, log, tick } = rig()
  c.event('prompt'); tick(5000); c.event('stop'); tick(1000)
  c.snooze(); tick(4999)
  assert.ok(!log.includes('hide'))
  tick(1)
  assert.strictEqual(log.at(-1), 'hide')
})

test('two sessions prompting show the feed once; either stopping hides it', () => {
  const { c, log, tick } = rig()
  c.event('prompt'); tick(1000); c.event('prompt'); tick(5000)
  assert.deepStrictEqual(log, ['show'])
  c.event('stop'); tick(2000)
  assert.deepStrictEqual(log, ['show', 'alert:done', 'hide'])
})

test('off switch hides and ignores prompts until turned back on', () => {
  const { c, log, tick } = rig()
  c.open()
  assert.strictEqual(c.toggleEnabled(), false)
  c.event('prompt'); tick(10000)
  assert.deepStrictEqual(log, ['show', 'hide'])
  c.toggleEnabled(); c.event('prompt'); tick(5000)
  assert.strictEqual(log.at(-1), 'show')
})

test('a chat closing somewhere leaves the panel alone', () => {
  const { c, log } = rig()
  c.open(); c.event('end')
  assert.deepStrictEqual(log, ['show'])
})

test('the open key shows at once and closes on a second press', () => {
  const { c, log } = rig()
  c.toggleOpen(); c.toggleOpen()
  assert.deepStrictEqual(log, ['show', 'hide'])
})

test('while you are busy (planning) it waits; it shows once you go idle', () => {
  let idle = false
  const { c, log, tick } = rig(() => idle)
  c.event('prompt'); tick(30000)
  assert.deepStrictEqual(log, [])
  idle = true; tick(1000)
  assert.deepStrictEqual(log, ['show'])
})

test('a reply that lands while you are busy never shows the feed', () => {
  const { c, log, tick } = rig(() => false)
  c.event('prompt'); tick(20000); c.event('stop'); tick(60000)
  assert.deepStrictEqual(log, [])
})

test('the minimise button hides now and the next long task shows it again', () => {
  const { c, log, tick } = rig()
  c.open(); c.close()
  c.event('prompt'); tick(5000)
  assert.deepStrictEqual(log, ['show', 'hide', 'show'])
})

test('switching to another app hides the panel; coming back brings it back', () => {
  const { c, log } = rig()
  c.open(); c.setPresent(false); c.setPresent(true)
  assert.deepStrictEqual(log, ['show', 'hide', 'show'])
})

test('a long task that starts while you are away waits for you to come back', () => {
  const { c, log, tick } = rig()
  c.setPresent(false); c.event('prompt'); tick(10000)
  assert.deepStrictEqual(log, [])
  c.setPresent(true)
  assert.deepStrictEqual(log, ['show'])
})

test('Claude finishing while you are away chimes, and the panel stays gone when you return', () => {
  const { c, log, tick } = rig()
  c.open(); c.setPresent(false); c.event('stop'); tick(2000); c.setPresent(true)
  assert.deepStrictEqual(log, ['show', 'hide', 'alert:done'])
})

test('following Claude out and back uses leave/back, not the slide', () => {
  const log = []
  const c = createCompanion({
    show: () => log.push('show'), hide: () => log.push('hide'), alert: () => {},
    leave: () => log.push('leave'), back: () => log.push('back'),
  }, () => () => {})
  c.open(); c.setPresent(false); c.setPresent(true); c.close()
  assert.deepStrictEqual(log, ['show', 'leave', 'back', 'hide'])
})

test('opening it yourself works while another app is in front, until the next switch', () => {
  const { c, log } = rig()
  c.setPresent(false)
  c.open()
  assert.deepStrictEqual(log, ['show'])
  c.setPresent(false)
  assert.deepStrictEqual(log, ['show', 'hide'])
})

test('Ctrl+Q while the panel is hidden away from Claude brings it up, not down', () => {
  const { c, log } = rig()
  c.open(); c.setPresent(false); c.toggleOpen()
  assert.deepStrictEqual(log, ['show', 'hide', 'show'])
  c.toggleOpen()
  assert.strictEqual(log.at(-1), 'hide')
})

test('a closed panel stays closed when you come back to Claude', () => {
  const { c, log } = rig()
  c.setPresent(false); c.setPresent(true)
  assert.deepStrictEqual(log, [])
})
