// Chromium only encrypts a cookie when it writes it, and a login cookie can sit unchanged for
// months. Writing each one back as it is makes it go to disk encrypted. Kept free of Electron
// so `node --test` can check that nothing about a cookie changes on the way.

// Electron's cookies.get() shape → cookies.set() shape, for the same cookie.
function toSetDetails(c) {
  const host = c.domain.replace(/^\./, '')
  const details = {
    url: `${c.secure ? 'https' : 'http'}://${host}${c.path}`,
    name: c.name, value: c.value, path: c.path,
    secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
  }
  if (!c.hostOnly) details.domain = c.domain // left out, set() makes it host-only again
  if (!c.session) details.expirationDate = c.expirationDate
  return details
}

module.exports = { toSetDetails }
