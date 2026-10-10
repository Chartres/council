import { useEffect, useRef, useState } from 'react'
import { recognitionCtor, transcriptOf, type Recognition } from '@/domain/speech'

/** A pause this long after the last heard word ends the answer. The browser's own
 *  endpoint (non-continuous mode) fires on the first breath, which is what made the
 *  facilitator ask the next question before anyone had finished the first. */
export const SILENCE_MS = 2500
// ponytail: Chrome gives up on its own after ~8 s of silence; we listen again a few times
// before treating that as "nothing to say".
const RESTARTS = 3

/**
 * Dictation for a textarea. Press to start, press again to stop; otherwise it stops by
 * itself after a real pause. Interim words stream into the field as they are heard.
 * Absent entirely where the Web Speech API is not there (most desktop Firefox).
 */
export function MicButton({
  value,
  onChange,
  label,
  autoStart = false,
  onDone,
}: {
  value: string
  onChange: (next: string) => void
  label: string
  /** Start listening on mount (the intake's "Talk it through"). */
  autoStart?: boolean
  /** Called when listening ends, with what it heard ('' for nothing). */
  onDone?: (heard: string) => void
}) {
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  // What was already typed when dictation started — interim results replace only
  // the dictated tail, never the sentence she wrote by hand.
  const base = useRef('')
  const Ctor = recognitionCtor()

  const heardRef = useRef('')
  const restarts = useRef(0)
  // Set by the user's stop or by unmount; an engine ending on its own is not "stopped".
  const stopped = useRef(false)

  const stop = () => {
    stopped.current = true
    rec.current?.stop()
    setListening(false)
  }

  const start = () => {
    if (!Ctor) return
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    let silence: ReturnType<typeof setTimeout> | undefined
    r.onresult = (event) => {
      const heard = transcriptOf(event)
      heardRef.current = heard
      onChange(base.current ? `${base.current.trimEnd()} ${heard}` : heard)
      clearTimeout(silence)
      silence = setTimeout(() => r.stop(), SILENCE_MS)
    }
    r.onend = () => {
      clearTimeout(silence)
      if (rec.current !== r) return
      if (!stopped.current && !heardRef.current && restarts.current < RESTARTS) {
        restarts.current += 1
        start()
        return
      }
      setListening(false)
      onDone?.(heardRef.current)
    }
    r.onerror = () => setListening(false)
    heardRef.current = ''
    base.current = value
    stopped.current = false
    rec.current = r
    r.start()
    setListening(true)
  }

  useEffect(() => {
    if (autoStart) start()
    return () => {
      stopped.current = true
      rec.current?.abort()
      rec.current = null
    }
    // Mount only: the parent keys it per field.
  }, [])

  if (!Ctor) return null

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      aria-pressed={listening}
      aria-label={listening ? `Stop dictating ${label}` : `Dictate ${label}`}
      data-testid="mic"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
        listening ? 'bg-candle-400 text-ink-950' : 'text-marble-300 hover:text-marble-50'
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
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
      </svg>
    </button>
  )
}
