import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it, expect } from 'vitest'

const script = resolve('public/install.ps1')
const run = (env: Record<string, string>) => {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-DryRun'], { env: { ...process.env, ...env }, encoding: 'utf8' })
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status }
}
const M = 'claude plugin marketplace add Yashh015/True-brainrot'
const I = 'claude plugin install true-brainrot@true-brainrot'

describe('install.ps1 -DryRun', () => {
  it('prints download, silent install and both plugin commands, exit 0', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'tb-')), 'rel.json')
    writeFileSync(f, JSON.stringify({ assets: [{ browser_download_url: 'https://x.test/a.zip' }, { browser_download_url: 'https://x.test/True-Brainrot-Setup.exe' }] }))
    const { out, code } = run({ TB_API: pathToFileURL(f).href, TB_CLAUDE: 'powershell' })
    expect(code).toBe(0)
    const at = [out.indexOf('Download https://x.test/True-Brainrot-Setup.exe'), out.indexOf('Install silently'), out.indexOf(M), out.indexOf(I)]
    expect(at.every(i => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it("says Couldn't reach GitHub when the API is down, no stack trace, exit 1", () => {
    const { out, code } = run({ TB_API: 'http://127.0.0.1:9/' })
    expect(code).toBe(1)
    expect(out).toContain("Couldn't reach GitHub")
    expect(out).toContain('https://github.com/Yashh015/True-brainrot/releases/latest')
    expect(out).not.toMatch(/Exception/)
  })
  it('prints the plugin commands to paste when claude is missing, exit 1', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'tb-')), 'rel.json')
    writeFileSync(f, JSON.stringify({ assets: [{ browser_download_url: 'https://x.test/s.exe' }] }))
    const { out, code } = run({ TB_API: pathToFileURL(f).href, TB_CLAUDE: 'nope-not-a-command' })
    expect(code).toBe(1)
    expect(out).toContain('Paste these into Claude Code:')
    expect(out.indexOf(M)).toBeGreaterThan(out.indexOf('Paste these'))
    expect(out).toContain(I)
  })
})
