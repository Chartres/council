// Voice out through the gateway: an adviser's Aura-2 voice when a speaker is named, the facilitator's Aura-2 voice otherwise (MeloTTS until it was retired, 20 Nov),
// on Workers AI (free inside the daily allowance),
// one MP3 per utterance, played in order on one shared element. Where the gateway cannot speak — no key, offline,
// the stub in e2e — the browser's own engine takes the utterance instead, so nothing is
// ever silent that used to speak. Except on iPhone and iPad: the browser voice there is the
// robotic one (Eyal, 30 Oct), so a missed line stays as text and the caller offers it again.
// ponytail: fetches are started at enqueue time so the next line is ready when this one
// ends; no cache, no pre-splitting of long paragraphs.

import { doorHeaders } from './key'
import { isAppleMobile } from './stt'

export type Voice = { pitch: number; rate: number }
export type Fallback = (text: string, voice: Voice, onEnd?: () => void) => void

// Read per call, not at import: tests swap it, and the app's env is static anyway.
const gatewayUrl = () => (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? ''

type Item = {
  text: string
  voice: Voice
  onEnd?: () => void
  onStart?: (via: 'gateway' | 'browser') => void
  onMiss?: () => void
  speaker?: string
  /** The message this line belongs to: one message is read in one voice. */
  group?: string
  audio: Promise<Blob | null>
  abort: AbortController
  /** Aborted when the line is due and still not here after TTS_TIMEOUT_MS. */
  late: AbortController
}

// The voice the latest message began in. Messages are read one after another, so the latest is
// enough: a line of it goes the same way (Pavol, 20 Nov: one sentence in the phone's own voice
// between two of Franklin's).
let began: { group: string; via: 'gateway' | 'browser' } | null = null
const beganIn = (item: Item) => (item.group && began?.group === item.group ? began.via : null)
const begin = (item: Item, via: 'gateway' | 'browser') => {
  if (item.group && !beganIn(item)) began = { group: item.group, via }
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

/** How long one line may take to arrive (headers and audio), counted from when it is due to
 *  play, before it is given up. A hung gateway used to hold this line and every line behind it
 *  silent. Counted from the request instead (before 21 Nov), a message's later lines, all
 *  requested at once and slower together, were cut while the first still played: one sentence
 *  read, then "voice did not load" (Pavol, 20 Nov; found again by the walkthrough). */
export const TTS_TIMEOUT_MS = 6_000

/** `due` given: the clock is the caller's (the line is fetched ahead and timed once due).
 *  Without it the fetch is due now and times itself. */
async function fetchAudio(text: string, speaker: string | undefined, signal: AbortSignal, due?: AbortSignal): Promise<Blob | null> {
  const base = gatewayUrl()
  if (!base) return null
  // Our own controller: cancel() aborts it through `signal`, the clock aborts it on timeout.
  // Either way this returns null; next() tells them apart by `signal.aborted`.
  const ctl = new AbortController()
  const stop = () => ctl.abort()
  signal.addEventListener('abort', stop)
  due?.addEventListener('abort', stop)
  const timer = due ? undefined : setTimeout(stop, TTS_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...doorHeaders(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      // The anonymous session is a signed httpOnly cookie set by the Worker.
      credentials: 'include',
      // Without a session the speaker cannot be honoured: plain text gets the default voice.
      body: JSON.stringify(speaker && session ? { text, speaker, session_id: session } : { text }),
      signal: ctl.signal,
    })
    if (!res.ok || !res.headers.get('content-type')?.startsWith('audio/')) return null
    return await res.blob()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', stop)
    due?.removeEventListener('abort', stop)
  }
}

/** `speaker` (an adviser id or `facilitator`) picks that adviser's gateway voice; without it
 *  the gateway uses its one default voice. `voice` is the browser fallback's pitch and rate. */
/** `onStart` fires when the line begins: in the gateway's voice once it is playing, or as it is
 *  handed to the browser voice (Talk times the wait to the first word with it). `onMiss` fires,
 *  just before `onEnd`, when an iPhone or iPad leaves the line unspoken (see `miss`). */
export function speak(
  text: string,
  voice: Voice,
  onEnd?: () => void,
  speaker?: string,
  onStart?: (via: 'gateway' | 'browser') => void,
  onMiss?: () => void,
  group?: string,
): void {
  const abort = new AbortController()
  const late = new AbortController()
  queue.push({ text, voice, onEnd, onStart, onMiss, speaker, group, abort, late, audio: fetchAudio(text, speaker, abort.signal, late.signal) })
  if (!busy) void next()
}

// 10 ms of silence: what the unlocking tap plays.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

// One element for every line: iOS lets an element play on its own only after a tap has
// played it, so the tap unlocks this one and each line swaps its src.
let player: HTMLAudioElement | null = null
const element = () => (player ??= new Audio())
// A line is on the element: a later tap's unlock must not swap it out (it is unlocked already).
let playing = false

/** Call inside a tap: plays the silent clip on the shared element so later lines may play,
 *  and speaks one silent line on the browser engine, which iOS also lets speak on its own
 *  only after a tap used it — without this, the fallback for a failed line is silent there. */
export function unlock(): void {
  try {
    // A line playing means the element is unlocked already; swapping its src would cut the line.
    if (!playing) {
      const a = element()
      a.src = SILENT_WAV
      void a.play().catch(() => {})
    }
  } catch {
    // No audio element: the browser engine still speaks.
  }
  try {
    if (typeof speechSynthesis === 'undefined' || !speechSynthesis) return
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    speechSynthesis.speak(u)
  } catch {
    // No browser engine: nothing to prime.
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
  const deadline = setTimeout(() => item.late.abort(), TTS_TIMEOUT_MS)
  let blob = await item.audio
  clearTimeout(deadline)
  // Cancelled while downloading: cancel() already reset the queue; a later speak() runs its own loop.
  if (item.abort.signal.aborted) return
  // The message began in the browser voice: it ends in it.
  if (beganIn(item) === 'browser') return viaFallback(item)
  // Mid-message in the adviser's voice: once more before giving up on this line, unless it
  // already had its seconds once due (a second try would double the silence; review of #43).
  if (!blob && beganIn(item) === 'gateway' && !item.late.signal.aborted) {
    blob = await fetchAudio(item.text, item.speaker, item.abort.signal)
    if (item.abort.signal.aborted) return
  }
  if (!blob) return miss(item)
  const url = URL.createObjectURL(blob)
  const audio = element()
  playing = true
  audio.src = url
  audio.defaultPlaybackRate = audio.playbackRate = item.voice.rate
  // onerror and a refused play() can both fire for one line: it ends once.
  let settled = false
  const settle = () => {
    if (settled) return false
    settled = true
    playing = false
    return true
  }
  const done = () => {
    if (!settle()) return
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
    begin(item, 'gateway')
    if (!item.abort.signal.aborted) item.onStart?.('gateway')
  } catch {
    // A cancelled line stays silent; otherwise autoplay was refused: let the browser engine try.
    if (!settle()) return
    URL.revokeObjectURL(url)
    if (item.abort.signal.aborted) return
    audio.onended = audio.onerror = null
    miss(item)
  }
}

/** The gateway could not speak this line. iPhone/iPad with `onMiss`: it stays as text and the queue moves on
 *  (onEnd keeps Talk's hands-free loop going); elsewhere the browser voice reads it. */
function miss(item: Item): void {
  // Only a caller that can offer the line again (Talk's Tap to hear) gives up the browser voice:
  // on iPhone and iPad always, elsewhere in a message the adviser's voice began.
  if (!item.onMiss || (!isAppleMobile() && beganIn(item) !== 'gateway')) return viaFallback(item)
  item.onMiss()
  // The owner stopped the room at the missed line (Talk holds it there): the queue stays put.
  if (item.abort.signal.aborted) return
  item.onEnd?.()
  void next()
}

/** The browser engine speaks this line; the queue moves on when it says it ended, so the next
 *  gateway line never plays over it. iOS sometimes never fires `onend`, so a cap sized to the
 *  line (about 70 ms a character at rate 1, a normal speaking pace; at least 3 s) moves it on regardless. */
function viaFallback(item: Item): void {
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(guard)
    // Cancelled while the browser spoke: cancel() reset the queue; stay quiet.
    if (item.abort.signal.aborted) return
    item.onEnd?.()
    void next()
  }
  const guard = setTimeout(finish, Math.max(3_000, (item.text.length * 70) / (item.voice.rate || 1)))
  begin(item, 'browser')
  item.onStart?.('browser')
  fallback(item.text, item.voice, finish)
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
  playing = false
  busy = false
}
