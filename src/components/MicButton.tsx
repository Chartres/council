import { useRef, type ReactNode } from 'react'
import { addWords, CapturePanel, micAvailable, MicIcon, useCapture } from '@/components/Capture'

/**
 * Voice for a field: "Tap and talk", then "Finish". While it records, the thread and the candle
 * show that sound is coming in and one sentence says what the mic is doing; the words are added
 * to the field as they are written down, after whatever is already there. It stops when he taps
 * Finish, not when he pauses. Absent only where there is no mic path at all.
 */
export function MicButton({
  value,
  onChange,
  label,
  primary = false,
  className = '',
  children,
}: {
  value: string
  onChange: (next: string) => void
  /** What is being dictated ("your idea"), for assistive tech. */
  label: string
  /** The screen's one action right now (an empty field): filled. Otherwise an outline. */
  primary?: boolean
  className?: string
  /** Sits beside the button (the composer's send). */
  children?: ReactNode
}) {
  const cap = useCapture()
  // Pieces can land between renders, and he may have typed since: always add to the latest.
  const latest = useRef(value)
  latest.current = value
  const add = (piece: string) => {
    latest.current = addWords(latest.current, piece)
    onChange(latest.current)
  }

  if (!micAvailable()) return null
  const { phase } = cap
  return (
    <div className={className}>
      <CapturePanel cap={cap} className="mb-2" />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => (phase === 'idle' ? cap.start(add) : cap.recording ? void cap.finish() : undefined)}
          disabled={phase === 'writing'}
          aria-pressed={cap.recording}
          aria-label={phase === 'idle' ? `Tap and talk: ${label}` : phase === 'writing' ? 'Writing it down' : `Finish ${label}`}
          data-testid="mic"
          className={`slab min-w-0 flex-1 gap-2 ${cap.recording || (primary && phase === 'idle') ? '' : 'slab-off'}`}
        >
          <MicIcon />
          {phase === 'idle' ? 'Tap and talk' : phase === 'writing' ? 'Writing it down…' : 'Finish'}
        </button>
        {children}
      </div>
    </div>
  )
}
