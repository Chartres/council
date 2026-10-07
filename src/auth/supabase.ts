import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * The first council session works with no account at all, so auth is env-gated:
 * sign-in and "My ideas" persistence light up only when both vars are present at
 * build time. Tests and local dev run without them.
 */
export const isAuthConfigured = Boolean(url && publishableKey)

export const supabase: SupabaseClient | null = isAuthConfigured
  ? createClient(url!, publishableKey!, {
      auth: { persistSession: true, detectSessionInUrl: true },
    })
  : null
