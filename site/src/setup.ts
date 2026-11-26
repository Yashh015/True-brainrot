import { SITE_URL } from './config'

export const setupPrompt = (siteUrl: string) =>
  `Install True Brainrot for me: in PowerShell run \`irm ${siteUrl.replace(/\/?$/, '/')}install.ps1 | iex\`, then tell me to log in to my feeds in the panel.`

export async function copySetup(
  button: HTMLButtonElement,
  write: (t: string) => Promise<void> = t => navigator.clipboard.writeText(t),
): Promise<'copied' | 'shown'> {
  const text = setupPrompt(SITE_URL)
  try {
    await write(text)
    const label = button.textContent
    button.textContent = 'Copied'
    setTimeout(() => (button.textContent = label), 2000)
    return 'copied'
  } catch {
    // Clipboard blocked or missing: show the prompt selected so Ctrl+C works.
    button.parentElement?.querySelectorAll('.copybox, .hint').forEach(e => e.remove())
    const box = document.createElement('textarea')
    box.readOnly = true
    box.className = 'copybox'
    box.rows = 3
    box.value = text
    const hint = document.createElement('p')
    hint.className = 'small hint'
    hint.textContent = 'Press Ctrl+C'
    button.after(box, hint)
    box.focus()
    box.select()
    return 'shown'
  }
}
