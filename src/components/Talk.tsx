import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cancel, speak } from '@/components/Listen'
import { personaName } from '@/content/personas'
import { unlock } from '@/domain/tts'
import type { Item } from '@/domain/mastermind'
import { sentenceChunker } from '@/domain/sentences'
import { recognitionCtor, VOICE, type Recognition } from '@/domain/speech'
import { record, serverEars, SttError, transcribe, unlockAudioInput, type Recording } from '@/domain/stt'
import { keyAction } from '@/analytics'
import { micProblem } from '@/components/MicButton'

// Talk mode (council-v4.3.md "Talk mode"): a hands-free room. The mic stays open; a pause
// sends what was heard as a voice turn; the adviser's answer is spoken sentence by sentence
// as it streams; two words over the audio stop it and start the next message.
// On an iPhone (and wherever the browser has no recogniser) the gateway's ears take turns
// instead: the mic records while the room is quiet and is closed while an adviser speaks,
// so the phone plays through its speaker; "Cut in" stops the adviser and opens the mic.

export const TALK_STORAGE = 'council:talk'
/** The pause that ends a spoken message here; the intake's dictation keeps 2,500 ms. */
export const TALK_SILENCE_MS = 1200
/** Words heard over the audio that count as cutting in, not a cough. */
const BARGE_IN_WORDS = 2
/** After an engine error (network, aborted, no-speech) wait this long before listening again. */
export const RETRY_MS = 1000
const FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture']
/** After a line ends, its echo can still arrive from the recogniser this late. Short on purpose:
 *  her answer to the question comes after it, and may reuse the question's words. */
export const ECHO_GRACE_MS = 1500
/** Share of the heard words that must match the room's words, in order and nearly contiguous. */
const ECHO_SHARE = 0.75
/** Extra words a matching run may span beyond what was heard (misheard or dropped words). */
const ECHO_SLACK = 2

const words = (t: string) => t.split(/\s+/).filter(Boolean).length
const tokens = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .split(' ')
    .filter(Boolean)

/** Longest common subsequence of two token lists. */
function lcs(a: string[], b: string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0)
  for (const w of a) {
    const row = [0]
    for (let j = 1; j <= b.length; j++) row[j] = w === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1])
    prev = row
  }
  return prev[b.length]
}

/**
 * On speakerphone the mic hears the adviser. True when `heard` is the room's own `lines` coming
 * back: some window of the lines no longer than what was heard plus ECHO_SLACK words contains
 * ECHO_SHARE of the heard words in order. Contiguity is the point: an answer that reuses a few
 * common words from a long line ("it is working") does not line up the way an echo does.
 */
export function isEcho(heard: string, lines: string[]): boolean {
  const h = tokens(heard)
  if (!h.length) return false
  const s = tokens(lines.join(' '))
  const width = h.length + ECHO_SLACK
  const need = Math.ceil(h.length * ECHO_SHARE)
  for (let i = 0; i <= Math.max(0, s.length - width); i++) {
    if (lcs(h, s.slice(i, i + width)) >= need) return true
  }
  return false
}

