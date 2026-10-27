// Writes the companion's hooks into Claude Code's settings.json, keeping every other
// setting and hook. Safe to re-run: old companion entries (found by port) are replaced.
const fs = require('fs')
const os = require('os')
const path = require('path')

const PORT = 47321
const EVENTS = { UserPromptSubmit: 'prompt', Stop: 'stop', Notification: 'attention', SessionEnd: 'end' }

// -m 1 and `|| exit 0`: Claude never waits on, or reports, a companion that isn't running.
// The same text works in Git Bash and cmd.
const command = name => `curl -s -m 1 -d "" http://127.0.0.1:${PORT}/${name} || exit 0`

function merge(settings) {
  const hooks = { ...settings.hooks }
  for (const [hookEvent, name] of Object.entries(EVENTS)) {
    const kept = (hooks[hookEvent] || []).filter(group => !JSON.stringify(group).includes(`127.0.0.1:${PORT}`))
    hooks[hookEvent] = [...kept, { hooks: [{ type: 'command', command: command(name) }] }]
  }
  return { ...settings, hooks }
}

function install(file = path.join(os.homedir(), '.claude', 'settings.json')) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}'
  const settings = JSON.parse(text) // a broken file throws here, before anything is written
  // The backup is taken once: a re-run must not replace your original with an already-edited copy.
  if (fs.existsSync(file) && !fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', text)
  fs.writeFileSync(file, JSON.stringify(merge(settings), null, 2) + '\n')
}

module.exports = { PORT, merge, install, command }

if (require.main === module) {
  install(process.argv[2])
  console.log('Companion hooks installed. New Claude sessions will use them.')
}
