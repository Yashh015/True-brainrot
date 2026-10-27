const test = require('node:test')
const assert = require('node:assert')
const { createCompanion } = require('./state')

// Fake clock: tick(ms) runs every timer that falls due, in order.
function rig() {
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

test('session end hides at once', () => {
  const { c, log } = rig()
  c.open(); c.event('end')
  assert.deepStrictEqual(log, ['show', 'hide'])
})
