import { useEffect, useRef, useState } from 'react'
import { keyAction } from '@/analytics'
import { Candle, type CandleHandle } from '@/components/Candle'
import { openCapture, SPEECH_RMS, type Capture } from '@/domain/capture'
import { recognitionCtor } from '@/domain/speech'
import { recordingSupported, SttError } from '@/domain/stt'

// What every recording surface shows (Pavol, 20 Nov 2026): the thread, a thin line that moves
// with the real input level; the candle, whose flame flickers and leans a little with the
// voice; and one sentence that says what the mic is doing. A recording ends on his tap.

/** A mic exists here: the browser recogniser, or a recorder for the gateway. */
export const micAvailable = () => !!recognitionCtor() || recordingSupported()

/** A flat input (no signal at all, not a quiet room) for this long: say so. Also how long a
 *  pause is before the sentence turns to "Take your time". */
export const DEAF_MS = 3000
/** Reasons the gateway will keep giving: the recording stops and says why. */
const FINAL = ['quota', 'password', 'cap']

const KEYBOARD = 'Use the mic on your keyboard, or type.'
/** What to tell him, by failure. */
export function micProblem(reason: string): string {
  switch (reason) {
    case 'not-allowed':
    case 'denied':
      return 'The microphone is blocked for this site. Allow it in the address bar or in your settings, then tap again.'
    case 'audio-capture':
    case 'no_mic':
      return `No microphone found on this device. ${KEYBOARD}`
    case 'quota':
      return `Voice input has reached today’s limit. What is written so far is kept. ${KEYBOARD}`
    case 'password':
      return 'The beta password changed. Reload the page and enter the new one.'
    case 'nothing':
      return 'I heard sound but no words. Tap and talk again, a little closer.'
    case 'left':
      return 'The microphone stopped when you left the page. Tap to carry on.'
    case 'lost':
      return 'The microphone stopped. Tap to carry on.'
    case 'part':
    case 'too_large':
      return 'Part of what you said could not be written down. The rest is kept. Say that part again, or type it.'
    default:
      return `Voice input isn’t available right now. ${KEYBOARD}`
  }
}

export type Tone = 'plain' | 'bad'
/** The one sentence under the thread, by state. */
export function captureStatus(s: {
  state: 'asking' | 'live'
  /** The browser's audio is running, so the level can be read. */
  running: boolean
  heard: boolean
  /** How long the input has been digitally flat: a dead or muted input, not a quiet room. */
  flatMs: number
  /** Since the last sound above the room. */
  quietMs: number
  label: string
}): { tone: Tone; text: string; deaf?: boolean } {
  if (s.state === 'asking') return { tone: 'plain', text: 'Waiting for the microphone. Nothing is recorded yet.' }
  if (!s.running) return { tone: 'bad', text: 'The browser has paused audio, so the line cannot move. Tap anywhere to wake it.' }
  // Only a flat input is a fault. A quiet room while he thinks is not (Pavol: "thoughtful with my responses").
  if (s.flatMs > DEAF_MS) return { tone: 'bad', text: `I can’t hear anything from “${s.label}”. Check the input, or speak up.`, deaf: true }
  if (!s.heard) return { tone: 'plain', text: 'Recording. Say something when you are ready.' }
  if (s.quietMs > DEAF_MS) return { tone: 'plain', text: 'Recording. Take your time.' }
  return { tone: 'plain', text: 'Recording. I can hear you.' }
}

/** Join a dictated piece to what is in the field: it is added, nothing is replaced. */
export const addWords = (before: string, piece: string) => (before.trim() ? `${before.trimEnd()} ${piece}` : piece)

