import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cancel, speak } from '@/components/Listen'
import { personaName } from '@/content/personas'
import { unlock } from '@/domain/tts'
import type { Item } from '@/domain/mastermind'
import { sentenceChunker } from '@/domain/sentences'
import { recognitionCtor, VOICE, type Recognition } from '@/domain/speech'
import { record, serverEars, SttError, transcribe, unlockAudioInput, type Recording } from '@/domain/stt'
import { keyAction } from '@/analytics'
import { describeTurn, turnClock } from '@/domain/voiceTiming'
import { micProblem } from '@/components/MicButton'

// Talk mode (council-v4.3.md "Talk mode"): a hands-free room, driven from a player bar at the
// bottom of the screen (Pavol, 8 Nov: "something more live, podcast-like, audio-player-like").
// She says when she is done (Done), or a long pause sends it, with a countdown she can see; the
// adviser's answer is spoken sentence by sentence as it streams, and the line being spoken is
// marked on screen; pause holds the room and resumes where it stopped; previous and next move
// between the facilitator's questions; two words over the audio stop it and start her message.
// On an iPhone (and wherever the browser has no recogniser) the gateway's ears take turns
// instead: the mic records while the room is quiet and is closed while an adviser speaks,
// so the phone plays through its speaker; "Cut in" stops the adviser and opens the mic.

export const TALK_STORAGE = 'council:talk'
/** The pause that sends her message on its own. Long on purpose: thinking pauses are not the end
 *  (Pavol, 8 Nov: 1.2 s cut him off); Done sends at once. The intake's dictation keeps 2,500 ms. */
