// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { setupPrompt, copySetup } from '../src/setup'

const want = (u: string) => `Install True Brainrot for me: in PowerShell run \`irm ${u}install.ps1 | iex\`, then tell me to log in to my feeds in the panel.`

describe('setupPrompt', () => {
  it('builds the exact prompt', () => expect(setupPrompt('https://x.test/')).toBe(want('https://x.test/')))
  it('does not double the trailing slash', () => expect(setupPrompt('https://x.test')).toBe(want('https://x.test/')))
})

describe('copySetup', () => {
  it('copies and shows Copied for 2s', async () => {
    vi.useFakeTimers()
    const b = document.createElement('button'); b.textContent = 'Copy agent setup'
    const write = vi.fn().mockResolvedValue(undefined)
    expect(await copySetup(b, write)).toBe('copied')
    expect(write).toHaveBeenCalledWith(setupPrompt('https://yashh015.github.io/True-brainrot/'))
    expect(b.textContent).toBe('Copied')
    vi.advanceTimersByTime(2000)
    expect(b.textContent).toBe('Copy agent setup')
    vi.useRealTimers()
  })
  it('shows a selected textarea when the clipboard is blocked', async () => {
    document.body.innerHTML = '<div><button>Copy agent setup</button></div>'
    const b = document.querySelector('button')!
    expect(await copySetup(b, () => Promise.reject(new Error('denied')))).toBe('shown')
    const t = document.querySelector('textarea[readonly]') as HTMLTextAreaElement
    expect(t.value).toBe(setupPrompt('https://yashh015.github.io/True-brainrot/'))
    expect(t.selectionEnd - t.selectionStart).toBe(t.value.length)
    expect(document.body.textContent).toContain('Press Ctrl+C')
  })
  it('shows the box when there is no clipboard api at all', async () => {
    document.body.innerHTML = '<div><button>x</button></div>'
    expect(await copySetup(document.querySelector('button')!)).toBe('shown')
  })
})
