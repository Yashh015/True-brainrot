// The free walkthrough's rules, kept free of Electron so `node --test` can walk every step.
const STEPS = ['email', 'how-1', 'how-2', 'connect', 'done']

// Which card the app window shows. No email is always the email card; an email with the step still
// at 'email' (a fresh sign-in, or an install from before this flow) starts at how-1, never 'done'.
function screenFor({ email, step }) {
  if (!email) return 'email'
  if (!STEPS.includes(step) || step === 'email') return 'how-1'
  return step
}

// 'how-1' is the floor for back: the email card is behind the sign-in, so going back to it would
// only bounce forward again.
const FIRST = STEPS.indexOf('how-1')
const clamp = index => STEPS[Math.min(Math.max(index, FIRST), STEPS.length - 1)]

function next(step) { return clamp(STEPS.indexOf(step) + 1) }
function back(step) { return clamp(STEPS.indexOf(step) - 1) }

// The profile's setup list. Two items tick themselves from what the app already knows; the third is
// a checkbox, because nothing here can see Claude's own sound setting.
function checklist({ connected, loggedIn, chimeOff } = {}) {
  const items = [
    { key: 'connected', label: 'Claude connected', done: Boolean(connected), auto: true },
    { key: 'loggedIn', label: 'Logged in to X or Instagram', done: Boolean(loggedIn), auto: true },
    { key: 'chimeOff', label: "Claude's own chime turned off", done: Boolean(chimeOff), auto: false },
  ]
  return { items, done: items.every(item => item.done) }
}

// A repeat signup is a success: the key caught it, so this email is already on the list. Kept here,
// out of account.js, so the rule can be tested without Electron.
function isDuplicate(error) {
  if (!error) return false
  return error.code === '23505' || /duplicate key/i.test(error.message || '')
}

module.exports = { STEPS, screenFor, next, back, checklist, isDuplicate }
