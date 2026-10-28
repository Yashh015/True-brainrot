const test = require('node:test')
const assert = require('node:assert')
const { watchClaude, isClaudeApp, hwndOf } = require('./winwatch')

test('the desktop app counts as Claude, its CLI and other apps do not', () => {
  assert.ok(isClaudeApp(String.raw`C:\Program Files\WindowsApps\Claude_3.6556.2.0_x64__pzs8sxrjxfjjc\app\Claude.exe`))
  assert.ok(isClaudeApp(String.raw`C:\Users\UIS\AppData\Local\AnthropicClaude\app-1.0.0\claude.exe`))
  assert.ok(!isClaudeApp(String.raw`C:\Users\UIS\AppData\Local\Claude-Data\x\claude-code\2.1.308\y\claude.exe`))
  assert.ok(!isClaudeApp(String.raw`C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`))
  assert.ok(!isClaudeApp(''))
})

test('hooks set up, report who is in front once, and come off cleanly', () => {
  const seen = []
  const stop = watchClaude(present => seen.push(present))
  stop()
  assert.strictEqual(seen.length, 1)
  assert.strictEqual(typeof seen[0], 'boolean')
})

test('a native window handle reads the same on 64- and 32-bit buffers', () => {
  const wide = Buffer.alloc(8); wide.writeBigUInt64LE(0x1234abn)
  const narrow = Buffer.alloc(4); narrow.writeUInt32LE(0x1234ab)
  assert.strictEqual(hwndOf(wide), 0x1234ab)
  assert.strictEqual(hwndOf(narrow), 0x1234ab)
})