export const TALK_SILENCE_MS = 4000
/** The last stretch of that pause is counted down in the bar, so the send never surprises her. */
export const COUNTDOWN_MS = 2000
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
  timing = false,
  onNow,
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
  /** Admins see each turn's wait to the first word under the status line. */
  timing?: boolean
  /** The line being spoken (its item's index and text), for the screen to mark; null when quiet. */
  onNow?: (now: { index: number; text: string } | null) => void
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
  // The wait from her last word to the first adviser audio, once per turn (key_action voice_turn).
  const clock = useRef(turnClock()).current
  const heardAt = useRef<number | null>(null) // her last word, for the turn she sends next
  const stoppedAt = useRef<number | null>(null) // server ears: the clip went to be written down
  const [lastTurn, setLastTurn] = useState<string | null>(null)
  // Paused: the room holds. Lines that were queued or arrive meanwhile wait in `pending` and are
  // spoken from the first unfinished one on resume; the mic stays shut.
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const pending = useRef<{ text: string; speaker: string; index: number }[]>([])
  // Her words are in and the auto-send is counting (browser ears): when the last one came.
  const [pendingSince, setPendingSince] = useState<number | null>(null)
  const flushNow = useRef<(() => void) | null>(null)
  // A ticking clock for the countdown and the "Thinking… n s" line, only while either shows.
  const [tick, setTick] = useState(() => Date.now())
  const thinkingSince = useRef<number | null>(null)
  const live = useRef({ active, streaming, onSay, onChange, onNow })
  live.current = { active, streaming, onSay, onChange, onNow }

  const voice = (text: string, speaker: string, index = -1) => {
    if (muted.current) return
    const entry = { text, speaker, index }
    pending.current.push(entry)
    if (pausedRef.current) return
    // The room speaks: the gateway's mic closes so the phone plays through its speaker and
    // the advisers' words are never recorded as hers.
    if (ears === 'server') shutMic()
    queued.current += 1
    const line = { text, ended: null as number | null }
    lines.current.push(line)
    if (speaker !== 'facilitator') setTalker(speaker)
    clock.firstLine()
    const done = () => {
      line.ended = Date.now()
      pending.current = pending.current.filter((p) => p !== entry)
      queued.current = Math.max(0, queued.current - 1)
      if (queued.current) return
      setTalker(null)
      live.current.onNow?.(null)
      // The room went quiet: her turn. (The browser recogniser never closed.)
      if (ears === 'server') void listenClip()
    }
    speak(text, VOICE, done, speaker, (via) => {
      if (mounted.current) live.current.onNow?.(index >= 0 ? { index, text } : null)
      const t = ears && clock.audioStarted(via, ears)
      if (!t) return
      keyAction('voice_turn', t)
      if (mounted.current) setLastTurn(describeTurn(t))
    })
  }

  const hush = () => {
    clock.reset()
    cancel()
    queued.current = 0
    pending.current = []
    const now = Date.now()
    for (const l of lines.current) l.ended ??= now
    setTalker(null)
    live.current.onNow?.(null)
  }

  /** Hold the room: the voice stops mid-line, the mic shuts, what was left waits. */
  const pause = () => {
    pausedRef.current = true
    setPaused(true)
    clearTimeout(timer.current)
    setPendingSince(null)
    cancel()
    queued.current = 0
    setTalker(null)
    live.current.onNow?.(null)
    close()
  }
  /** Carry on from the first line that had not finished; with none left, it is her turn. */
  const resume = () => {
    pausedRef.current = false
    setPaused(false)
    unlock() // inside the tap (iOS)
    const left = pending.current
    pending.current = []
    for (const p of left) voice(p.text, p.speaker, p.index)
    if (!left.length) listen()
  }

  /** Previous / next question and the question list: her words to the facilitator, plainly. */
  const steer = (text: string) => {
    if (pausedRef.current) {
      pausedRef.current = false
      setPaused(false)
    }
    hush()
    muted.current = true // what was still coming of this answer stays on screen, unspoken
    send(text, true)
  }

  const send = (text: string, wasHeld = false) => {
    if (live.current.streaming) {
      held.current = `${held.current} ${text}`.trim()
      return
    }
    muted.current = false
    setPendingSince(null)
    // A turn that waited for the group to finish is not timed: its wait is the group's, not ours.
    if (!wasHeld && heardAt.current !== null) clock.sent(heardAt.current, ears === 'server' ? stoppedAt.current : null)
    else clock.reset()
    heardAt.current = stoppedAt.current = null
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
    return mounted.current && active && !pausedRef.current && !queued.current && (!streaming || muted.current)
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
        onSilence: () => void heardClip(r, g, false),
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

  const heardClip = async (r: Recording, g: number, done: boolean) => {
    if (clip.current !== r || g !== gen.current) return
    clip.current = null
    opening.current = true
    setWriting(true)
    // Done: she finished just now. Otherwise the recorder calls this after TALK_SILENCE_MS of quiet,
    // so her last word was that long ago (at the 60 s cap, or with no loudness to watch, a guess).
    heardAt.current = done ? Date.now() : Date.now() - TALK_SILENCE_MS
    stoppedAt.current = Date.now()
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
    if (pausedRef.current) return
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
      setPendingSince(null)
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
      if (heard) heardAt.current = Date.now()
      // Her own turn: the bar counts the auto-send down (a word over the room is not a turn yet).
      setPendingSince(heard && !queued.current ? Date.now() : null)
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
    flushNow.current = flush
    r.start()
  }

  /** Done: send what she said now, without waiting out the pause. */
  const done = () => {
    if (ears === 'server') {
      const r = clip.current
      if (r) void heardClip(r, gen.current, true)
      return
    }
    flushNow.current?.()
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
    clock.reset()
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
    if (active) send(text, true)
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
          for (const s of out) voice(s, it.speaker, i)
          if (it.streaming) return
        }
        // Otherwise the final text rewrote what streamed: what was spoken stands, the rest is read on screen.
        chunk.current = null
      } else if (it.kind === 'floor') voice(it.question, 'facilitator', i)
      else if (it.kind === 'facilitator') voice(it.text, 'facilitator', i)
      handled.current = i + 1
    }
    // The answer is in and nothing of it was spoken: that turn gets no report.
    if (!streaming) clock.unanswered()
  }, [active, items, streaming])

  const tap = () => {
    if (active) return onChange(false)
    setProblem(null)
    unlock() // inside the tap: the shared player may speak from now on (iOS)
    if (ears === 'server') unlockAudioInput() // and the mic's loudness watch may hear
    setArmed(true)
    if (!on) onChange(true)
    listen()
  }

  // "Thinking… n s" counts from the moment the group started answering.
  if (streaming && thinkingSince.current === null) thinkingSince.current = Date.now()
  if (!streaming) thinkingSince.current = null
  const ticking = on && (streaming || pendingSince !== null)
  useEffect(() => {
    if (!ticking) return
    setTick(Date.now())
    const t = setInterval(() => setTick(Date.now()), 250)
    return () => clearInterval(t)
  }, [ticking])

  const floors = items.flatMap((it) => (it.kind === 'floor' ? [it.question] : []))
  const [list, setList] = useState(false)
  const left = pendingSince === null ? null : Math.max(0, TALK_SILENCE_MS - (tick - pendingSince))
  const thinking = streaming && !talker
  const herTurnNow = active && !paused && !talker && !streaming && !writing

  const status = !armed
    ? 'Tap to resume'
    : paused
      ? 'Paused'
      : talker
        ? `${personaName(talker)} is talking…`
        : streaming
          ? `Thinking… ${Math.max(0, Math.floor((tick - (thinkingSince.current ?? tick)) / 1000))} s`
          : writing
            ? 'Writing it down…'
            : left !== null && left <= COUNTDOWN_MS
              ? `Sending in ${Math.ceil(left / 1000)} s…`
              : 'Listening…'

  // The main button does the one thing that makes sense now.
  const main = !armed
    ? { label: 'Start', onClick: tap, testid: 'voice-start' }
    : paused
      ? { label: 'Resume', onClick: resume, testid: 'voice-resume' }
      : talker
        ? ears === 'server'
          ? { label: 'Cut in', onClick: cutIn, testid: 'cut-in' }
          : {
              label: 'Interrupt',
              onClick: () => {
                muted.current = true
                hush()
              },
              testid: 'voice-interrupt',
            }
        : herTurnNow
          ? { label: 'Done', onClick: done, testid: 'voice-done' }
          : { label: thinking ? 'Wait' : 'Writing', onClick: undefined, testid: 'voice-wait' }

  const icon = (d: string) => (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  const round = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-marble-200 hover:text-marble-50 disabled:text-marble-600'

  if (!ears) return null
  if (!on)
    return (
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={tap} aria-pressed={false} data-testid="talk" className="slab slab-off flex-1 gap-2">
            {icon('M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21')}
            Talk
          </button>
          {children}
        </div>
        {problem && (
          <p role="alert" data-testid="talk-problem" className="t-body mt-2 border-l-2 border-clay-500 pl-4">
            {problem}
          </p>
        )}
      </div>
    )

  return (
    <>
      <section
        aria-label="Voice"
        data-testid="voice-bar"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto max-w-xl px-4 pt-2 pb-3">
          {list && (
            <ol data-testid="voice-questions" className="mb-2 max-h-56 overflow-y-auto border-b border-ink-700 pb-2">
              {floors.map((q, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-baseline gap-3 py-1 text-left text-[15px] leading-[22px] text-marble-200 hover:text-marble-50"
                    onClick={() => {
                      setList(false)
                      steer(`Let's go back to this question: "${q}"`)
                    }}
                  >
                    <span className="t-label shrink-0 text-marble-400">{i + 1}</span>
                    <span className={i === floors.length - 1 ? 'text-candle-200' : ''}>{q}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button
            type="button"
            aria-expanded={list}
            disabled={!floors.length}
            onClick={() => setList((v) => !v)}
            data-testid="voice-where"
            className="flex min-h-11 w-full items-center gap-2 text-left"
          >
            <span className="t-label shrink-0 text-candle-300">{floors.length ? `Question ${floors.length}` : 'Opening'}</span>
            <span role="status" data-testid="talk-status" className="truncate text-[15px] leading-[23px] text-marble-200">
              {status}
            </span>
          </button>
          {timing && lastTurn && (
            <p data-testid="voice-timing" className="text-[13px] leading-[20px] text-marble-400">
              {lastTurn}
            </p>
          )}
          {problem && (
            <p role="alert" data-testid="talk-problem" className="t-body mt-1 border-l-2 border-clay-500 pl-4">
              {problem}
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label="Previous question"
              disabled={!active || floors.length < 2}
              onClick={() => steer(`Let's go back to the previous question: "${floors[floors.length - 2]}"`)}
              className={round}
            >
              {icon('M7 6v12M18 6l-8 6 8 6z')}
            </button>
            <button
              type="button"
              aria-label="Pause"
              aria-pressed={paused}
              data-testid="voice-pause"
              disabled={!active}
              onClick={paused ? resume : pause}
              className={round}
            >
              {paused ? icon('M8 5l11 7-11 7z') : icon('M9 5v14M15 5v14')}
            </button>
            <button
              type="button"
              data-testid={main.testid}
              disabled={!main.onClick}
              onClick={main.onClick}
              className="slab min-w-28 flex-1 gap-2"
            >
              {main.label}
            </button>
            <button
              type="button"
              aria-label="Next question"
              disabled={!active || !floors.length}
              onClick={() => steer("Let's move on to the next question.")}
              className={round}
            >
              {icon('M17 6v12M6 6l8 6-8 6z')}
            </button>
            <button type="button" aria-label="End voice" data-testid="talk" aria-pressed={true} onClick={() => onChange(false)} className={round}>
              {icon('M6 6l12 12M18 6L6 18')}
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
