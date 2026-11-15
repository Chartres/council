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

// The signed-in user's Supabase token, kept current by AuthContext, for the callers that live
// outside React (tts, stt). The gateway lets a verified token through without the password.
let bearer: string | null = null
export function setBearer(token: string | null): void {
  bearer = token
}

/** What tts and stt send through the door: the stored password, and the bearer when signed in. */
export function doorHeaders(): Record<string, string> {
  const key = loadKey()
  return { ...(key ? { 'x-council-key': key } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }
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

/** 'wait': the sign-in is still loading and no key is stored; neither door nor screen yet. */
export type GateState = 'ask' | 'ready' | 'wait'

/**
 * Ask on the first visit (nothing stored, not signed in) and whenever the gateway rejected
 * the key or the sign-in we had. Every other failure belongs to the session screen, not to the gate.
 */
export function gateState(key: string | null, failure: FailureReason | null, signedIn = false, loading = false): GateState {
  if (failure === 'password') return 'ask'
  if (key || signedIn) return 'ready'
  return loading ? 'wait' : 'ask'
}
