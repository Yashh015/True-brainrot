// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const doc = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html')

describe('landing page', () => {
  it('has the 4 nav links with exact labels', () => {
    const links = [...doc.querySelectorAll('nav a')].map(a => [a.getAttribute('href'), a.textContent!.trim()])
    expect(links).toEqual([['#home', 'Home'], ['#features', 'Features'], ['#socials', 'Socials'], ['#get-it', 'Get it']])
  })
  it('has one section per id', () => {
    for (const id of ['home', 'features', 'socials', 'get-it']) expect(doc.querySelectorAll(`section#${id}`).length).toBe(1)
  })
  it('has the 5 socials', () => {
    const labels = [...doc.querySelectorAll('#socials [aria-label]')].map(a => a.getAttribute('aria-label'))
    expect(labels).toEqual(['X', 'Instagram', 'YouTube', 'Reddit', 'Telegram'])
  })
  it('has the exact tagline', () => {
    expect(doc.body.textContent).toContain('Works in Claude Code. Windows only. Free.')
  })
  it('links privacy in the footer', () => {
    expect(doc.querySelector('footer a[href="privacy.html"]')).not.toBeNull()
  })
})
