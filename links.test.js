const test = require('node:test')
const assert = require('node:assert')
const { inFeed, isWebLink } = require('./links')

test('the feeds and their sign-ins stay in the panel', () => {
  for (const url of ['https://x.com/home', 'https://www.instagram.com/', 'https://l.instagram.com/?u=x',
    'https://accounts.google.com/o/oauth2', 'https://appleid.apple.com/auth', 'https://m.facebook.com/login'])
    assert.ok(inFeed(url), url)
})

test('every other site, look-alike or scheme leaves the panel', () => {
  for (const url of ['https://example.com', 'https://notx.com', 'https://x.com.evil.io/', 'http://x.com/',
    'file:///C:/Windows/win.ini', 'javascript:alert(1)', 'not a url', ''])
    assert.ok(!inFeed(url), url)
})

test('only web links are handed to the browser', () => {
  assert.ok(isWebLink('https://example.com'))
  assert.ok(isWebLink('HTTP://example.com'))
  for (const url of ['file:///C:/x', 'ms-settings:privacy', 'javascript:alert(1)', 'mailto:a@b.c'])
    assert.ok(!isWebLink(url), url)
})

test('only the page itself leaving the feed sites goes to the browser, never a frame inside it', () => {
  const { leavesFeed } = require('./links')
  assert.ok(leavesFeed({ isMainFrame: true, url: 'https://example.com/' }))
  assert.ok(!leavesFeed({ isMainFrame: true, url: 'https://x.com/home' }))
  // Sign-in captchas and checks redirect between other sites inside frames.
  assert.ok(!leavesFeed({ isMainFrame: false, url: 'https://client-api.arkoselabs.com/fc/gt2' }))
  assert.ok(!leavesFeed({ isMainFrame: false, url: 'https://example.com/' }))
})
