import { useEffect, useRef, useState } from 'react'
import { keyAction } from '@/analytics'
import { recognitionCtor, transcriptOf, type Recognition } from '@/domain/speech'
import { markBrowserEngineBroken, record, recordingSupported, serverEars, SttError, transcribe, unlockAudioInput, type Recording } from '@/domain/stt'

/** A pause this long after the last heard word ends the answer. The browser's own
 *  endpoint (non-continuous mode) fires on the first breath, which is what made the
 *  facilitator ask the next question before anyone had finished the first. */
export const SILENCE_MS = 2500
// ponytail: Chrome gives up on its own after ~8 s of silence; we listen again a few times
// before treating that as "nothing to say".
const RESTARTS = 3
/** One clip for the gateway is at most a minute (its size limit is about that at phone bitrates). */
export const MAX_CLIP_MS = 60_000
/** Nothing louder than the room for this long: stop and say so. */
export const IDLE_MS = 10_000

/** A mic exists here: the browser recogniser, or a recorder for the gateway. */
export const micAvailable = () => !!recognitionCtor() || recordingSupported()

const KEYBOARD = 'Use the mic on your keyboard, or type.'
/** What to tell her, by failure: browser recogniser errors and gateway reasons alike. */
export function micProblem(reason: string): string {
  switch (reason) {
    case 'not-allowed':
    case 'denied':
      return `The mic is blocked for this site. Allow it in your settings, or use the mic on your keyboard.`
    case 'audio-capture':
    case 'no_mic':
      return `No microphone found. ${KEYBOARD}`
    case 'quota':
      return `Voice input has reached today’s limit. ${KEYBOARD}`
    case 'too_large':
      return 'That was too long for one go. Keep it under a minute.'
    case 'password':
      return 'The beta password changed. Reload the page and enter the new one.'
    case 'nothing':
      return 'I didn’t catch anything. Tap the mic and speak a little closer.'
    case 'retry':
      return 'Your browser’s speech service didn’t answer. Tap the mic again to try another way.'
    default:
      return `Voice input isn’t available right now. ${KEYBOARD}`
  }
}

