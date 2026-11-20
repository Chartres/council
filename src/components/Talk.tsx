import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addWords, CapturePanel, micAvailable, micProblem, MicIcon, useCapture } from '@/components/Capture'
import { cancel, speak } from '@/components/Listen'
import { personaName } from '@/content/personas'
import { primeMic } from '@/domain/capture'
import { unlock } from '@/domain/tts'
import type { Item } from '@/domain/mastermind'
import { sentenceChunker } from '@/domain/sentences'
import { recognitionCtor, VOICE } from '@/domain/speech'
import { serverEars } from '@/domain/stt'
import { keyAction } from '@/analytics'
import { describeTurn, turnClock } from '@/domain/voiceTiming'

// Talk mode (council-v4.3.md "Talk mode"): a room driven from a player bar at the bottom of the
// screen (Pavol, 8 Nov: "something more live, podcast-like, audio-player-like"). The room and he
// take turns. His turn (Pavol, 20 Nov): the mic opens, the thread and the candle show that sound
// is coming in, his words are set in a field as they are written down, and the turn ends when he
// taps Finish, not when he pauses. The text is his to correct; it goes when he taps Send. The
// adviser's answer is spoken sentence by sentence as it streams, and the line being spoken is
// marked on screen; pause holds the room and resumes where it stopped; previous and next move
// between the facilitator's questions; "Cut in" stops an adviser and opens the mic.
// The mic is closed while an adviser speaks, so a phone plays through its speaker and the
// room's own voice is not written down as his.