export function Talk({
  on,
  onChange,
  items,
  streaming,
  onSay,
  onQuiet,
  children,
}: {
  on: boolean
  onChange: (on: boolean) => void
  items: Item[]
  streaming: boolean
  /** Send a voice turn. */
  onSay: (text: string) => void
  /** Switched off mid-answer: read-aloud should not repeat the answer Talk was speaking. */
  onQuiet?: () => void
  /** Sits beside the control (the Listen chip). */
  children?: ReactNode
}) {
  const Ctor = recognitionCtor()
  const [ears] = useState<'browser' | 'server' | null>(() => (serverEars(!!Ctor) ? 'server' : Ctor ? 'browser' : null))
  const clip = useRef<Recording | null>(null)
  const opening = useRef(false) // a clip is starting or being transcribed: one at a time
  const [writing, setWriting] = useState(false) // a clip is being transcribed (status line)
  const [problem, setProblem] = useState<string | null>(null)
  // Remembered as on is not enough: the mic and the speaker wait for a tap on this page.
  const [armed, setArmed] = useState(false)
  const active = on && armed
  const [talker, setTalker] = useState<string | null>(null)
  const queued = useRef(0) // lines handed to the speaker and not yet finished
  const muted = useRef(false) // talked over: the rest of this turn stays on screen, unspoken
  const handled = useRef(items.length) // what was on screen before Talk is not read
  const chunk = useRef<{ index: number; text: string; next: ReturnType<typeof sentenceChunker> } | null>(null)
  const rec = useRef<Recognition | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined) // silence or retry
  const held = useRef('') // words that finished while the group was still answering
  // The room's lines for the echo check: queued or playing (ended null), or ended moments ago.
  const lines = useRef<{ text: string; ended: number | null }[]>([])
  const echoOf = (heard: string) => {
    const now = Date.now()
    lines.current = lines.current.filter((l) => l.ended === null || now - l.ended < ECHO_GRACE_MS)
    return isEcho(heard, lines.current.map((l) => l.text))
  }
  const live = useRef({ active, streaming, onSay, onChange })
  live.current = { active, streaming, onSay, onChange }

  const voice = (text: string, speaker: string) => {
    if (muted.current) return
    // The room speaks: the gateway's mic closes so the phone plays through its speaker and
    // the advisers' words are never recorded as hers.
    if (ears === 'server') shutMic()
    queued.current += 1
    const line = { text, ended: null as number | null }
    lines.current.push(line)
    if (speaker !== 'facilitator') setTalker(speaker)
    const done = () => {
      line.ended = Date.now()
      queued.current = Math.max(0, queued.current - 1)
      if (queued.current) return
      setTalker(null)
      // The room went quiet: her turn. (The browser recogniser never closed.)
      if (ears === 'server') void listenClip()
    }
    speak(text, VOICE, done, speaker)
  }

  const hush = () => {
    cancel()
    queued.current = 0
    const now = Date.now()
    for (const l of lines.current) l.ended ??= now
    setTalker(null)
  }

  const send = (text: string) => {
    if (live.current.streaming) {
      held.current = `${held.current} ${text}`.trim()
      return
    }
    muted.current = false
    live.current.onSay(text)
  }

  // Server ears. Every recording belongs to a generation; shutting the mic (the room speaks,
  // she sends by hand, Talk goes off, the screen goes away) moves to the next one, and whatever
  // the old generation was still opening or transcribing is dropped when it comes back.
  const gen = useRef(0)
  const mounted = useRef(true)
  const shutMic = () => {
    gen.current += 1
    opening.current = false
    clip.current?.cancel()
    clip.current = null
    setWriting(false)
  }
  /** Her turn may open: Talk on, nobody speaking, and the group not answering (unless she cut in). */
  const herTurn = () => {
    const { active, streaming } = live.current
    return mounted.current && active && !queued.current && (!streaming || muted.current)
  }

  /** One turn of hers through the gateway: record until a pause, transcribe, send. */
  const listenClip = async () => {
    if (clip.current || opening.current || !herTurn()) return
    opening.current = true
    const g = gen.current
    let r: Recording
    try {
      r = await record({
        silenceMs: TALK_SILENCE_MS,
        maxMs: 60_000,
        // Nothing said for a while: drop the clip and keep listening with a fresh one.
        idleMs: 30_000,
        onSilence: () => void heardClip(r, g),
        onIdle: () => {
          if (clip.current !== r) return
          clip.current = null
          r.cancel()
          void listenClip()
        },
      })
    } catch (e) {
      if (g !== gen.current) return
      opening.current = false
      return stopFor(e instanceof SttError ? e.reason : 'unavailable')
    }
    // Shut while the mic was opening, or the room started talking meanwhile: not her turn.
    if (g !== gen.current || !herTurn()) {
      if (g === gen.current) opening.current = false
      return r.cancel()
    }
    opening.current = false
    clip.current = r
  }

  const heardClip = async (r: Recording, g: number) => {
    if (clip.current !== r || g !== gen.current) return
    clip.current = null
    opening.current = true
    setWriting(true)
    const { clip: audio } = await r.stop()
    let text = ''
    try {
      text = audio.size ? await transcribe(audio) : ''
    } catch (e) {
      if (g !== gen.current) return
      opening.current = false
      setWriting(false)
      return stopFor(e instanceof SttError ? e.reason : 'unavailable')
    }
    if (g !== gen.current) return // Talk went off or the screen went away: her words stay unsaid
    opening.current = false
    setWriting(false)
    if (text) send(text)
    // Nothing intelligible: listen again.
    else void listenClip()
  }

  /** A failure the room cannot talk past: say it, log it, switch Talk off. */
  const stopFor = (reason: string, engine: 'server' | 'browser' = 'server') => {
    keyAction('mic_failed', { engine, reason, talk: true })
    if (!mounted.current) return
    setProblem(micProblem(reason))
    live.current.onChange(false)
  }

  /** Server ears, while an adviser speaks: stop the room and open the mic now, even mid-answer
   *  (what she says waits for the answer to finish, like any message sent while it streams). */
  const cutIn = () => {
    unlockAudioInput()
    muted.current = true
    hush()
    void listenClip()
  }

  const listen = () => {
    if (ears === 'server') return void listenClip()
    if (!Ctor || rec.current) return
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    let offset = 0 // results before this index were already sent
    let seen = 0
    let heard = '' // her words since the last flush; the room's own echo is left out
    let error: string | null = null
    const flush = () => {
      clearTimeout(timer.current)
      offset = seen
      const text = heard
      heard = ''
      if (rec.current !== r || !text) return
      // A cough or one word over the audio is not a message.
      if (queued.current && words(text) < BARGE_IN_WORDS) return
      send(text)
    }
    r.onresult = (e) => {
      seen = e.results.length
      // Each recogniser segment is judged on its own: the adviser's voice through the speaker
      // is dropped, and what is left is hers, so a cut-in is heard even mid-echo.
      let t = ''
      for (let i = offset; i < seen; i++) {
        const part = e.results[i][0]?.transcript ?? ''
        if (!echoOf(part)) t += ` ${part}`
      }
      heard = t.replace(/\s+/g, ' ').trim()
      if (queued.current && words(heard) >= BARGE_IN_WORDS) {
        muted.current = true
        hush()
      }
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, TALK_SILENCE_MS)
    }
    r.onerror = (e) => {
      error = e?.error ?? 'unknown'
    }
    r.onend = () => {
      if (rec.current !== r) return
      flush()
      rec.current = null
      if (error && FATAL.includes(error)) return stopFor(error, 'browser')
      if (!live.current.active) return
      // ponytail: engines end on their own (Chrome after ~8 s of quiet): listen again at once;
      // after an error (network, aborted) wait a second so a dead engine is not a tight loop.
      if (error) timer.current = setTimeout(() => live.current.active && listen(), RETRY_MS)
      else listen()
    }
    rec.current = r
    r.start()
  }

  const close = () => {
    clearTimeout(timer.current)
    const r = rec.current
    rec.current = null
    r?.abort()
    shutMic()
  }

  // On: listen (already started inside the tap). Off: mic and audio stop, the turn is let go.
  useEffect(() => {
    if (active) return listen()
    close()
    if (queued.current) hush() // only what Talk queued: Listen's narration is not ours to stop
    held.current = ''
    muted.current = false
    if (chunk.current) onQuiet?.()
  }, [active])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      close()
      cancel()
    }
  }, [])

  // Words that finished while the group was answering go as soon as it is done.
  useEffect(() => {
    if (streaming) {
      // She sent by hand or tapped a chip while the mic was open: the group answers now.
      if (ears === 'server' && !muted.current) shutMic()
      return
    }
    if (!held.current) {
      // Server ears: an answer that left nothing to speak hands the turn straight back.
      if (ears === 'server' && active && !queued.current) void listenClip()
      return
    }
    const text = held.current
    held.current = ''
    if (active) send(text)
  }, [streaming])

  // Voice out: each completed sentence of the growing contribution, then the floor question.
  useEffect(() => {
    if (!active) {
      handled.current = items.length
      chunk.current = null
      return
    }
    for (let i = handled.current; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'contribution') {
        if (chunk.current?.index !== i) chunk.current = { index: i, text: '', next: sentenceChunker() }
        const c = chunk.current
        if (it.text.startsWith(c.text)) {
          const out = c.next.push(it.text.slice(c.text.length))
          c.text = it.text
          if (!it.streaming) out.push(...c.next.flush())
          for (const s of out) voice(s, it.speaker)
          if (it.streaming) return
        }
        // Otherwise the final text rewrote what streamed: what was spoken stands, the rest is read on screen.
        chunk.current = null
      } else if (it.kind === 'floor') voice(it.question, 'facilitator')
      else if (it.kind === 'facilitator') voice(it.text, 'facilitator')
      handled.current = i + 1
    }
  }, [active, items])

  const tap = () => {
    if (active) return onChange(false)
    setProblem(null)
    unlock() // inside the tap: the shared player may speak from now on (iOS)
    if (ears === 'server') unlockAudioInput() // and the mic's loudness watch may hear
    setArmed(true)
    if (!on) onChange(true)
    listen()
  }

  const status = !armed
    ? 'Tap to resume'
    : talker
      ? `${personaName(talker)} is talking…`
      : streaming
        ? 'Thinking…'
        : writing
          ? 'Writing it down…'
          : 'Listening…'

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        {ears && (
          <button
            type="button"
            onClick={tap}
            aria-pressed={on}
            data-testid="talk"
            className={`slab flex-1 gap-2 ${on ? '' : 'slab-off'}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
            </svg>
            Talk
          </button>
        )}
        {children}
      </div>
      {ears && on && (
        <div className="mt-2 flex min-h-11 items-center gap-3">
          <p role="status" data-testid="talk-status" className="text-[15px] leading-[23px] text-marble-300">
            {status}
          </p>
          {ears === 'server' && active && talker && (
            <button type="button" onClick={cutIn} className="chip" data-testid="cut-in">
              Cut in
            </button>
          )}
        </div>
      )}
      {problem && (
        <p role="alert" data-testid="talk-problem" className="t-body mt-2 border-l-2 border-clay-500 pl-4">
          {problem}
        </p>
      )}
    </div>
  )
}
