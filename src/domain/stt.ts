// Voice in through the gateway: record a clip with MediaRecorder, POST it to /v1/stt
// (Whisper on Workers AI), get the words back. Used where the browser's own recogniser is
// missing or unreliable: iPhone and iPad, where Safari's recogniser starts and hears nothing
// (Eyal, 11 and 29 Oct), Firefox, and anywhere it has failed once this visit.
// ponytail: silence is judged by loudness (RMS) on an AnalyserNode, not a real VAD; the
// gateway runs Whisper with its own VAD filter, so a little leading silence costs nothing.

import { loadKey } from './key'

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

/** True when a mic tap should record for the gateway rather than use the browser recogniser. */
export function serverEars(hasRecognition: boolean, nav: Nav = navigator): boolean {
  if (!recordingSupported()) return false
  return !hasRecognition || browserBroken || isAppleMobile(nav)
}

const gatewayUrl = () => (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? ''

/** The clip's words, trimmed ('' when Whisper heard nothing). Throws SttError. */
export async function transcribe(clip: Blob, signal?: AbortSignal): Promise<string> {
  const base = gatewayUrl()
  if (!base) throw new SttError('unavailable')
  const key = loadKey()
  let res: Response
  try {
    res = await fetch(`${base}/v1/stt`, {
      method: 'POST',
      headers: { 'content-type': clip.type || 'audio/webm', ...(key ? { 'x-council-key': key } : {}) },
      credentials: 'include',
      body: clip,
      signal,
    })
  } catch {
    throw new SttError('network')
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
// hears nothing — the pause would never be noticed. The mic's tap unlocks one shared context.
let shared: AudioContext | null = null
/** Call inside the tap that starts listening. */
export function unlockAudioInput(): void {
  try {
    const C = audioCtor()
    if (!C) return
    shared ??= new C()
    void shared.resume?.()
  } catch {
    // No Web Audio: a tap ends the recording.
  }
}

/** Louder than this (RMS of the waveform, 0..1) is speech; quieter is the room. */
export const SPEECH_RMS = 0.02

export interface Recording {
  /** Stop and hand back the clip, and whether anything louder than the room was heard. */
  stop(): Promise<{ clip: Blob; heard: boolean }>
  /** Stop and throw the clip away. */
  cancel(): void
}

/** iOS Safari records AAC in MP4; Chrome and Firefox Opus in WebM. Whisper takes either. */
function mimeType(): string | undefined {
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t)) return t
  }
  return undefined
}

/**
 * Open the mic and record. `onSilence` fires once, after speech followed by `silenceMs` of
 * quiet; `onIdle` when nothing louder than the room came for `idleMs`; `maxMs` is a hard stop
 * (it fires `onSilence`). The mic is released as soon as the recording stops, so a phone
 * plays the next answer through its speaker, not the earpiece.
 */
export async function record(opts: {
  silenceMs: number
  maxMs: number
  idleMs?: number
  onSilence?: () => void
  onIdle?: () => void
}): Promise<Recording> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (e) {
    const name = (e as { name?: string })?.name
    throw new SttError(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no_mic' : 'denied')
  }
  const type = mimeType()
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data)
  }
  recorder.start(250)

  // Loudness watch. Without Web Audio (or a suspended context) only a tap or maxMs ends it.
  let heard = false
  let lastLoud = Date.now()
  const began = Date.now()
  let fired = false
  let ctx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let tick: ReturnType<typeof setInterval> | undefined
  try {
    const C = audioCtor()
    ctx = shared ?? (C ? new C() : null)
    if (ctx) {
      void ctx.resume?.()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      tick = setInterval(() => {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        const now = Date.now()
        if (Math.sqrt(sum / buf.length) > SPEECH_RMS) {
          heard = true
          lastLoud = now
        }
        if (fired) return
        if (heard && now - lastLoud > opts.silenceMs) fire(opts.onSilence)
        else if (!heard && opts.idleMs && now - began > opts.idleMs) fire(opts.onIdle)
      }, 100)
    }
  } catch {
    // No loudness watch: the tap ends the recording.
  }
  const cap = setTimeout(() => fire(opts.onSilence), opts.maxMs)
  function fire(f?: () => void) {
    if (fired) return
    fired = true
    f?.()
  }

  const release = () => {
    clearInterval(tick)
    clearTimeout(cap)
    fired = true
    for (const t of stream.getTracks()) t.stop()
    source?.disconnect()
    if (ctx && ctx !== shared) void ctx.close?.().catch(() => {})
  }

  return {
    stop: () =>
      new Promise((resolve) => {
        const done = () => {
          release()
          resolve({ clip: new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }), heard })
        }
        if (recorder.state === 'inactive') return done()
        recorder.onstop = done
        recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
  }
}
