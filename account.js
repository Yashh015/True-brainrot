// Sign-in by a code emailed to you, the subscription status and this PC's place in the 2-device limit.
// Everything is kept in one file encrypted by Windows (safeStorage), so a copied file is useless.
const { safeStorage } = require('electron')
const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { canUse, planLine, FREE } = require('./access')
const { shouldRetry } = require('./onboarding')

function createAccount({ url, anonKey, dir, onChange }) {
  const file = path.join(dir, 'account.bin')
  let store = {}
  try { store = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) } catch {} // none yet, or another Windows user's
  const write = () => fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(store)))
  const save = () => { write(); onChange() }
  if (!store.deviceId) { store.deviceId = crypto.randomUUID(); write() }

  // supabase-js keeps the session through this.
  const storage = {
    getItem: key => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; save() },
    removeItem: key => { delete store[key]; save() },
  }
  const supabase = createClient(url, anonKey, {
    auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })

  let others = null // the other PCs, set only while this one is refused by the device limit
  let error = null
  let seenWritten = 0 // when seenAt last went to disk

  // Sends the email that sign-in kept. A duplicate is a success: the key caught it, so this email is
  // already on the list. Offline, or a second address on a day this PC already signed up, is kept
  // and retried; anything else the server refuses is dropped rather than retried forever.
  async function sendSignup() {
    if (!store.signupPending || !store.email) return
    const { error: failed } = await supabase.from('signups')
      .insert({ email: store.email, device_id: store.deviceId })
    if (shouldRetry(failed)) return
    delete store.signupPending
    save()
  }

  async function refresh() {
    if (!store.email) return
    if (FREE) return sendSignup() // no devices, no subscription: the email list is all we keep
    const device = await supabase.rpc('register_device', { p_device_id: store.deviceId, p_name: os.hostname() })
    if (device.error?.message.includes('device_limit')) {
      const { data } = await supabase.from('devices').select('device_id, name, last_seen').order('last_seen')
      others = data || []
      return save()
    }
    if (device.error) return // offline or the server is down: keep the last answer (access.js allows 3 days)
    others = null
    const list = await supabase.from('devices').select('device_id, name, last_seen').order('last_seen')
    if (!list.error) store.devices = list.data
    const { data, error: failed } = await supabase.from('subscriptions')
      .select('status, trial_ends_at, current_period_end').maybeSingle()
    if (failed) return
    store.sub = {
      status: data?.status, // no row at all is locked by access.js, never let in
      trialEndsAt: Date.parse(data?.trial_ends_at),
      periodEnd: Date.parse(data?.current_period_end),
      checkedAt: Date.now(),
    }
    save()
  }

  return {
    refresh,

    // What both windows show: the feed or a gate screen, plus the profile for the app window.
    view() {
      // Remember the latest time seen, so winding the clock back can't replay the offline days.
      // A successful check (refresh) replaces store.sub, which clears it after a clock is fixed.
      // Kept current in memory, so a rewind locks once it passes access.js's slack; written to disk
      // at most every 10 minutes, not on every call.
      if (store.sub) {
        store.sub.seenAt = Math.max(store.sub.seenAt || 0, Date.now())
        if (Date.now() - seenWritten > 10 * 60 * 1000) { seenWritten = Date.now(); write() }
      }
      const profile = { email: store.email, status: store.sub?.status, plan: planLine(store.sub, Date.now()), deviceId: store.deviceId, sent: store.sent, error }
      if (others) return { ...profile, ok: false, reason: 'device-limit', devices: others }
      return { ...profile, ...canUse({ signedIn: Boolean(store.email), ...store.sub }, Date.now()), devices: FREE ? [] : store.devices || [] }
    },

    // Emails a code (the Magic Link template must show {{ .Token }}). A code, not a link: a link
    // opens the browser, flashes it, then has to find its way back into the app.
    async signIn(email) {
      error = null
      if (FREE) {
        // No code while it is free: the email is kept for updates and the panel opens at once.
        store.email = String(email).trim()
        store.signupPending = true
        save()
        return sendSignup()
      }
      const { error: failed } = await supabase.auth.signInWithOtp({ email })
      if (failed) error = failed.message
      else store.sent = email
      save()
    },

    // The code from that email, typed into the panel.
    async verifyCode(code) {
      if (!store.sent) return
      const { data, error: failed } = await supabase.auth.verifyOtp({ email: store.sent, token: code, type: 'email' })
      if (failed) { error = 'That code didn\'t work. Check it, or send a new one.'; return save() }
      store.email = data.user.email
      delete store.sent
      error = null
      await refresh()
      save()
    },

    async removeDevice(deviceId) {
      await supabase.rpc('remove_device', { p_device_id: deviceId })
      await refresh()
    },

    async signOut() {
      if (!FREE) {
        await supabase.rpc('remove_device', { p_device_id: store.deviceId })
        await supabase.auth.signOut()
      }
      store = { deviceId: store.deviceId }
      others = null
      save()
      // An install that was signed in before the app went free still holds a session in memory; drop
      // it, or the signup insert would run as a user this table grants nothing to.
      if (FREE) supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    },

    // A checkout link for this account from the server; null until payments are switched on.
    async checkoutUrl() {
      const { data, error: failed } = await supabase.functions.invoke('create-checkout')
      return failed ? null : data?.url
    },
  }
}

module.exports = { createAccount }
