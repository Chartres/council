// The private-beta password. Not a secret the client can keep — the gateway is the
// only thing that decides whether a key is good. This just remembers what was typed
// and decides whether to ask for it.
// ponytail: plain localStorage, no hashing. A shared beta password is not an identity.

import type { FailureReason } from './council'

export const KEY_STORAGE = 'council:key'

export function loadKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE) || null
  } catch {
    return null
  }
}

export function saveKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key)
  } catch {
    // Private mode: the key lives for this page only, which still works.
  }
}

export type GateState = 'ask' | 'ready'

/**
 * Ask on the first visit (nothing stored) and whenever the gateway rejected the key
 * we had. Every other failure belongs to the session screen, not to the gate.
 */
export function gateState(key: string | null, failure: FailureReason | null): GateState {
  if (failure === 'password') return 'ask'
  return key ? 'ready' : 'ask'
}
