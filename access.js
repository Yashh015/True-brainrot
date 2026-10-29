// Whether the feed may show, from the last subscription status the server gave us. Kept free of
// Electron so `node --test` can check every rule with a fixed clock.
const OFFLINE_FOR = 3 * 24 * 60 * 60 * 1000 // works this long on the last answer, then needs the internet

const CLOCK_SLACK = 10 * 60 * 1000 // a time sync may nudge the clock back this much; more is a rollback

const LOCKED = { past_due: 'payment-failed' }

// Early access: everyone in, no trial, no subscription, no device limit. Flip this to false to bring
// the paid rules back exactly as they were.
const FREE = true

// account: { signedIn, status, trialEndsAt, periodEnd, checkedAt, seenAt }, times in ms.
// seenAt is the latest time the app has seen since the last check.
function paidCanUse(account, now) {
  if (!account.signedIn) return { ok: false, reason: 'signed-out' }
  // A check "from the future", or a clock now behind a time already seen, means the clock was set
  // back: treat as offline, or rewinding again and again would stretch the 3 days, or a trial.
  if (!(account.checkedAt <= now) || account.seenAt - now > CLOCK_SLACK || now - account.checkedAt > OFFLINE_FOR) return { ok: false, reason: 'offline-too-long' }
  const { status } = account
  if (status === 'active') return { ok: true }
  if (status === 'trialing') return now < account.trialEndsAt ? { ok: true } : { ok: false, reason: 'trial-ended' }
  if (LOCKED[status]) return { ok: false, reason: LOCKED[status] }
  // Cancelled keeps working until the paid period runs out; no row at all is never let in.
  return status === 'cancelled' && now < account.periodEnd ? { ok: true } : { ok: false, reason: 'cancelled' }
}

// While it is free there is nothing to protect: an email is the whole account.
function canUse(account, now) {
  if (!account.signedIn) return { ok: false, reason: 'signed-out' }
  return FREE ? { ok: true } : paidCanUse(account, now)
}

const DAY = 24 * 60 * 60 * 1000
const date = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// The account in one line, for the app window's profile.
function paidPlanLine(sub, now) {
  const { status, trialEndsAt, periodEnd } = sub || {}
  if (status === 'trialing') {
    const days = Math.ceil((trialEndsAt - now) / DAY)
    return days > 0 ? `Free trial · ${days} ${days === 1 ? 'day' : 'days'} left` : 'Free trial ended'
  }
  if (status === 'active') return periodEnd > 0 ? `Subscribed · renews ${date(periodEnd)}` : 'Subscribed'
  if (status === 'past_due') return 'Payment failed'
  if (status === 'cancelled') return periodEnd > now ? `Cancelled · works until ${date(periodEnd)}` : 'Subscription ended'
  return 'No subscription'
}

function planLine(sub, now) {
  return FREE ? 'Free · early access' : paidPlanLine(sub, now)
}

module.exports = { FREE, canUse, planLine, paidCanUse, paidPlanLine }
