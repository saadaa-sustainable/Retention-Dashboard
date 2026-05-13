import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const PLACEHOLDER_PATTERN = /your-project|your-anon-key|your-service-role-key/i

function readEnv(name: string): string {
  const v = process.env[name]
  if (!v || PLACEHOLDER_PATTERN.test(v)) {
    throw new Error(
      `${name} is not configured. Set it in .env.local (or your hosting provider's env settings).`
    )
  }
  return v
}

// Browser client — created lazily so missing env at import-time doesn't crash
// the whole module. Only callers that actually use Supabase from the client
// will see the error.
let _browser: SupabaseClient | null = null
export function getBrowserClient(): SupabaseClient {
  if (_browser) return _browser
  _browser = createClient(
    readEnv('NEXT_PUBLIC_SUPABASE_URL'),
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  )
  return _browser
}

// Back-compat export — proxy that lazily forwards to the real client.
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_t, prop) => Reflect.get(getBrowserClient(), prop),
})

// Server-only admin client (bypasses RLS). Only import in API routes / server actions.
export function createAdminClient(): SupabaseClient {
  return createClient(
    readEnv('NEXT_PUBLIC_SUPABASE_URL'),
    readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
