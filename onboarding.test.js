const test = require('node:test')
const assert = require('node:assert')
const { STEPS, screenFor, next, back, checklist, isDuplicate, shouldRetry } = require('./onboarding')

test('no email yet is always the email card', () => {
  for (const step of STEPS) assert.strictEqual(screenFor({ email: '', step }), 'email')
})

test('an email with the step left at email starts the walkthrough, never the profile', () => {
  assert.strictEqual(screenFor({ email: 'yash@example.com', step: 'email' }), 'how-1')
})

test('a saved step is the card that shows', () => {
  assert.strictEqual(screenFor({ email: 'yash@example.com', step: 'how-2' }), 'how-2')
  assert.strictEqual(screenFor({ email: 'yash@example.com', step: 'connect' }), 'connect')
  assert.strictEqual(screenFor({ email: 'yash@example.com', step: 'done' }), 'done')
})

test('a step nobody recognises falls back to the first walkthrough card', () => {
  assert.strictEqual(screenFor({ email: 'yash@example.com', step: 'nonsense' }), 'how-1')
  assert.strictEqual(screenFor({ email: 'yash@example.com' }), 'how-1')
})

test('signing out then in again walks the cards again, from how-1', () => {
  // Sign-out clears the email and puts the step back to 'email'; sign-in sets 'how-1'. The stale
  // 'done' a second account could inherit is exactly what this rules out.
  assert.strictEqual(screenFor({ email: '', step: 'email' }), 'email')
  assert.strictEqual(screenFor({ email: 'new@example.com', step: 'email' }), 'how-1')
})

test('next stops at the profile and back stops at the first walkthrough card', () => {
  assert.strictEqual(next('how-1'), 'how-2')
  assert.strictEqual(next('connect'), 'done')
  assert.strictEqual(next('done'), 'done')
  assert.strictEqual(back('how-1'), 'how-1')
  assert.strictEqual(back('how-2'), 'how-1')
  assert.strictEqual(back('done'), 'connect')
})

test('the checklist is done only when all three are ticked', () => {
  assert.strictEqual(checklist({ connected: true, loggedIn: true, chimeOff: true }).done, true)
  assert.strictEqual(checklist({ connected: true, loggedIn: true, chimeOff: false }).done, false)
  assert.strictEqual(checklist({}).done, false)
  assert.deepStrictEqual(checklist({}).items.map(i => i.key), ['connected', 'loggedIn', 'chimeOff'])
})

test('a repeat signup counts as success, a network failure does not', () => {
  assert.strictEqual(isDuplicate({ code: '23505', message: 'duplicate key value violates unique constraint' }), true)
  assert.strictEqual(isDuplicate({ code: '23505' }), true)
  assert.strictEqual(isDuplicate({ message: 'duplicate key value' }), true)
  assert.strictEqual(isDuplicate({ message: 'Failed to fetch' }), false)
  assert.strictEqual(isDuplicate(null), false)
})

test('a second address from the same PC today is not a repeat, and is tried again', () => {
  const daily = { code: '23505', message: 'duplicate key value violates unique constraint "one_signup_a_day"' }
  const repeat = { code: '23505', message: 'duplicate key value violates unique constraint "signups_pkey"' }
  assert.strictEqual(isDuplicate(daily), false)
  assert.strictEqual(shouldRetry(daily), true)
  assert.strictEqual(isDuplicate(repeat), true)
  assert.strictEqual(shouldRetry(repeat), false)
})

test('only a network failure or the daily limit is worth another try', () => {
  assert.strictEqual(shouldRetry({ message: 'TypeError: fetch failed', code: '' }), true)
  assert.strictEqual(shouldRetry({ code: '23514', message: 'new row violates check constraint' }), false)
  assert.strictEqual(shouldRetry({ code: '42P01', message: 'relation "signups" does not exist' }), false)
  assert.strictEqual(shouldRetry(null), false)
})
