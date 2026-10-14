// Voice out through the gateway: an adviser's Aura-1 voice when a speaker is named, MeloTTS otherwise,
// on Workers AI (free inside the daily allowance),
// one MP3 per utterance, played in order on one shared element. Where the gateway cannot speak — no key, offline,
// the stub in e2e — the browser's own engine takes the utterance instead, so nothing is
// ever silent that used to speak.
// ponytail: fetches are started at enqueue time so the next line is ready when this one
// ends; no cache, no pre-splitting of long paragraphs.

import { loadKey } from './key'

export type Voice = { pitch: number; rate: number }
export type Fallback = (text: string, voice: Voice, onEnd?: () => void) => void

// Read per call, not at import: tests swap it, and the app's env is static anyway.
const gatewayUrl = () => (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? ''

type Item = {
  text: string
  voice: Voice
  onEnd?: () => void
  audio: Promise<Blob | null>
  abort: AbortController
}

const queue: Item[] = []
let current: Item | null = null // the line downloading or playing
let busy = false
let fallback: Fallback = () => {}
// The gateway serves an adviser's voice only inside a session the caller owns.
let session: string | null = null
let token: string | null = null

/** The conversation's session id while one is on screen (and the signed-in user's token,
 *  which is how the gateway knows the session is theirs); null when it is left. */
export function setSession(id: string | null, bearer: string | null = null): void {
  session = id
  token = bearer
}

/** The browser engine to use when the gateway cannot speak this line. */
export function setFallback(f: Fallback): void {
  fallback = f
}

async function fetchAudio(text: string, speaker: string | undefined, signal: AbortSignal): Promise<Blob | null> {
  const base = gatewayUrl()
  if (!base) return null
  const key = loadKey()
  try {
    const res = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { 'x-council-key': key } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      // The anonymous session is a signed httpOnly cookie set by the Worker.
      credentials: 'include',
      // Without a session the speaker cannot be honoured: plain text gets the default voice.
      body: JSON.stringify(speaker && session ? { text, speaker, session_id: session } : { text }),
      signal,
    })
    if (!res.ok || !res.headers.get('content-type')?.startsWith('audio/')) return null
    return await res.blob()
  } catch {
    return null
  }
}

/** `speaker` (an adviser id or `facilitator`) picks that adviser's gateway voice; without it
 *  the gateway uses its one default voice. `voice` is the browser fallback's pitch and rate. */
export function speak(text: string, voice: Voice, onEnd?: () => void, speaker?: string): void {
  const abort = new AbortController()
  queue.push({ text, voice, onEnd, abort, audio: fetchAudio(text, speaker, abort.signal) })
  if (!busy) void next()
}

// 10 ms of silence: what the unlocking tap plays.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

// One element for every line: iOS lets an element play on its own only after a tap has
// played it, so the tap unlocks this one and each line swaps its src.
let player: HTMLAudioElement | null = null
const element = () => (player ??= new Audio())

/** Call inside a tap: plays the silent clip on the shared element so later lines may play. */
export function unlock(): void {
  try {
    const a = element()
    a.src = SILENT_WAV
    void a.play().catch(() => {})
  } catch {
    // No audio element: the browser engine still speaks.
  }
}

async function next(): Promise<void> {
  const item = queue.shift() ?? null
  current = item
  if (!item) {
    busy = false
    return
  }
  busy = true
  const blob = await item.audio
  // Cancelled while downloading: cancel() already reset the queue; a later speak() runs its own loop.
  if (item.abort.signal.aborted) return
  if (!blob) {
    fallback(item.text, item.voice, item.onEnd)
    return void next()
  }
  const url = URL.createObjectURL(blob)
  const audio = element()
  audio.src = url
  audio.defaultPlaybackRate = audio.playbackRate = item.voice.rate
  const done = () => {
    audio.onended = audio.onerror = null
    URL.revokeObjectURL(url)
    if (item.abort.signal.aborted) return
    item.onEnd?.()
    void next()
  }
  audio.onended = done
  audio.onerror = done
  try {
    await audio.play()
  } catch {
    URL.revokeObjectURL(url)
    // A cancelled line stays silent; otherwise autoplay was refused: let the browser engine try.
    if (item.abort.signal.aborted) return
    audio.onended = audio.onerror = null
    fallback(item.text, item.voice, item.onEnd)
    void next()
  }
}

/** Stop what is playing and forget what was queued, including the line still downloading. */
export function cancel(): void {
  for (const item of queue.splice(0)) item.abort.abort()
  current?.abort.abort()
  current = null
  if (player) {
    player.onended = player.onerror = null
    player.pause()
  }
  busy = false
}