export function useCapture(opts: { talk?: boolean; onFail?: (reason: string) => void } = {}) {
  const [state, setState] = useState<'idle' | 'asking' | 'live'>('idle')
  const [pending, setPending] = useState(0)
  const [interim, setInterim] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  // The mic was taken away mid-recording; the next tap carries on where it stopped.
  const [lost, setLost] = useState(false)
  const [meter, setMeter] = useState<Capture | null>(null)
  const [status, setStatus] = useState<ReturnType<typeof captureStatus> | null>(null)
  const cap = useRef<Capture | null>(null)
  const busy = useRef(false) // asking or live: a second tap must not open a second mic
  const gen = useRef(0)
  const run = useRef({ got: 0 }) // pieces that landed from the open recording
  const mounted = useRef(true)
  const live = useRef(opts)
  live.current = opts
  const extra = opts.talk ? { talk: true } : {}

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      gen.current += 1
      // The screen goes away mid-recording (he turned Talk on, or left): the mic closes, and what
      // was said is still written down for whoever holds the text.
      void cap.current?.finish()
      cap.current = null
    }
  }, [])

  // The sentence follows the mic: asked four times a second while it is open.
  useEffect(() => {
    if (state === 'asking') return setStatus(captureStatus({ state, running: true, heard: false, flatMs: 0, quietMs: 0, label: '' }))
    if (!meter) return setStatus(null)
    let lastLoud = Date.now()
    let logged = false
    const read = () => {
      const now = Date.now()
      if (meter.level() > SPEECH_RMS) lastLoud = now
      const next = captureStatus({
        state: 'live',
        running: meter.audioRunning(),
        heard: meter.heard(),
        flatMs: meter.flatMs(),
        quietMs: now - lastLoud,
        label: meter.label,
      })
      if (next.deaf && !logged) {
        logged = true
        // The path that was silent on 20 Nov: a lit mic, an open stream, and no signal in it.
        keyAction('mic_failed', { engine: 'meter', reason: 'heard_nothing', ...extra })
      }
      setStatus((s) => (s?.text === next.text ? s : next))
    }
    read()
    const t = setInterval(read, 250)
    // A suspended context wakes on any tap. A click, not a pointerdown: a touch pointerdown is
    // not a user activation, and audio made or resumed there stays suspended on WebKit.
    const wake = () => meter.audioRunning() || meter.wake()
    document.addEventListener('click', wake)
    return () => {
      clearInterval(t)
      document.removeEventListener('click', wake)
    }
  }, [state, meter])

  /** Open the mic. Call inside the tap. Each finished piece of what he says goes to `onText`. */
  const start = (onText: (piece: string) => void) => {
    if (busy.current) return
    busy.current = true
    setProblem(null)
    setLost(false)
    setState('asking')
    const mine = (run.current = { got: 0 })
    const g = ++gen.current
    openCapture(
      {
        onText: (piece) => {
          mine.got += 1
          onText(piece)
        },
        onInterim: (w) => g === gen.current && mounted.current && setInterim(w),
      },
      {
        onPending: (n) => mounted.current && setPending(n),
        onProblem: (engine, reason, recovered) => {
          keyAction('mic_failed', { engine, reason, ...(recovered ? { recovered: true } : {}), ...extra })
          if (recovered || !mounted.current) return
          if (g === gen.current && (FINAL.includes(reason) || reason === 'recorder')) {
            // Nothing more can be written down: the recording stops, so the status cannot go on
            // saying "I can hear you" beside the alert.
            const c = cap.current
            idle()
            if (reason === 'recorder') {
              void c?.finish() // the parts before it are still written down
              setLost(true)
              return setProblem(micProblem('lost'))
            }
            c?.cancel()
            return setProblem(micProblem(reason))
          }
          setProblem(micProblem(['network', 'unavailable'].includes(reason) ? 'part' : reason))
        },
        onLost: (why, away) => {
          if (g !== gen.current) return
          keyAction('mic_failed', { engine: 'mic', reason: `lost_${why}`, away, ...extra })
          // What was recorded so far is written down; the text stays; the stream is released.
          const c = cap.current
          idle()
          void c?.finish()
          if (!mounted.current) return
          setLost(true)
          setProblem(micProblem(away ? 'left' : 'lost'))
        },
      },
    ).then(
      (c) => {
        // Finished or left while the permission prompt was up: nothing was said.
        if (g !== gen.current) return c.cancel()
        cap.current = c
        setMeter(c)
        setState('live')
      },
      (e) => {
        if (g !== gen.current) return
        busy.current = false
        setState('idle')
        const reason = e instanceof SttError ? e.reason : 'unavailable'
        keyAction('mic_failed', { engine: 'mic', reason, ...extra })
        setProblem(micProblem(reason))
        live.current.onFail?.(reason)
      },
    )
  }

  const idle = () => {
    gen.current += 1
    cap.current = null
    busy.current = false
    setMeter(null)
    setInterim('')
    setState('idle')
  }

  /** Stop recording. Resolves when every part has landed in its field. */
  const finish = async () => {
    const c = cap.current
    const mine = run.current
    idle()
    if (!c) return
    const heard = c.heard()
    await c.finish()
    if (mounted.current && heard && !mine.got) setProblem((p) => p ?? micProblem('nothing'))
  }

  /** Stop and drop what has not landed. */
  const cancel = () => {
    cap.current?.cancel()
    idle()
  }

  return {
    /** idle → asking (the permission prompt) → live → writing (parts still being written down). */
    phase: state !== 'idle' ? state : pending > 0 ? ('writing' as const) : ('idle' as const),
    recording: state !== 'idle',
    pending,
    status,
    interim,
    problem,
    lost,
    meter,
    start,
    finish,
    cancel,
    /** The words go to another field from now on (the intake's Next). */
    retarget: (onText: (piece: string) => void) =>
      cap.current?.retarget({ onText, onInterim: (w) => mounted.current && setInterim(w) }),
    /** Asking or live, read now (state lags inside one event). */
    busy: () => busy.current,
    /** He has made a sound into the open recording. */
    heard: () => !!cap.current?.heard(),
    clearProblem: () => setProblem(null),
  }
}

