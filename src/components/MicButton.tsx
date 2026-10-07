import { useEffect, useRef, useState } from 'react'
import { recognitionCtor, transcriptOf, type Recognition } from '@/domain/speech'

/**
 * Dictation for a textarea. Press to start, press again to stop; the browser also
 * stops itself after a pause. Interim words stream into the field as they are heard.
 * Absent entirely where the Web Speech API is not there (most desktop Firefox).
 */
export function MicButton({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) {
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  // What was already typed when dictation started — interim results replace only
  // the dictated tail, never the sentence she wrote by hand.
  const base = useRef('')
  const Ctor = recognitionCtor()

  useEffect(() => () => rec.current?.abort(), [])

  if (!Ctor) return null

  const stop = () => {
    rec.current?.stop()
    setListening(false)
  }

  const start = () => {
    const r = new Ctor()
    r.continuous = false
    r.interimResults = true
    r.onresult = (event) => {
      const heard = transcriptOf(event)
      onChange(base.current ? `${base.current.trimEnd()} ${heard}` : heard)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    base.current = value
    rec.current = r
    r.start()
    setListening(true)
  }

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      aria-pressed={listening}
      aria-label={listening ? `Stop dictating ${label}` : `Dictate ${label}`}
      data-testid="mic"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-card border ${
        listening
          ? 'lit border-candle-500 text-candle-200'
          : 'border-ink-700 text-marble-400 hover:text-candle-300'
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
