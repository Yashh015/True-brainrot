// Whether the feed may show, from the last subscription status the server gave us. Kept free of
// Electron so `node --test` can check every rule with a fixed clock.
const OFFLINE_FOR = 3 * 24 * 60 * 60 * 1000 // works this long on the last answer, then needs the internet

const LOCKED = { past_due: 'payment-failed' }

// account: { signedIn, status, trialEndsAt, periodEnd, checkedAt }, times in ms.
function canUse(account, now) {
  if (!account.signedIn) return { ok: false, reason: 'signed-out' }
  // A check "from the future" means the clock was set back: treat as offline, or it could stretch a trial.
  if (!(account.checkedAt <= now) || now - account.checkedAt > OFFLINE_FOR) return { ok: false, reason: 'offline-too-long' }
  const { status } = account
  if (status === 'active') return { ok: true }
  if (status === 'trialing') return now < account.trialEndsAt ? { ok: true } : { ok: false, reason: 'trial-ended' }
  if (LOCKED[status]) return { ok: false, reason: LOCKED[status] }
  // Cancelled keeps working until the paid period runs out; no row at all is never let in.
  return status === 'cancelled' && now < account.periodEnd ? { ok: true } : { ok: false, reason: 'cancelled' }
}

module.exports = { canUse }
