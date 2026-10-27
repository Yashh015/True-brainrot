// The only sites the feed session may show: the feeds, and the sign-ins they hand off to.
// Anything else opens in your normal browser, so no other site ever runs with your logins.
const FEED_HOSTS = ['x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'google.com', 'apple.com']

function inFeed(url) {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && FEED_HOSTS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch { return false }
}

// Only web links leave for the browser; never file:, ms-settings: or other schemes a page could plant.
const isWebLink = url => /^https?:\/\//i.test(url)

module.exports = { inFeed, isWebLink }
