import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

// Runtime-settable access token — AuthContext sets this after the Privy→Supabase bridge.
// We inject it into every PostgREST/Storage/Functions request via a custom fetch so that
// RLS sees auth.uid() correctly without relying on supabase.auth.setSession() (which
// requires a real refresh_token we don't have from the custom JWT flow).
let currentAccessToken: string | null = null

export const setSupabaseAuthToken = (token: string | null) => {
  currentAccessToken = token
}

export const getSupabaseAuthToken = () => currentAccessToken

const authedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers || {})
  if (currentAccessToken) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`)
  }
  // Always send the anon apikey (Supabase requires it even for authed requests)
  if (!headers.has('apikey')) {
    headers.set('apikey', supabaseKey)
  }
  return fetch(input, { ...init, headers })
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: authedFetch,
  },
})
