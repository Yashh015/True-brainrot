// Copies the two public Supabase values from .env into config.json, which the app reads and the
// installer ships. Only these two: anything else ever added to .env stays off users' PCs.
process.loadEnvFile()
const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey } = process.env
if (!url || !anonKey) throw new Error('Fill in SUPABASE_URL and SUPABASE_ANON_KEY in .env')
// The anon key is a JWT; refuse anything else, so the service_role key can never be shipped by mistake.
const role = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url')).role
if (role !== 'anon') throw new Error(`SUPABASE_ANON_KEY has role "${role}"; use the anon (public) key`)
require('fs').writeFileSync(require('path').join(__dirname, 'config.json'), JSON.stringify({ url, anonKey }, null, 2) + '\n')
