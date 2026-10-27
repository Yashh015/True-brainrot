const test = require('node:test')
const assert = require('node:assert')
const { toSetDetails } = require('./cookies')

test('a host-only cookie is written back host-only, with every attribute kept', () => {
  const c = { name: 'sessionid', value: 'abc', domain: 'www.instagram.com', hostOnly: true, path: '/', secure: true, httpOnly: true, session: false, expirationDate: 1900000000, sameSite: 'lax' }
  assert.deepStrictEqual(toSetDetails(c), {
    url: 'https://www.instagram.com/', name: 'sessionid', value: 'abc', path: '/',
    secure: true, httpOnly: true, expirationDate: 1900000000, sameSite: 'lax',
  })
})

test('a domain cookie keeps its leading-dot domain', () => {
  const c = { name: 'auth_token', value: 'x', domain: '.x.com', hostOnly: false, path: '/', secure: true, httpOnly: true, session: false, expirationDate: 1900000000, sameSite: 'no_restriction' }
  assert.strictEqual(toSetDetails(c).url, 'https://x.com/')
  assert.strictEqual(toSetDetails(c).domain, '.x.com')
})

test('a session cookie stays a session cookie', () => {
  const c = { name: 's', value: '1', domain: 'x.com', hostOnly: true, path: '/i', secure: false, httpOnly: false, session: true, sameSite: 'unspecified' }
  const d = toSetDetails(c)
  assert.strictEqual('expirationDate' in d, false)
  assert.strictEqual(d.url, 'http://x.com/i')
})
