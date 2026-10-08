// The admin-only free/premium switch. Persisted so a reload keeps the tester's
// choice; never read or written for a non-admin session.
import type { Tier } from './council'

export const TIER_STORAGE = 'council:tier'

export function loadTier(): Tier {
  try {
    return localStorage.getItem(TIER_STORAGE) === 'premium' ? 'premium' : 'free'
  } catch {
    return 'free'
  }
}

export function saveTier(tier: Tier): void {
  try {
    localStorage.setItem(TIER_STORAGE, tier)
  } catch {
    // Private mode: the choice lives for this page only, which still works.
  }
}
