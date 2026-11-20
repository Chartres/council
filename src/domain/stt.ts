// Voice in through the gateway: POST a recorded part to /v1/stt (Whisper on Workers AI), get the
// words back. Used where the browser's own recogniser is missing or cannot be trusted: iPhone
// and iPad, where Safari's recogniser starts and hears nothing (Eyal, 11 and 29 Oct), Android,
// where it cannot share the mic with the level meter, Firefox, and anywhere it has failed once
// this visit. The recording itself is src/domain/capture.ts.

import { doorHeaders } from './key'

export type SttFailure = 'password' | 'quota' | 'cap' | 'too_large' | 'unavailable' | 'network' | 'denied' | 'no_mic'

export class SttError extends Error {
  constructor(readonly reason: SttFailure) {
    super(`stt: ${reason}`)
  }
}

type Nav = { userAgent: string; maxTouchPoints?: number; platform?: string }

/** iPhone, iPod, or an iPad (which reports itself as a Mac but has touch). */
export function isAppleMobile(nav: Nav = navigator): boolean {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1
}

export function recordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    !!MediaRecorder &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

// The browser recogniser failed this visit (network, service-not-allowed): the next tap records.
let browserBroken = false
export function markBrowserEngineBroken(): void {
  browserBroken = true
}
/** For tests. */
export function resetEars(): void {
  browserBroken = false
}

/** True when the words should come from the gateway rather than the browser recogniser. */
export function serverEars(hasRecognition: boolean, nav: Nav = navigator): boolean {
  if (!recordingSupported()) return false
  // Android's recogniser takes the mic for itself: the meter would read silence beside it.
  return !hasRecognition || browserBroken || isAppleMobile(nav) || /Android/.test(nav.userAgent)
}

const gatewayUrl = () => (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? ''

/** Longer than this and the mic stops waiting: a stalled request must not leave it stuck. */
export const STT_TIMEOUT_MS = 20_000

/** The clip's words, trimmed ('' when Whisper heard nothing). Throws SttError. */
export async function transcribe(clip: Blob): Promise<string> {
  const base = gatewayUrl()
  if (!base) throw new SttError('unavailable')
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), STT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${base}/v1/stt`, {
      method: 'POST',
      headers: { 'content-type': clip.type || 'audio/webm', ...doorHeaders() },
      credentials: 'include',
      body: clip,
      signal: abort.signal,
    })
  } catch {
    throw new SttError('network')
  } finally {
    clearTimeout(timer)
  }
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { text?: unknown }
    return typeof body.text === 'string' ? body.text.trim() : ''
  }
  const body = (await res.json().catch(() => ({}))) as { reason?: string }
  if (res.status === 401 && body.reason === 'password') throw new SttError('password')
  if (res.status === 429) throw new SttError('quota')
  if (res.status === 503 && body.reason === 'cap') throw new SttError('cap')
  if (res.status === 413) throw new SttError('too_large')
  throw new SttError('unavailable')
}

type Ctx = typeof AudioContext
const audioCtor = (): Ctx | undefined =>
  typeof window === 'undefined'
    ? undefined
    : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctx }).webkitAudioContext)

// iOS starts an AudioContext suspended unless a tap created or resumed it, and a suspended one
// hears nothing: the level meter would stay flat. And a phone suspends, interrupts or closes the
// context when the page goes to the background (Pavol, 20 Nov, Firefox on his phone: "I switch
// to another app … then switch back … it doesn't work anymore. I then have to refresh the page").
// So each tap gets a context that is running, or a new one made inside that tap.
let shared: AudioContext | null = null
/** Call inside the tap that starts listening. A context for the meter, or null without Web Audio. */
export function unlockAudioInput(): AudioContext | null {
  try {
    const C = audioCtor()
    if (!C) return null
    if (shared && shared.state !== 'running') {
      // Not trusted to come back: a new one made in this tap starts running.
      void shared.close?.().catch(() => {})
      shared = null
    }
    shared ??= new C()
    void shared.resume?.()?.catch?.(() => {})
    return shared
  } catch {
    return null // no meter; the recording itself does not need Web Audio
  }
}
/** For tests. */
export function resetAudioInput(): void {
  shared = null
}

/** Opus in WebM where the browser has it (smaller), else AAC in MP4 (older iOS Safari). */
export function mimeType(): string | undefined {
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t)) return t
  }
  return undefined
}