/**
 * Dictation for a textarea. Press to start, press again to stop; otherwise it stops by
 * itself after a real pause. With the browser recogniser, interim words stream into the
 * field; recording for the gateway (iPhone, Firefox, or after the recogniser failed), the
 * words arrive once the clip is transcribed. Absent only where neither exists.
 * A failure is said in words, never silent (Eyal, 11 and 29 Oct).
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
  const [state, setState] = useState<'idle' | 'listening' | 'transcribing'>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const clip = useRef<Recording | null>(null)
  // What was already typed when dictation started — dictated words replace only
  // the dictated tail, never the sentence she wrote by hand.
  const base = useRef('')
  const Ctor = recognitionCtor()

  const heardRef = useRef('')
  const restarts = useRef(0)
  // Set by the user's stop or by unmount; an engine ending on its own is not "stopped".
  const stopped = useRef(false)
  const mounted = useRef(true)

  const fail = (engine: 'browser' | 'server', reason: string, say = reason) => {
    keyAction('mic_failed', { engine, reason })
    if (mounted.current) setProblem(micProblem(say))
  }
  const join = (heard: string) => (base.current ? `${base.current.trimEnd()} ${heard}` : heard)

  // --- the gateway's ears -------------------------------------------------------------

  const finishClip = async (r: Recording) => {
    if (clip.current !== r) return
    clip.current = null
    setState('transcribing')
    const { clip: audio, heard } = await r.stop()
    let text = ''
    try {
      if (audio.size) text = await transcribe(audio)
    } catch (e) {
      fail('server', e instanceof SttError ? e.reason : 'unavailable')
    }
    if (!mounted.current) return
    setState('idle')
    if (text) onChange(join(text))
    else if (heard && audio.size) setProblem((p) => p ?? micProblem('nothing'))
    onDone?.(text)
  }

  const opening = useRef(false) // getUserMedia pending: a second tap must not open a second mic
  const startClip = async () => {
    if (opening.current || clip.current) return
    opening.current = true
    base.current = value
    setState('listening')
    let r: Recording
    try {
      r = await record({
        silenceMs: SILENCE_MS,
        maxMs: MAX_CLIP_MS,
        idleMs: IDLE_MS,
        onSilence: () => void finishClip(r),
        onIdle: () => {
          if (clip.current !== r) return
          clip.current = null
          r.cancel()
          setState('idle')
          setProblem(micProblem('nothing'))
          onDone?.('')
        },
      })
    } catch (e) {
      opening.current = false
      if (!mounted.current) return
      setState('idle')
      return fail('server', e instanceof SttError ? e.reason : 'unavailable')
    }
    opening.current = false
    // Unmounted, or stopped before the mic opened: nothing was said.
    if (!mounted.current) return r.cancel()
    if (stopped.current) {
      r.cancel()
      setState('idle')
      return
    }
    clip.current = r
  }

  // --- the browser's ears --------------------------------------------------------------

  const stop = () => {
    stopped.current = true
    if (clip.current) return void finishClip(clip.current)
    if (opening.current) return // the clip is dropped as soon as the mic opens
    rec.current?.stop()
    setState('idle')
  }

  const start = () => {
    setProblem(null)
    stopped.current = false
    if (serverEars(!!Ctor)) {
      unlockAudioInput() // still inside the tap (or the intake's tap that mounted it)
      return void startClip()
    }
    if (!Ctor) return
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    let silence: ReturnType<typeof setTimeout> | undefined
    let error: string | null = null
    r.onresult = (event) => {
      const heard = transcriptOf(event)
      heardRef.current = heard
      onChange(join(heard))
      clearTimeout(silence)
      silence = setTimeout(() => r.stop(), SILENCE_MS)
    }
    r.onend = () => {
      clearTimeout(silence)
      if (rec.current !== r) return
      if (error && error !== 'no-speech' && error !== 'aborted') {
        setState('idle')
        // A broken service (network, service-not-allowed) gets the gateway's ears next tap.
        const retry = recordingSupported() && !['not-allowed', 'audio-capture'].includes(error)
        if (retry) markBrowserEngineBroken()
        fail('browser', error, retry ? 'retry' : error)
        onDone?.(heardRef.current)
        return
      }
      if (!stopped.current && !heardRef.current && restarts.current < RESTARTS) {
        restarts.current += 1
        start()
        return
      }
      setState('idle')
      onDone?.(heardRef.current)
    }
    r.onerror = (e) => {
      error = e?.error ?? 'unknown'
    }
    heardRef.current = ''
    base.current = value
    rec.current = r
    r.start()
    setState('listening')
  }

  useEffect(() => {
    mounted.current = true
    if (autoStart) start()
    return () => {
      mounted.current = false
      stopped.current = true
      rec.current?.abort()
      rec.current = null
      clip.current?.cancel()
      clip.current = null
    }
    // Mount only: the parent keys it per field.
  }, [])

  // The message stays long enough to read, then goes.
  useEffect(() => {
    if (!problem) return
    const t = setTimeout(() => setProblem(null), 8000)
    return () => clearTimeout(t)
  }, [problem])

  if (!Ctor && !recordingSupported()) return null

  const listening = state === 'listening'
  return (
    <>
      <button
        type="button"
        onClick={() => (state === 'idle' ? start() : listening ? stop() : undefined)}
        aria-pressed={listening}
        aria-busy={state === 'transcribing' || undefined}
        aria-label={
          state === 'transcribing' ? `Writing down ${label}` : listening ? `Stop dictating ${label}` : `Dictate ${label}`
        }
        data-testid="mic"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
          listening ? 'bg-candle-400 text-ink-950' : state === 'transcribing' ? 'animate-pulse text-candle-300' : 'text-marble-300 hover:text-marble-50'
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
      {problem && (
        <p
          role="alert"
          data-testid="mic-problem"
          className="fixed inset-x-4 z-40 mx-auto max-w-xl rounded-md border border-ink-700 bg-ink-850 px-4 py-3 text-[15px] leading-[22px] text-marble-100 shadow-lg"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
        >
          {problem}
        </p>
      )}
    </>
  )
}
