// Sign-in by email link, the subscription status and this PC's place in the 2-device limit.
// Everything is kept in one file encrypted by Windows (safeStorage), so a copied file is useless.
const { safeStorage } = require('electron')
const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { canUse } = require('./access')

const LINK = 'truebrainrot://auth'

function createAccount({ url, anonKey, dir, onChange }) {
  const file = path.join(dir, 'account.bin')
  let store = {}
  try { store = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) } catch {} // none yet, or another Windows user's
  const write = () => fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(store)))
  const save = () => { write(); onChange() }
  if (!store.deviceId) { store.deviceId = crypto.randomUUID(); write() }

  // supabase-js keeps the session and the sign-in link's PKCE verifier through this.
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

  async function refresh() {
    if (!store.email) return
    const device = await supabase.rpc('register_device', { p_device_id: store.deviceId, p_name: os.hostname() })
    if (device.error?.message.includes('device_limit')) {
      const { data } = await supabase.from('devices').select('device_id, name, last_seen').order('last_seen')
      others = data || []
      return save()
    }
    if (device.error) return // offline or the server is down: keep the last answer (access.js allows 3 days)
    others = null
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

    // What the panel shows: the feed, or which gate screen and why.
    view() {
      if (others) return { ok: false, reason: 'device-limit', devices: others }
      return { ...canUse({ signedIn: Boolean(store.email), ...store.sub }, Date.now()), sent: store.sent, error }
    },

    async signIn(email) {
      error = null
      const { error: failed } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: LINK } })
      if (failed) error = failed.message
      else store.sent = email
      save()
    },

    // The email link, handed over by Windows: truebrainrot://auth?code=... (or ?error_description=...).
    async openLink(link) {
      if (!link?.startsWith(LINK)) return false
      const params = new URL(link).searchParams
      error = params.get('error_description')
      const code = params.get('code')
      if (code) {
        const { data, error: failed } = await supabase.auth.exchangeCodeForSession(code)
        // Opened on another PC than the one that asked: that PC holds the verifier, this one doesn't.
        if (failed) error = 'Open the link on the PC where you asked for it, or ask for a new one.'
        else { store.email = data.user.email; delete store.sent; error = null; await refresh() }
      }
      save()
      return true
    },

    async removeDevice(deviceId) {
      await supabase.rpc('remove_device', { p_device_id: deviceId })
      await refresh()
    },

    async signOut() {
      await supabase.rpc('remove_device', { p_device_id: store.deviceId })
      await supabase.auth.signOut()
      store = { deviceId: store.deviceId }
      others = null
      save()
    },

    // A checkout link for this account from the server; null until payments are switched on.
    async checkoutUrl() {
      const { data, error: failed } = await supabase.functions.invoke('create-checkout')
      return failed ? null : data?.url
    },
  }
}

module.exports = { createAccount, LINK }