export type CaptureHandle = ReturnType<typeof useCapture>

// candle-400 and marble-500 (src/index.css): the live line and the resting one.
const LIVE = '#e0b263'
const REST = '#776f61'

/** The thread: one thin line, as in the sample he picked (lab/voice-capture, tab 3). */
function drawThread(c: HTMLCanvasElement | null, level: number, now: number, live: boolean) {
  if (!c) return
  c.dataset.level = level.toFixed(3)
  const g = c.getContext?.('2d')
  if (!g) return
  const d = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = 40
  if (c.width !== w * d) {
    c.width = w * d
    c.height = h * d
  }
  g.setTransform(d, 0, 0, d, 0, 0)
  g.clearRect(0, 0, w, h)
  const a = live ? Math.min(h / 2 - 2, Math.sqrt(level) * h * 0.7) : 0
  g.strokeStyle = live ? LIVE : REST
  g.lineWidth = 1.5
  g.beginPath()
  for (let x = 0; x <= w; x += 3) {
    const env = Math.sin((x / w) * Math.PI)
    const y = h / 2 + Math.sin(x / 9 + now / 60) * a * env * (0.6 + 0.4 * Math.sin(x / 31 - now / 140))
    if (x) g.lineTo(x, y)
    else g.moveTo(x, y)
  }
  g.stroke()
}

/** The candle and the thread, the sentence, the words still forming, and anything that failed. */
export function CapturePanel({
  cap,
  compact = false,
  sentence = true,
  className = '',
}: {
  cap: CaptureHandle
  /** The voice bar: the candle's flame and shoulder beside the thread, not the whole candle above it. */
  compact?: boolean
  /** Talk says the sentence in its own status line. */
  sentence?: boolean
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const candle = useRef<CandleHandle>(null)
  const { recording, meter } = cap

  useEffect(() => {
    if (!recording) return
    let level = 0
    let raf = requestAnimationFrame(function frame(now) {
      raf = requestAnimationFrame(frame)
      const rms = meter?.level() ?? 0
      level += (rms - level) * (rms > level ? 0.6 : 0.15)
      drawThread(canvas.current, level, now, !!meter)
      candle.current?.flicker(rms, level, now)
    })
    const c = candle.current
    return () => {
      cancelAnimationFrame(raf)
      c?.rest()
    }
  }, [recording, meter])

  if (cap.phase === 'idle' && !cap.problem) return null
  return (
    <div data-testid="capture" className={className}>
      {recording && (
        // The light is clipped to the panel, so it does not fall on the page above the voice bar.
        <div className={`flex overflow-clip ${compact ? 'items-end gap-3' : 'flex-col items-center gap-1 pt-2'}`}>
          {compact ? <Candle ref={candle} size={56} crop={0.56} /> : <Candle ref={candle} />}
          <canvas
            ref={canvas}
            height={40}
            data-testid="thread"
            aria-hidden="true"
            className={`relative block h-10 min-w-0 ${compact ? 'mb-2 flex-1' : 'w-full'}`}
          />
        </div>
      )}
      {sentence && recording && cap.status && (
        <p
          role="status"
          data-testid="capture-status"
          className={`mt-1 text-[19px] leading-[27px] ${cap.status.tone === 'bad' ? 'text-clay-400' : 'text-marble-200'}`}
        >
          {cap.status.text}
        </p>
      )}
      {cap.interim && (
        <p data-testid="capture-interim" className="t-note italic">
          {cap.interim}
        </p>
      )}
      {cap.pending > 0 && (
        <p data-testid="capture-writing" role={recording ? undefined : 'status'} className="t-note italic">
          Writing it down…
        </p>
      )}
      {cap.problem && (
        <p role="alert" data-testid="mic-problem" className="t-body mt-1 border-l-2 border-clay-500 pl-4">
          {cap.problem}
        </p>
      )}
    </div>
  )
}

/** The mic, drawn. Always beside its word. */
export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
    </svg>
  )
}
