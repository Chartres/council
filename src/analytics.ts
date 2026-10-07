import { supabase } from './auth/supabase'
import { createFlywheelClient, type SupabaseLike } from './platform/flywheel-client'

/**
 * Usage tracking via the Flywheel Common Platform client (shared across every
 * flywheel app — flywheel repo docs/ARCHITECTURE "Common Platform"). First-party,
 * cookieless, fire-and-forget; no-ops when Supabase isn't configured.
 *
 * The aha moment is a finished verdict → `conversion` (activation_event in the
 * portfolio record).
 */
const fw = createFlywheelClient({
  app: 'council',
  supabase: supabase as unknown as SupabaseLike | null,
})

export function track(event: string, props?: Record<string, unknown>): void {
  fw.track(event, props)
}

export const identify = fw.identify
export const conversion = fw.conversion
export const logError = fw.logError
