// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { startDemo, highlightNav } from '../src/motion'

type IO = typeof IntersectionObserver
function fakeIO() {
  let cb!: IntersectionObserverCallback
  const Ctor = function (c: IntersectionObserverCallback) { cb = c; return { observe() {}, disconnect() {}, unobserve() {} } } as unknown as IO
  return { Ctor, fire: (...els: [Element, boolean][]) => cb(els.map(([target, isIntersecting]) => ({ target, isIntersecting }) as IntersectionObserverEntry), {} as IntersectionObserver) }
}
const mkVideo = () => {
  document.body.innerHTML = '<div><video></video></div>'
  const v = document.querySelector('video')!
  v.play = vi.fn().mockResolvedValue(undefined)
  return v
}

describe('startDemo', () => {
  it('reduced motion: never plays, adds a play button that plays on click', () => {
    const v = mkVideo(); const io = fakeIO()
    startDemo(v, true, io.Ctor)
    expect(v.play).not.toHaveBeenCalled()
    const btn = document.querySelector('button.play') as HTMLButtonElement
    expect(btn).not.toBeNull()
    btn.click()
    expect(v.play).toHaveBeenCalledOnce()
  })
  it('normal: preload auto, plays only when visible', () => {
    const v = mkVideo(); const io = fakeIO()
    startDemo(v, false, io.Ctor)
    expect(v.preload).toBe('auto')
    expect(v.play).not.toHaveBeenCalled()
    io.fire([v, false]); expect(v.play).not.toHaveBeenCalled()
    io.fire([v, true]); expect(v.play).toHaveBeenCalledOnce()
  })
})

describe('highlightNav', () => {
  it('marks the link whose section is visible', () => {
    document.body.innerHTML = '<a href="#a"></a><a href="#b"></a><section id="a"></section><section id="b"></section>'
    const links = [...document.querySelectorAll('a')], secs = [...document.querySelectorAll('section')] as HTMLElement[]
    const io = fakeIO()
    highlightNav(links, secs, io.Ctor)
    io.fire([secs[1], true])
    expect(links[1].getAttribute('aria-current')).toBe('true')
    expect(links[0].hasAttribute('aria-current')).toBe(false)
  })
})
