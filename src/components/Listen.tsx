import { useEffect, useRef, useState } from 'react'
import type { Turn, Verdict } from '@/domain/council'
import { personaVoice, pickVoice, primeVoices, synthesisAvailable } from '@/domain/speech'
import * as tts from '@/domain/tts'

export const LISTEN_STORAGE = 'council:listen'

primeVoices()

/** A switch remembered on this device ('1' / '0'); `fallback` until it was ever set. */
export function usePref(key: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? fallback : v === '1'
    } catch {
      return fallback
    }
  })
  return [
    on,
    (next: boolean) => {
      setOn(next)
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {
        // Nothing to remember in private mode; the toggle still works this visit.
      }
    },
  ]
}

/** Read-aloud: on unless she turned it off on this device. */
export const useListen = () => usePref(LISTEN_STORAGE, true)

export function cancel() {
  tts.cancel()
  if (synthesisAvailable()) window.speechSynthesis.cancel()
}

export const FACILITATOR_VOICE = { pitch: 1, rate: 0.95 }

/** Voice out: the gateway's MeloTTS first (src/domain/tts.ts), the browser engine where
 *  the gateway cannot speak. */
export const speak = tts.speak
tts.setFallback(speakInBrowser)

export function speakInBrowser(text: string, voice: { pitch: number; rate: number }, onEnd?: () => void) {
  // A speech engine that refuses an utterance must not take the debate down with it.
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.pitch = voice.pitch
    u.rate = voice.rate
    if (onEnd) u.onend = onEnd
    const english = pickVoice(window.speechSynthesis.getVoices())
    if (english) u.voice = english
    window.speechSynthesis.speak(u)
  } catch {
    // Silent: the transcript on screen is the source of truth.
    onEnd?.()
  }
}

/**
 * Reads the debate aloud as it arrives — one voice per persona, the verdict last
 * (the tts queue plays in order, so queueing in order is enough).
 * Switching on reads from `from` (the turn on screen; default the last one), then what follows.
 */
export function useNarration(turns: Turn[], verdict: Verdict | null, on: boolean, from = turns.length - 1) {
  const spoken = useRef(0)
  const saidVerdict = useRef(false)
  const wasOn = useRef(false)

  useEffect(() => {
    if (!on || !synthesisAvailable()) {
      // Only on the way off: while off, Talk mode owns the speaker and must not be cut each turn.
      if (wasOn.current) cancel()
      wasOn.current = false
      return
    }
    if (!wasOn.current) {
      wasOn.current = true
      spoken.current = Math.max(0, Math.min(from, turns.length))
      saidVerdict.current = false
    }
    for (let i = spoken.current; i < turns.length; i++) {
      speak(turns[i].text, personaVoice(turns[i].persona))
    }
    spoken.current = turns.length
    if (verdict && !saidVerdict.current) {
      saidVerdict.current = true
      speak(`The verdict. ${verdict.summary} Next action. ${verdict.next_action}`, FACILITATOR_VOICE)
    }
  }, [on, turns, verdict])

  // Leaving the session screen stops the room talking.
  useEffect(() => cancel, [])
}

export function ListenToggle({ on, onChange, chip = false }: { on: boolean; onChange: (on: boolean) => void; chip?: boolean }) {
  if (!synthesisAvailable()) return null
  const look = chip
    ? `chip min-h-11 gap-2 font-semibold ${on ? 'bg-ink-800 text-marble-50' : 'text-marble-400'}`
    : `flex min-h-11 items-center gap-2 px-3 text-[15px] font-semibold ${on ? 'text-marble-50' : 'text-marble-400 hover:text-marble-100'}`
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} data-testid="listen" className={look}>
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M4 10v4h3l5 4V6l-5 4H4z" strokeLinejoin="round" />
        {on && <path d="M16.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />}
      </svg>
      Listen
    </button>
  )
}
