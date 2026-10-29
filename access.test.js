const test = require('node:test')
const assert = require('node:assert')
const { canUse, planLine } = require('./access')

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 9, 27)
const fresh = { signedIn: true, checkedAt: now - 1000 }

test('signed out is locked', () => {
  assert.deepStrictEqual(canUse({ signedIn: false }, now), { ok: false, reason: 'signed-out' })
})

test('a trial works until it ends, then locks', () => {
  assert.strictEqual(canUse({ ...fresh, status: 'trialing', trialEndsAt: now + 1 }, now).ok, true)
  assert.deepStrictEqual(canUse({ ...fresh, status: 'trialing', trialEndsAt: now }, now), { ok: false, reason: 'trial-ended' })
})

test('an active subscription works', () => {
  assert.strictEqual(canUse({ ...fresh, status: 'active', periodEnd: now + DAY }, now).ok, true)
})

test('a failed payment locks with a reason the gate can act on', () => {
  assert.deepStrictEqual(canUse({ ...fresh, status: 'past_due' }, now), { ok: false, reason: 'payment-failed' })
})

test('a cancelled subscription works until the paid period ends', () => {
  assert.strictEqual(canUse({ ...fresh, status: 'cancelled', periodEnd: now + 1 }, now).ok, true)
  assert.deepStrictEqual(canUse({ ...fresh, status: 'cancelled', periodEnd: now }, now), { ok: false, reason: 'cancelled' })
})

test('an account with no subscription row is locked, not let in', () => {
  assert.deepStrictEqual(canUse({ ...fresh, status: undefined }, now), { ok: false, reason: 'cancelled' })
})

test('offline for up to 3 days keeps working, longer locks', () => {
  const sub = { signedIn: true, status: 'active' }
  assert.strictEqual(canUse({ ...sub, checkedAt: now - 3 * DAY }, now).ok, true)
  assert.deepStrictEqual(canUse({ ...sub, checkedAt: now - 3 * DAY - 1 }, now), { ok: false, reason: 'offline-too-long' })
})

test('a clock set backwards counts as offline, so it cannot stretch a trial', () => {
  assert.deepStrictEqual(canUse({ signedIn: true, status: 'active', checkedAt: now + DAY }, now), { ok: false, reason: 'offline-too-long' })
})

test('winding the clock back past the latest time seen locks, so the offline days cannot be replayed', () => {
  const sub = { signedIn: true, status: 'active', checkedAt: now - 2 * DAY }
  assert.deepStrictEqual(canUse({ ...sub, seenAt: now + DAY }, now), { ok: false, reason: 'offline-too-long' })
  // A clock nudged back a few minutes (a time sync) is not a rollback.
  assert.strictEqual(canUse({ ...sub, seenAt: now + 5 * 60 * 1000 }, now).ok, true)
})

test('the plan line says what the account has, in words', () => {
  const day = 24 * 60 * 60 * 1000
  assert.strictEqual(planLine({ status: 'trialing', trialEndsAt: now + 4.2 * day }, now), 'Free trial · 5 days left')
  assert.strictEqual(planLine({ status: 'trialing', trialEndsAt: now + day / 2 }, now), 'Free trial · 1 day left')
  assert.strictEqual(planLine({ status: 'trialing', trialEndsAt: now }, now), 'Free trial ended')
  assert.strictEqual(planLine({ status: 'active', periodEnd: Date.UTC(2026, 10, 28) }, now), 'Subscribed · renews 28 Nov 2026')
  assert.strictEqual(planLine({ status: 'active', periodEnd: NaN }, now), 'Subscribed')
  assert.strictEqual(planLine({ status: 'past_due' }, now), 'Payment failed')
  assert.strictEqual(planLine({ status: 'cancelled', periodEnd: Date.UTC(2026, 10, 2) }, now), 'Cancelled · works until 2 Nov 2026')
  assert.strictEqual(planLine({ status: 'cancelled', periodEnd: now }, now), 'Subscription ended')
  assert.strictEqual(planLine(undefined, now), 'No subscription')
})
