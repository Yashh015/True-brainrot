import { copySetup } from './setup'

document.querySelectorAll<HTMLButtonElement>('[data-copy-setup]').forEach(b => b.addEventListener('click', () => copySetup(b)))
