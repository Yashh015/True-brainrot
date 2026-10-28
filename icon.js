// The pixel logo (the same squares as the app window's brand mark) as raw pixels, so the tray and
// the window get an icon without an image file. Yellow, so it shows on light and dark taskbars.
const SQUARES = [[8, 0, 4, 4], [0, 8, 4, 4], [16, 8, 4, 4], [8, 16, 4, 4], [7, 7, 6, 6], [3, 3, 2, 2], [15, 15, 2, 2]] // x, y, w, h on a 20 grid
const BGRA = [0x4a, 0xcf, 0xf2, 0xff] // #f2cf4a

function logoBitmap(size) {
  const px = Buffer.alloc(size * size * 4)
  const s = size / 20
  for (const [x, y, w, h] of SQUARES)
    for (let row = Math.floor(y * s); row < Math.floor((y + h) * s); row++)
      for (let col = Math.floor(x * s); col < Math.floor((x + w) * s); col++)
        px.set(BGRA, (row * size + col) * 4)
  return px
}

module.exports = { logoBitmap }
