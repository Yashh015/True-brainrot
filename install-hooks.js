// Writes the plugin's hooks into Claude Code's settings.json, for running from this folder
// without installing the plugin. Keeps every other setting and hook. Safe to re-run: old
// companion entries (found by port) are replaced. Don't use it and the plugin together,
// or every hook fires twice.
const fs = require('fs')
const os = require('os')
const path = require('path')

const PORT = 47321

// plugin/hooks/hooks.json is the one definition of the hooks, so this copy never drifts from it.
// Read on use, not at load: the installed app requires this file only for PORT.
const pluginHooks = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks

function merge(settings) {
  const ours = group => JSON.stringify(group).includes(`127.0.0.1:${PORT}`)
  const hooks = {}
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    const kept = groups.filter(g => !ours(g))
    if (kept.length) hooks[event] = kept
  }
  for (const [event, groups] of Object.entries(pluginHooks()))
    hooks[event] = [...(hooks[event] || []), ...groups]
  return { ...settings, hooks }
}

function install(file = path.join(os.homedir(), '.claude', 'settings.json')) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}'
  const settings = JSON.parse(text) // a broken file throws here, before anything is written
  // The backup is taken once: a re-run must not replace your original with an already-edited copy.
  if (fs.existsSync(file) && !fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', text)
  fs.writeFileSync(file, JSON.stringify(merge(settings), null, 2) + '\n')
}

module.exports = { PORT, merge, install }

if (require.main === module) {
  install(process.argv[2])
  console.log('Hooks installed. New Claude sessions will use them.')
}
