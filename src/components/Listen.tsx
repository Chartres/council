import { useEffect, useRef, useState } from 'react'
import type { Turn, Verdict } from '@/domain/council'
import { personaVoice, pickVoice, primeVoices, synthesisAvailable } from '@/domain/speech'

export const LISTEN_STORAGE = 'council:listen'

primeVoices()

/** The toggle, remembered between sessions. */
export function useListen(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(LISTEN_STORAGE) === '1'
    } catch {
      return false
    }
  })
  return [
    on,
    (next: boolean) => {
      setOn(next)
      try {
        localStorage.setItem(LISTEN_STORAGE, next ? '1' : '0')
      } catch {
        // Nothing to remember in private mode; the toggle still works this visit.
      }
    },
  ]
}

export function cancel() {
  if (synthesisAvailable()) window.speechSynthesis.cancel()
}

export const FACILITATOR_VOICE = { pitch: 1, rate: 0.95 }

export function speak(text: string, voice: { pitch: number; rate: number }, onEnd?: () => void) {
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
 * (speechSynthesis plays the queue in order, so queueing in order is enough).
 * Turning the toggle on mid-debate starts from the next turn, not the first.
 */
export function useNarration(turns: Turn[], verdict: Verdict | null, on: boolean) {
  const spoken = useRef(0)
  const saidVerdict = useRef(false)
  const wasOn = useRef(false)

  useEffect(() => {
    if (!on || !synthesisAvailable()) {
      cancel()
      wasOn.current = false
      return
    }
    if (!wasOn.current) {
      wasOn.current = true
      spoken.current = turns.length
      saidVerdict.current = Boolean(verdict)
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

export function ListenToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  if (!synthesisAvailable()) return null
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      data-testid="listen"
      className={`flex min-h-11 items-center gap-2 px-3 text-[15px] font-semibold ${
        on ? 'text-marble-50' : 'text-marble-400 hover:text-marble-100'
      }`}
    >
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
