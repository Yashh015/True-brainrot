type IOCtor = typeof IntersectionObserver

export function startDemo(video: HTMLVideoElement, reduced: boolean, IO: IOCtor = IntersectionObserver): void {
  if (reduced) {
    const btn = document.createElement('button')
    btn.className = 'play'
    btn.type = 'button'
    btn.setAttribute('aria-label', 'Play demo')
    btn.textContent = '▶'
    btn.addEventListener('click', () => { video.play(); btn.remove() })
    video.after(btn)
    return
  }
  video.preload = 'auto'
  new IO(es => es.forEach(e => (e.isIntersecting ? video.play() : video.pause?.())), { threshold: 0.4 }).observe(video)
}

export function highlightNav(links: HTMLAnchorElement[], sections: HTMLElement[], IO: IOCtor = IntersectionObserver): void {
  const io = new IO(es => es.forEach(e => {
    if (!e.isIntersecting) return
    links.forEach(l => (l.getAttribute('href') === '#' + e.target.id ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')))
  }), { rootMargin: '-45% 0px -50% 0px' })
  sections.forEach(s => io.observe(s))
}