export const TALK_STORAGE = 'council:talk'

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
  onLeft,
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
  /** Talk ended with words he had not sent: they go to the reply box, not away. */
  onLeft?: (text: string) => void
}) {
  const [hasMic] = useState(micAvailable)
  // Whose words: the browser's recogniser or the gateway's (for the turn report only).
  const [ears] = useState<'browser' | 'server'>(() => (serverEars(!!recognitionCtor()) ? 'server' : 'browser'))
  const [problem, setProblem] = useState<string | null>(null)
  // Remembered as on is not enough: the mic and the speaker wait for a tap on this page.
  const [armed, setArmed] = useState(false)
  const active = on && armed
  const [talker, setTalker] = useState<string | null>(null)
  const queued = useRef(0) // lines handed to the speaker and not yet finished
  const muted = useRef(false) // cut in on: the rest of this turn stays on screen, unspoken
  const handled = useRef(items.length) // what was on screen before Talk is not read
  const chunk = useRef<{ index: number; text: string; next: ReturnType<typeof sentenceChunker> } | null>(null)
  const held = useRef('') // words sent while the group was still answering
  // The wait from his Send to the first adviser audio, once per turn (key_action voice_turn).
  const clock = useRef(turnClock()).current
  const [lastTurn, setLastTurn] = useState<string | null>(null)
  // Paused: the room holds. Lines that were queued or arrive meanwhile wait in `pending` and are
  // spoken from the first unfinished one on resume; the mic stays shut.
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const pending = useRef<{ text: string; speaker: string; index: number }[]>([])
  const skipping = useRef(false) // after previous/next: the old answer's tail is not spoken
  // A ticking clock for the "Thinking… n s" line, only while it shows.
  const [tick, setTick] = useState(() => Date.now())
  const thinkingSince = useRef<number | null>(null)
  // iPhone/iPad: the last line the gateway could not speak (no robot voice there, Eyal 30 Oct).
  const [missed, setMissed] = useState<{ text: string; speaker: string; index: number } | null>(null)
  const mounted = useRef(true)
  const live = useRef({ active, streaming, onSay, onChange, onNow, onLeft })
  live.current = { active, streaming, onSay, onChange, onNow, onLeft }

  // His turn, as text: what the mic wrote down and what he typed or fixed. Nothing goes until Send.
  const [draft, setDraft] = useState('')
  const draftRef = useRef('')
  const setText = (t: string) => {
    draftRef.current = t
    setDraft(t)
  }
  /** A mic that cannot open is said in words (and logged by the hook); Talk switches off. */
  const cap = useCapture({
    talk: true,
    onFail: (reason) => {
      setProblem(micProblem(reason))
      live.current.onChange(false)
    },
  })
  const capRef = useRef(cap)
  capRef.current = cap

  /** His turn may open: Talk on, nobody speaking, and the group not answering (unless he cut in). */
  const herTurn = () => {
    const { active, streaming } = live.current
    return mounted.current && active && !pausedRef.current && !queued.current && (!streaming || muted.current)
  }
  /** Open the mic for his turn. With words waiting to be sent, it waits for him. */
  const openMic = () => {
    if (!herTurn() || draftRef.current.trim()) return
    record()
  }
  /** Every piece is added to what is there: a correction he made is not overwritten. */
  const record = () => capRef.current.start((piece) => setText(addWords(draftRef.current, piece)))
  /** The room speaks, or he sent by hand: the mic closes. What he said so far stays as text. */
  const shutMic = () => {
    if (capRef.current.busy()) void capRef.current.finish()
  }

  const voice = (text: string, speaker: string, index = -1, again = false) => {
    if (muted.current && !again) return
    const entry = { text, speaker, index }
    pending.current.push(entry)
    if (pausedRef.current) return
    // The room speaks: the mic closes so the phone plays through its speaker and the advisers'
    // words are never written down as his.
    shutMic()
    queued.current += 1
    if (speaker !== 'facilitator') setTalker(speaker)
    clock.firstLine()
    const done = () => {
      pending.current = pending.current.filter((p) => p !== entry)
      queued.current = Math.max(0, queued.current - 1)
      if (queued.current) return
      setTalker(null)
      live.current.onNow?.(null)
      // The room went quiet: his turn.
      openMic()
    }
    speak(text, VOICE, done, speaker, (via) => {
      // A line is playing on the one shared player: a retry now would queue behind it, so the
      // offer of an earlier missed line goes (only the last missed line is kept anyway).
      if (mounted.current) setMissed(null)
      if (mounted.current) live.current.onNow?.(index >= 0 ? { index, text } : null)
      const t = clock.audioStarted(via, ears)
      if (!t) return
      keyAction('voice_turn', t)
      if (mounted.current) setLastTurn(describeTurn(t))
    }, () => mounted.current && setMissed(entry))
  }

  /** Tap to hear: the missed line once more through the gateway (the tap lets it play on iOS). */
  const hearAgain = () => {
    if (!missed) return
    // He is already speaking into the open mic, or his words are being written down: they come first.
    if (cap.phase === 'writing' || cap.heard()) return
    setMissed(null)
    clock.reset() // the wait before the tap is his, not the voice's
    unlock()
    voice(missed.text, missed.speaker, missed.index, true)
  }

  const hush = () => {
    clock.reset()
    cancel()
    queued.current = 0
    pending.current = []
    setTalker(null)
    live.current.onNow?.(null)
  }

  /** Hold the room: the voice stops mid-line, the mic shuts, what was left waits. */
  const pause = () => {
    pausedRef.current = true
    setPaused(true)
    clock.reset() // a paused turn is not timed: the wait would be his
    cancel()
    queued.current = 0
    setTalker(null)
    live.current.onNow?.(null)
    shutMic()
  }
  /** Carry on from the first line that had not finished; with none left, it is his turn. */
  const resume = () => {
    pausedRef.current = false
    setPaused(false)
    unlock() // inside the tap (iOS)
    const left = pending.current
    pending.current = []
    for (const p of left) voice(p.text, p.speaker, p.index)
    openMic()
  }

  /** Previous / next question and the question list: his words to the facilitator, plainly. */
  const steer = (text: string) => {
    if (pausedRef.current) {
      pausedRef.current = false
      setPaused(false)
    }
    hush()
    shutMic()
    muted.current = true // what was still coming of this answer stays on screen, unspoken
    skipping.current = true // and stays unspoken until his message is on screen
    send(text, true)
  }

  const send = (text: string, wasHeld = false) => {
    if (live.current.streaming) {
      held.current = `${held.current} ${text}`.trim()
      return
    }
    muted.current = false
    setMissed(null)
    // A turn that waited for the group to finish is not timed: its wait is the group's, not ours.
    if (!wasHeld) clock.sent(Date.now())
    else clock.reset()
    live.current.onSay(text)
  }

  /** Send: his words, as he left them, go to the group. The only way a voice turn is sent. */
  const sendDraft = () => {
    const text = draftRef.current.trim()
    if (!text || capRef.current.phase !== 'idle') return
    setText('')
    send(text)
  }

  /** Finish: the recording ends, the turn does not. Focus leaves the button, which is about to
   *  read "Send": a second press of the space bar must not send words he has not looked at. */
  const finishTurn = () => {
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    void capRef.current.finish()
  }

  /** Stop the room and open the mic now, even mid-answer (what he then sends waits for the
   *  answer to finish, like any message sent while it streams). */
  const cutIn = () => {
    muted.current = true
    hush()
    openMic()
  }

  // On: his turn opens (already started inside the tap). Off: mic and audio stop, the turn is let go.
  useEffect(() => {
    if (active) return openMic()
    clock.reset()
    pausedRef.current = false
    setPaused(false)
    pending.current = []
    skipping.current = false
    capRef.current.cancel()
    if (draftRef.current.trim()) live.current.onLeft?.(draftRef.current.trim())
    setText('')
    if (queued.current) hush() // only what Talk queued: Listen's narration is not ours to stop
    held.current = ''
    muted.current = false
    setMissed(null)
    if (chunk.current) onQuiet?.()
  }, [active])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancel()
    }
  }, [])

  // Voice out: each completed sentence of the growing contribution, then the floor question.
  useEffect(() => {
    if (!active) {
      handled.current = items.length
      chunk.current = null
      return
    }
    for (let i = handled.current; i < items.length; i++) {
      const it = items[i]
      if (skipping.current) {
        if (it.kind === 'user') skipping.current = false
        handled.current = i + 1
        chunk.current = null
        continue
      }
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

  // Words sent while the group was answering go as soon as it is done. (After the effect
  // above: lines that arrived with the end of the stream are queued before the turn is offered.)
  useEffect(() => {
    if (streaming) {
      // He sent by hand or tapped a chip while the mic was open: the group answers now.
      if (!muted.current) shutMic()
      return
    }
    if (!held.current) {
      // An answer that left nothing to speak hands the turn straight back.
      if (active && !queued.current) openMic()
      return
    }
    const text = held.current
    held.current = ''
    if (active) send(text, true)
  }, [streaming])

  const tap = () => {
    if (active) return onChange(false)
    setProblem(null)
    unlock() // inside the tap: the shared player may speak from now on (iOS)
    setArmed(true)
    if (!on) onChange(true)
    // The mic is asked for inside this tap: opened if it is his turn already, otherwise asked
    // and let go, so the permission prompt does not arrive in the middle of the conversation.
    if (!queued.current && !streaming && !draftRef.current.trim()) record()
    else primeMic()
  }

  // "Thinking… n s" counts from the moment the group started answering.
  if (streaming && thinkingSince.current === null) thinkingSince.current = Date.now()
  if (!streaming) thinkingSince.current = null
  const ticking = on && streaming
  useEffect(() => {
    if (!ticking) return
    setTick(Date.now())
    const t = setInterval(() => setTick(Date.now()), 250)
    return () => clearInterval(t)
  }, [ticking])

  const floors = items.flatMap((it) => (it.kind === 'floor' ? [it.question] : []))
  const [list, setList] = useState(false)
  const hasDraft = !!draft.trim()

  const status = !armed
    ? 'Tap to resume'
    : paused
      ? 'Paused'
      : talker
        ? `${personaName(talker)} is talking…`
        : cap.recording
          ? (cap.status?.text ?? '')
          : cap.phase === 'writing'
            ? 'Writing it down…'
            : hasDraft
              ? 'Yours to correct before it goes.'
              : streaming
                ? `Thinking… ${Math.max(0, Math.floor((tick - (thinkingSince.current ?? tick)) / 1000))} s`
                : 'Your turn.'

  // The main button does the one thing that makes sense now.
  const main: { label: string; onClick?: () => void; testid: string; key?: boolean; mic?: boolean } = !armed
    ? { label: 'Start', onClick: tap, testid: 'voice-start' }
    : paused
      ? { label: 'Resume', onClick: resume, testid: 'voice-resume' }
      : talker
        ? { label: 'Cut in', onClick: cutIn, testid: 'cut-in', key: true }
        : cap.recording
          ? { label: 'Finish', onClick: finishTurn, testid: 'voice-finish', key: true }
          : cap.phase === 'writing'
            ? { label: 'Writing…', testid: 'voice-wait' }
            : hasDraft
              ? { label: 'Send', onClick: sendDraft, testid: 'voice-send' }
              : streaming
                ? { label: 'Wait', testid: 'voice-wait' }
                : { label: 'Tap and talk', onClick: record, testid: 'voice-talk', key: true, mic: true }

  // On a keyboard: the space bar is the main button while it means talk, finish or cut in;
  // Send takes ⌘ or Ctrl with Enter, so a second press of the space bar cannot send by accident.
  const keys = useRef({ main, sendDraft })
  keys.current = { main, sendDraft }
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const { main, sendDraft } = keys.current
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return sendDraft()
      const el = e.target as HTMLElement | null
      if (e.code !== 'Space' || e.repeat || !main.key || el?.closest?.('textarea, input, select, button, a, [contenteditable]')) return
      e.preventDefault()
      main.onClick?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active])

  const icon = (d: string) => (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  // Every control in the bar is an icon with its word (Pavol, 20 Nov: "some text, some icons").
  const worded = 'flex min-h-11 w-12 shrink-0 flex-col items-center justify-center text-marble-200 hover:text-marble-50 disabled:text-marble-400'
  const word = (w: string) => <span className="sc text-[17px] leading-[20px]">{w}</span>

  if (!hasMic) return null
  if (!on)
    return (
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={tap} aria-pressed={false} data-testid="talk" className="slab slab-off flex-1 gap-2">
            <MicIcon />
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

  const myTurn = active && !paused && !talker
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
                    className="flex min-h-11 w-full items-baseline gap-3 py-1 text-left text-[17px] leading-[22px] text-marble-200 hover:text-marble-50"
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
            <span
              role="status"
              data-testid="talk-status"
              className={`text-[18px] italic leading-[23px] ${cap.recording ? '' : 'truncate'} ${cap.recording && cap.status?.tone === 'bad' ? 'text-clay-400' : 'text-marble-200'}`}
            >
              {status}
            </span>
          </button>
          {timing && lastTurn && (
            <p data-testid="voice-timing" className="t-fine">
              {lastTurn}
            </p>
          )}
          {missed && active && !paused && (
            <p data-testid="voice-missed" className="flex items-center gap-2 text-[17px] leading-[23px] text-marble-400">
              Voice did not load. The text is above.
              <button type="button" onClick={hearAgain} className="text-btn min-h-11 shrink-0 whitespace-nowrap px-3 text-marble-200">
                Tap to hear
              </button>
            </p>
          )}
          {problem && (
            <p role="alert" data-testid="talk-problem" className="t-body mt-1 border-l-2 border-clay-500 pl-4">
              {problem}
            </p>
          )}
          {/* His turn: his words as text, his to correct; under them the candle and the thread while it records. */}
          {myTurn && (cap.phase !== 'idle' || hasDraft || !streaming) && (
            <>
              <label htmlFor="voice-draft" className="sr-only">
                Your turn, as text. Correct it before it goes.
              </label>
              <textarea
                id="voice-draft"
                data-testid="voice-draft"
                rows={1}
                value={draft}
                onChange={(e) => setText(e.target.value)}
                placeholder="Your words are set here as you speak. You can also type."
                className="field mt-1 max-h-32 resize-none overflow-y-auto [field-sizing:content]"
              />
              <CapturePanel cap={cap} size={60} sentence={false} className="mt-1" />
              {hasDraft && cap.phase === 'idle' && (
                <button type="button" onClick={record} data-testid="voice-more" className="text-btn flex items-center gap-2">
                  <MicIcon />
                  Add more by voice
                </button>
              )}
            </>
          )}
          <div className="mt-1 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label="Back to the previous question"
              disabled={!active || floors.length < 2}
              onClick={() => steer(`Let's go back to the previous question: "${floors[floors.length - 2]}"`)}
              className={worded}
            >
              {icon('M7 6v12M18 6l-8 6 8 6z')}
              {word('Back')}
            </button>
            <button
              type="button"
              aria-pressed={paused}
              data-testid="voice-pause"
              disabled={!active}
              onClick={paused ? resume : pause}
              className={worded}
            >
              {paused ? icon('M8 5l11 7-11 7z') : icon('M9 5v14M15 5v14')}
              {word('Pause')}
            </button>
            <button
              type="button"
              data-testid={main.testid}
              disabled={!main.onClick}
              onClick={main.onClick}
              aria-keyshortcuts={main.key ? 'Space' : main.testid === 'voice-send' ? 'Meta+Enter Control+Enter' : undefined}
              className="slab min-w-20 flex-1 gap-2 px-2"
            >
              {main.mic && <MicIcon />}
              {main.label}
            </button>
            <button
              type="button"
              aria-label="Next question"
              disabled={!active || !floors.length}
              onClick={() => steer("Let's move on to the next question.")}
              className={worded}
            >
              {icon('M17 6v12M6 6l8 6-8 6z')}
              {word('Next')}
            </button>
            <button type="button" aria-label="End voice" data-testid="talk" aria-pressed={true} onClick={() => onChange(false)} className={worded}>
              {icon('M6 6l12 12M18 6L6 18')}
              {word('End')}
            </button>
          </div>
          <p className="t-fine mt-1 hidden text-center md:block">Space bar: talk, finish, cut in. ⌘ or Ctrl with Enter: send.</p>
        </div>
      </section>
    </>
  )
}
