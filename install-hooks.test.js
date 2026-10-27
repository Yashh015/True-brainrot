const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { merge, install, command } = require('./install-hooks')

test('command never fails Claude when the app is down', () => {
  assert.strictEqual(command('stop'), 'curl -s -m 1 -d "" http://127.0.0.1:47321/stop || exit 0')
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
  for (const event of ['UserPromptSubmit', 'Stop', 'Notification', 'SessionEnd'])
    assert.strictEqual(twice.hooks[event].length, 1, event)
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
