import { copySetup } from './setup'

document.querySelectorAll<HTMLButtonElement>('[data-copy-setup]').forEach(b => b.addEventListener('click', () => copySetup(b)))
import { startDemo, highlightNav } from './motion'

const video = document.querySelector<HTMLVideoElement>('#demo')
if (video) startDemo(video, matchMedia('(prefers-reduced-motion: reduce)').matches)
highlightNav([...document.querySelectorAll<HTMLAnchorElement>('nav a')], [...document.querySelectorAll<HTMLElement>('main > section')])
