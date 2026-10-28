import { supabase } from './auth/supabase'
import { createFlywheelClient, type SupabaseLike } from './platform/flywheel-client'

/**
 * Usage tracking via the Flywheel Common Platform client (shared across every
 * flywheel app — flywheel repo docs/ARCHITECTURE "Common Platform"). First-party,
 * cookieless, fire-and-forget; no-ops when Supabase isn't configured.
 *
 * The aha moment is a proposal accepted into the journal (v3: a finished verdict) →
 * `conversion` (activation_event in the portfolio record; MastermindContext.activation.test).
 * Automated browsers (Playwright, crawlers) send nothing: flywheel-client drops them.
 */
const fw = createFlywheelClient({
  app: 'council',
  supabase: supabase as unknown as SupabaseLike | null,
})

export function track(event: string, props?: Record<string, unknown>): void {
  fw.track(event, props)
}

/**
 * The funnel steps past the first page view, sent as the taxonomy's `key_action` with an
 * `action` prop: the shared events table only accepts taxonomy names (src/analytics.contract.test.ts).
 * convened → (conversion: a decision accepted into the journal) → captured / committed;
 * replied and talk_on measure depth; blocked is a gate the person hit (sign_in, quota, cap…).
 */
export const KEY_ACTIONS = ['convened', 'replied', 'blocked', 'captured', 'committed', 'talk_on', 'tested', 'examined', 'daily_opened'] as const
export type KeyAction = (typeof KEY_ACTIONS)[number]

export function keyAction(action: KeyAction, props?: Record<string, unknown>): void {
  fw.track('key_action', { action, ...props })
}

export const identify = fw.identify
export const conversion = fw.conversion
export const logError = fw.logError
