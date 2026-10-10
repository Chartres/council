// Voice out through the gateway: MeloTTS on Workers AI (free inside the daily allowance),
// one MP3 per utterance, played in order. Where the gateway cannot speak — no key, offline,
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
let playing: HTMLAudioElement | null = null
let busy = false
let fallback: Fallback = () => {}

/** The browser engine to use when the gateway cannot speak this line. */
export function setFallback(f: Fallback): void {
  fallback = f
}

async function fetchAudio(text: string, signal: AbortSignal): Promise<Blob | null> {
  const base = gatewayUrl()
  if (!base) return null
  const key = loadKey()
  try {
    const res = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-council-key': key } : {}) },
      body: JSON.stringify({ text }),
      signal,
    })
    if (!res.ok || !res.headers.get('content-type')?.startsWith('audio/')) return null
    return await res.blob()
  } catch {
    return null
  }
}

export function speak(text: string, voice: Voice, onEnd?: () => void): void {
  const abort = new AbortController()
  queue.push({ text, voice, onEnd, abort, audio: fetchAudio(text, abort.signal) })
  if (!busy) void next()
}

async function next(): Promise<void> {
  const item = queue.shift()
  if (!item) {
    busy = false
    return
  }
  busy = true
  const blob = await item.audio
  if (item.abort.signal.aborted) return void next()
  if (!blob) {
    fallback(item.text, item.voice, item.onEnd)
    return void next()
  }
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.playbackRate = item.voice.rate
  playing = audio
  const done = () => {
    if (playing === audio) playing = null
    URL.revokeObjectURL(url)
    item.onEnd?.()
    void next()
  }
  audio.onended = done
  audio.onerror = done
  try {
    await audio.play()
  } catch {
    // Autoplay refused (no gesture yet): let the browser engine try, then move on.
    playing = null
    URL.revokeObjectURL(url)
    fallback(item.text, item.voice, item.onEnd)
    void next()
  }
}

/** Stop what is playing and forget what was queued. */
export function cancel(): void {
  for (const item of queue.splice(0)) item.abort.abort()
  if (playing) {
    playing.onended = null
    playing.onerror = null
    playing.pause()
    playing = null
  }
  busy = false
}
