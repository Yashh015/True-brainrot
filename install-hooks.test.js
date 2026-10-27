const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { merge, install } = require('./install-hooks')
const plugin = JSON.parse(fs.readFileSync(path.join(__dirname, 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks

test('installs exactly the plugin hooks, idle reminders filtered out', () => {
  assert.deepStrictEqual(merge({}).hooks, plugin)
  assert.match(merge({}).hooks.Notification[0].matcher, /permission_prompt/)
  assert.doesNotMatch(merge({}).hooks.Notification[0].matcher, /idle_prompt/)
})

test('replaces the old curl hooks, including events the plugin no longer uses', () => {
  const old = { hooks: [{ type: 'command', command: 'curl -s -m 1 -d "" http://127.0.0.1:47321/end || exit 0' }] }
  const out = merge({ hooks: { SessionEnd: [old], Notification: [old] } })
  assert.strictEqual(out.hooks.SessionEnd, undefined)
  assert.deepStrictEqual(out.hooks.Notification, plugin.Notification)
})

test('keeps other settings and other hooks', () => {
  const other = { hooks: [{ type: 'command', command: 'echo mine' }] }
  const out = merge({ model: 'opus', hooks: { Stop: [other], PreToolUse: [other] } })
  assert.strictEqual(out.model, 'opus')
  assert.deepStrictEqual(out.hooks.PreToolUse, [other])
  assert.deepStrictEqual(out.hooks.Stop[0], other)
  assert.strictEqual(out.hooks.Stop.length, 2)
})

test('running twice does not duplicate', () => {
  const twice = merge(merge({}))
  assert.deepStrictEqual(twice.hooks, plugin)
})

test('broken settings.json is left untouched', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-')), 'settings.json')
  fs.writeFileSync(file, '{ broken')
  assert.throws(() => install(file))
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ broken')
})

test('missing settings.json is created, and a backup kept otherwise', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  const file = path.join(dir, 'settings.json')
  install(file)
  assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).hooks.Stop)
  install(file)
  assert.ok(fs.existsSync(file + '.bak'))
})

test('re-running keeps the backup of your original settings', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-')), 'settings.json')
  fs.writeFileSync(file, '{"model":"opus"}')
  install(file); install(file)
  assert.strictEqual(fs.readFileSync(file + '.bak', 'utf8'), '{"model":"opus"}')
})
