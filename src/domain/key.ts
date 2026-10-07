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

export type KeyCheck = 'ok' | 'wrong' | 'gateway'

/**
 * Ask the gateway itself whether a typed password is right, before the app ever
 * opens on it. 204 (including the ungated case) is ok, 401 {reason:"password"} is
 * wrong, anything else (network failure, non-2xx) is a gateway problem, not a
 * password one — the caller shows the existing gateway-error copy for that.
 */
export async function checkKey(key: string, gatewayUrl: string): Promise<KeyCheck> {
  try {
    const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/v1/council/key`, {
      headers: { 'x-council-key': key },
    })
    if (res.status === 204) return 'ok'
    if (res.status === 401) return 'wrong'
    return 'gateway'
  } catch {
    return 'gateway'
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
