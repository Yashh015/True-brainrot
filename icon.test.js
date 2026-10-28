const test = require('node:test')
const assert = require('node:assert')
const { logoBitmap } = require('./icon')

test('the logo is yellow squares on a clear background', () => {
  const size = 20
  const px = logoBitmap(size)
  assert.strictEqual(px.length, size * size * 4)
  const at = (x, y) => [...px.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)]
  assert.deepStrictEqual(at(9, 1), [0x4a, 0xcf, 0xf2, 0xff]) // inside the top square, BGRA
  assert.deepStrictEqual(at(10, 10), [0x4a, 0xcf, 0xf2, 0xff]) // the centre
  assert.deepStrictEqual(at(0, 0), [0, 0, 0, 0]) // a corner stays clear
  assert.strictEqual(logoBitmap(32).length, 32 * 32 * 4)
})
