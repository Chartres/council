import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addWords, FloorLamp, micAvailable, micProblem, MicIcon, useCapture } from '@/components/Capture'
import { cancel, speak } from '@/components/Listen'
import { personaName } from '@/content/personas'
import { primeMic } from '@/domain/capture'
import { floorStatus } from '@/domain/floor'
import { unlock } from '@/domain/tts'
import type { Item } from '@/domain/mastermind'
import { mayQuote, rest, sentenceAt, sentenceChunker, sentencesOf } from '@/domain/sentences'
import { recognitionCtor, VOICE } from '@/domain/speech'
import { serverEars } from '@/domain/stt'
import { keyAction } from '@/analytics'
import { describeTurn, turnClock } from '@/domain/voiceTiming'

// The floor (Pavol, 20 Nov 2026, option A of lab/one-voice): the one place to speak in a
// conversation. One bar at the bottom holds the candle and its thread, one status line and the
// main button; his words appear as a dashed message in the conversation while he speaks, and a
// tap on it corrects them (the only text field, and only while he edits). Typing uses the same
// draft. Nothing is sent until he taps Send.
// Read aloud (the `council:talk` switch, "Talk" before 21 Nov) makes it a room: each adviser's
// answer is read sentence by sentence as it streams, the sentence being read is marked on
// screen, the mic opens when the room goes quiet, and Cut in stops an adviser and opens it.
// The mic is shut while an adviser speaks, so a phone plays through its speaker and the room's
// own voice is not written down as his.

export const TALK_STORAGE = 'council:talk'

/** The sentence being read: its item and text; `stopped` once he cut in there. */
export type Now = { index: number; text: string; stopped?: boolean }

type Line = { text: string; speaker: string; index: number; group: string }

export function Talk({
  on,
  onChange,
  items,
  streaming,
  onSay,
  onQuiet,
  timing = false,
  onNow,
  slot,
  replyTo = null,
  onReplyClear,
  notes,
}: {
  /** Read aloud. */
  on: boolean
  onChange: (on: boolean) => void
  items: Item[]
  streaming: boolean
  /** Send his words; `voice` when read aloud is on (one adviser answers, briefly). */
  onSay: (text: string, voice: boolean) => void
  /** Read aloud switched off mid-answer. */
  onQuiet?: () => void
  /** Admins see each turn's wait to the first word under the status line. */
  timing?: boolean
  /** The line being read, for the screen to mark; null when quiet. */
  onNow?: (now: Now | null) => void
  /** Where in the conversation his draft is set (the end of the list). */
  slot?: HTMLElement | null
  /** The adviser his next words answer, by name. */
  replyTo?: string | null
  onReplyClear?: () => void
  /** Marks (Agree, Push back) waiting to go with his next message. */
  notes?: { count: number; over: boolean; length: number; max: number; onClear: () => void }
}) {
  const [hasMic] = useState(micAvailable)
  // Names this floor's messages for the speaker queue, which outlives a conversation.
  const room = useId()
  const [ears] = useState<'browser' | 'server'>(() => (serverEars(!!recognitionCtor()) ? 'server' : 'browser'))
  const [problem, setProblem] = useState<string | null>(null)
  // Remembered as on is not enough: the mic and the speaker wait for a tap on this page.
  const [armed, setArmed] = useState(false)
  const active = on && armed
  const [talker, setTalker] = useState<string | null>(null)
  const [now, setNowState] = useState<Now | null>(null)
  const queued = useRef(0) // lines handed to the speaker and not yet finished
  const muted = useRef(false) // cut in: the rest of this answer stays on screen, unspoken
  const handled = useRef(items.length) // what was on screen before read aloud is not read
  // The contribution being read as it streams: what came in, what was said, and whether a
  // sentence that may quote is waiting for the checked text.
  const chunk = useRef<{ index: number; seen: string; next: ReturnType<typeof sentenceChunker>; said: string[]; hold: boolean } | null>(null)
  const held = useRef('') // words sent while the group was still answering
  const [isHeld, setHeld] = useState(false)
  const clock = useRef(turnClock()).current
  const [lastTurn, setLastTurn] = useState<string | null>(null)
  // Paused: the room holds. Lines that were queued or arrive meanwhile wait in `pending` and are
  // read from the first unfinished one on resume; the mic stays shut. A line that did not load
  // pauses the room there (`missed`), rather than reading on or switching voice mid-message.
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const [missed, setMissed] = useState<string | null>(null)
  const pending = useRef<Line[]>([])
  const skipping = useRef(false) // after Back or Next: the old answer's tail is not read
  const mounted = useRef(true)
  const live = useRef({ active, streaming, onSay, onChange, onNow })
  live.current = { active, streaming, onSay, onChange, onNow }
  const setNow = (n: Now | null) => {
    setNowState(n)
    live.current.onNow?.(n)
  }

  // His turn, as text. Nothing goes until Send.
  const [draft, setDraft] = useState('')
  const draftRef = useRef('')
  const setText = (t: string) => {
    draftRef.current = t
    setDraft(t)
  }
  const [editing, setEditingState] = useState(false)
  const editingRef = useRef(false)
  const setEditing = (e: boolean) => {
    editingRef.current = e
    setEditingState(e)
  }
  const cap = useCapture({
    talk: true,
    onFail: (reason) => {
      setProblem(micProblem(reason))
      live.current.onChange(false)
    },
  })
  const capRef = useRef(cap)
  capRef.current = cap
  // From Finish to the last part landing: how long the gateway took to write it down (stt_ms).
  const finishedAt = useRef<number | null>(null)
  const wroteMs = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (cap.phase !== 'idle' || finishedAt.current === null) return
    wroteMs.current = Date.now() - finishedAt.current
    finishedAt.current = null
  }, [cap.phase])

  /** His turn may open by itself: read aloud on, nobody speaking, the group not answering. */
  const herTurn = () => {
    const { active, streaming } = live.current
    return mounted.current && active && !pausedRef.current && !queued.current && (!streaming || muted.current)
  }
  /** The room went quiet: the mic opens, unless words or an open editor wait for him. */
  const openMic = () => {
    if (!herTurn() || draftRef.current.trim() || editingRef.current) return
    record()
  }
  /** Every piece is added to what is there: a correction he made is not overwritten. */
  const record = () => {
    setEditing(false)
    finishedAt.current = null
    capRef.current.start((piece) => setText(addWords(draftRef.current, piece)))
  }
  const shutMic = () => {
    if (capRef.current.busy()) void capRef.current.finish()
  }

  /** A voice turn's question is its adviser's own (one adviser, no facilitator line). */
  const floorVoice = (i: number): { speaker: string; group: string } => {
    let one: { speaker: string; index: number } | null = null
    for (let j = i - 1; j >= 0 && items[j]?.kind !== 'user'; j--) {
      const it = items[j]!
      if (it.kind === 'facilitator') return { speaker: 'facilitator', group: `${room}f${i}` }
      if (it.kind === 'contribution') {
        if (one) return { speaker: 'facilitator', group: `${room}f${i}` }
        one = { speaker: it.speaker, index: j }
      }
    }
    return one ? { speaker: one.speaker, group: `${room}m${one.index}` } : { speaker: 'facilitator', group: `${room}f${i}` }
  }

  /** Hold the room at a line: the voice stops, the mic shuts, that line and the rest wait. */
  const hold = (why: string | null) => {
    pausedRef.current = true
    setPaused(true)
    setMissed(why)
    clock.reset() // a held turn is not timed: the wait would be his
    cancel()
    queued.current = 0
    setTalker(null)
    setNow(null)
    shutMic()
  }

  const voice = (line: Line, again = false) => {
    if (muted.current && !again) return
    pending.current.push(line)
    if (pausedRef.current) return
    shutMic()
    queued.current += 1
    if (line.speaker !== 'facilitator') setTalker(line.speaker)
    clock.firstLine()
    const done = () => {
      pending.current = pending.current.filter((p) => p !== line)
      queued.current = Math.max(0, queued.current - 1)
      if (queued.current) return
      setTalker(null)
      setNow(null)
      openMic()
    }
    speak(
      line.text,
      VOICE,
      done,
      line.speaker,
      (via) => {
        if (!mounted.current) return
        setNow(line.index >= 0 ? { index: line.index, text: line.text } : null)
        const t = clock.audioStarted(via, ears)
        if (!t) return
        keyAction('voice_turn', t)
        setLastTurn(describeTurn(t))
      },
      // The line did not load twice over: the room holds there, in this voice, until he taps.
      () => mounted.current && hold(personaName(line.speaker)),
      line.group,
    )
  }

  const hush = (stopped = false) => {
    clock.reset()
    cancel()
    queued.current = 0
    pending.current = []
    setTalker(null)
    setNow(stopped && now ? { ...now, stopped: true } : null)
  }

  /** Carry on from the first line that had not finished; with none left, it is his turn. */
  const resume = () => {
    pausedRef.current = false
    setPaused(false)
    setMissed(null)
    const left = pending.current
    pending.current = []
    if (left.length) unlock() // inside the tap (iOS); the mic does not open in this tap
    for (const p of left) voice(p, true)
    openMic()
  }

  /** Back / Next / the question list: his words to the facilitator, plainly. */
  const steer = (text: string) => {
    pausedRef.current = false
    setPaused(false)
    setMissed(null)
    hush()
    shutMic()
    muted.current = true
    skipping.current = true
    send(text, true)
  }

  const send = (text: string, wasHeld = false) => {
    if (live.current.streaming) {
      held.current = `${held.current} ${text}`.trim()
      setHeld(true)
      return
    }
    muted.current = false
    setNow(null)
    if (!wasHeld) clock.sent(Date.now(), null, ears === 'server' ? wroteMs.current : undefined)
    else clock.reset()
    wroteMs.current = undefined
    live.current.onSay(text, live.current.active)
  }

  /** Send: his words, as he left them. The only way a turn is sent from the floor. */
  const sendDraft = () => {
    const text = draftRef.current.trim()
    if ((!text && !notes?.count) || capRef.current.phase !== 'idle' || notes?.over) return
    setText('')
    setEditing(false)
    send(text)
  }

  /** Finish: the recording ends, the turn does not. Focus leaves the button, which is about to
   *  read "Send": a second press of the space bar must not send words he has not looked at. */
  const finishTurn = () => {
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    finishedAt.current = Date.now()
    void capRef.current.finish()
  }

  /** Stop the room and open the mic now, even mid-answer. What he then sends waits for the
   *  answer to finish. The sentences not yet read stay grey on screen. */
  const cutIn = () => {
    muted.current = true
    hush(true)
    if (pausedRef.current) {
      pausedRef.current = false
      setPaused(false)
      setMissed(null)
    }
    record()
  }

  /** Tap the draft: correct it. Mid-recording that finishes the recording first. */
  const edit = () => {
    if (capRef.current.recording) finishTurn()
    setEditing(true)
  }

  // Read aloud on: his turn opens (already started inside the tap). Off: the room stops; his
  // draft stays on the floor.
  useEffect(() => {
    if (active) return openMic()
    clock.reset()
    pausedRef.current = false
    setPaused(false)
    setMissed(null)
    pending.current = []
    skipping.current = false
    if (queued.current) hush()
    held.current = ''
    setHeld(false)
    muted.current = false
    if (chunk.current) onQuiet?.()
  }, [active])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancel()
    }
  }, [])

  // Voice out. While a contribution streams, each finished sentence is read, until one that may
  // quote: the gateway checks those when the turn is in, and may cut them. From there the checked
  // text, the one on screen, is read in order (Pavol, 20 Nov: "read one sentence, skipped, then
  // read something else").
  useEffect(() => {
    if (!active) {
      handled.current = items.length
      chunk.current = null
      return
    }
    for (let i = handled.current; i < items.length; i++) {
      const it = items[i]!
      if (skipping.current) {
        if (it.kind === 'user') skipping.current = false
        handled.current = i + 1
        chunk.current = null
        continue
      }
      if (it.kind === 'contribution') {
        if (chunk.current?.index !== i) chunk.current = { index: i, seen: '', next: sentenceChunker(), said: [], hold: false }
        const c = chunk.current
        const line = (text: string) => ({ text, speaker: it.speaker, index: i, group: `${room}m${i}` })
        if (it.streaming) {
          if (!c.hold && it.text.startsWith(c.seen)) {
            const out = c.next.push(it.text.slice(c.seen.length))
            c.seen = it.text
            for (const s of out) {
              if (mayQuote(s)) {
                c.hold = true
                break
              }
              c.said.push(s)
              voice(line(s))
            }
          } else c.hold = true
          return
        }
        for (const s of rest(c.said, it.text)) voice(line(s))
        chunk.current = null
      } else if (it.kind === 'floor') voice({ text: it.question, index: i, ...floorVoice(i) })
      else if (it.kind === 'facilitator') voice({ text: it.text, speaker: 'facilitator', index: i, group: `${room}f${i}` })
      handled.current = i + 1
    }
    if (!streaming) clock.unanswered()
  }, [active, items, streaming])

  // A new answer begins: a cut-in belonged to the last one (before 21 Nov it lasted until his
  // next spoken Send, so an answer to a chip was never read). Words sent while the group was
  // answering go as soon as it is done.
  useEffect(() => {
    if (streaming) {
      muted.current = false
      shutMic()
      return
    }
    if (!held.current) {
      if (active && !queued.current) openMic()
      return
    }
    const text = held.current
    held.current = ''
    setHeld(false)
    send(text, true)
  }, [streaming])

  const tap = () => {
    if (active) return onChange(false)
    setProblem(null)
    // Safari plays only from an element a tap has played, so the tap unlocks it. On Android the
    // silent clip and the silent browser line are not played in the tap that opens the mic: on
    // Firefox there they are the suspects for the mic going muted (20 Nov, lost_muted 4 s after
    // Talk opened). Android plays later lines without the unlock (sticky activation).
    // ponytail: suspected cause, not reproduced on a phone; the mute log now carries the track state.
    const android = /Android/.test(navigator.userAgent)
    if (!android) unlock()
    setArmed(true)
    if (!on) onChange(true)
    if (!queued.current && !streaming && !draftRef.current.trim()) record()
    else {
      primeMic()
      if (android) unlock() // no mic is opened in this tap
    }
  }

  const floors = items.flatMap((it) => (it.kind === 'floor' ? [it.question] : []))
  const [list, setList] = useState(false)
  const hasDraft = !!draft.trim()
  const last = items.at(-1)
  const answering = streaming && last?.kind === 'contribution' ? personaName(last.speaker) : null
  const reading = (() => {
    if (!now || now.stopped) return null
    const it = items[now.index]
    const text = it?.kind === 'contribution' ? it.text : it?.kind === 'floor' ? it.question : null
    const k = text ? sentenceAt(text, now.text) : -1
    return text && k >= 0 ? { k: k + 1, n: sentencesOf(text).length } : null
  })()
  const capStatus = cap.recording ? cap.status : null
  const status = floorStatus({
    waiting: on && !armed,
    paused,
    missed,
    talker: talker ? personaName(talker) : null,
    reading,
    streaming,
    answering,
    recording: cap.recording,
    mic: capStatus ? { tone: capStatus.tone, text: capStatus.text } : null,
    pending: cap.pending,
    draft: hasDraft,
    held: isHeld,
  })

  type Btn = { label: string; onClick?: () => void; testid: string; key?: boolean; mic?: boolean; second?: boolean }
  const typeInstead = () => setEditing(true)
  // One filled action per state; a second, outlined, where the sample has one.
  const [main, other]: [Btn, Btn | null] = on && !armed
    ? [{ label: 'Start', onClick: tap, testid: 'voice-start' }, null]
    : paused
      ? [{ label: missed ? 'Tap to hear' : 'Resume', onClick: resume, testid: 'voice-resume' }, null]
      : cap.recording
        ? [{ label: 'Finish', onClick: finishTurn, testid: 'voice-finish', key: true }, null]
        : talker || (streaming && !hasDraft && !editing)
          ? [
              { label: 'Cut in', onClick: cutIn, testid: 'cut-in', key: true, mic: true, second: true },
              active && talker ? { label: 'Pause', onClick: () => hold(null), testid: 'voice-pause', second: true } : null,
            ]
          : cap.phase === 'writing'
            ? [{ label: 'Send', testid: 'voice-wait' }, null]
            : hasDraft || editing || notes?.count
              ? [
                  { label: 'Send', onClick: sendDraft, testid: 'voice-send' },
                  hasMic ? { label: 'Add more', onClick: record, testid: 'voice-more', mic: true, second: true } : null,
                ]
              : hasMic
                ? [{ label: 'Talk', onClick: record, testid: 'voice-talk', key: true, mic: true }, null]
                : [{ label: 'Write', onClick: typeInstead, testid: 'voice-type' }, null]
  const sendable = main.testid !== 'voice-send' || ((hasDraft || !!notes?.count) && !notes?.over)

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

  const button = (b: Btn, wide: boolean) => (
    <button
      type="button"
      data-testid={b.testid}
      disabled={!b.onClick || (b === main && !sendable)}
      onClick={b.onClick}
      aria-keyshortcuts={b.key ? 'Space' : b.testid === 'voice-send' ? 'Meta+Enter Control+Enter' : undefined}
      className={`slab ${b.second ? 'slab-off' : ''} ${wide ? 'flex-[3]' : 'flex-[2]'} min-w-0 gap-2 whitespace-nowrap px-3`}
    >
      {b.mic && <MicIcon />}
      {b.label}
    </button>
  )
  const small = 'text-btn min-h-11 px-2 text-[17px] text-marble-300 hover:text-marble-50 disabled:text-marble-400'

  const showDraft = hasDraft || editing || cap.recording || cap.pending > 0 || !!cap.interim
  // His words stay in view above the floor while they grow.
  const draftBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (showDraft) draftBox.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [showDraft, draft, cap.interim, editing])
  const draftView = showDraft && (
    <div ref={draftBox} data-testid="draft" className="mine draft ml-auto max-w-[88%] scroll-mb-72">
      {editing && !cap.recording ? (
        <>
          <label htmlFor="voice-draft" className="sr-only">
            Your words. Correct them before they go.
          </label>
          <textarea
            id="voice-draft"
            data-testid="voice-draft"
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => !draftRef.current.trim() && setEditing(false)}
            placeholder={replyTo ? `Your answer to ${replyTo}` : 'Your answer, or push back'}
            className="block w-full resize-none bg-transparent text-[19px] leading-[27px] text-marble-50 [field-sizing:content] placeholder:text-marble-400 focus-visible:shadow-none"
          />
        </>
      ) : (
        <button type="button" onClick={edit} data-testid="draft-text" aria-label={hasDraft ? `Your words: ${draft}. Tap to correct.` : 'Your words will appear here'} className="block w-full text-left text-[19px] leading-[27px] text-marble-50">
          {draft}
          {cap.interim && <span className="italic text-marble-300"> {cap.interim}</span>}
          {cap.recording && !cap.pending && <span className="italic text-marble-400"> …</span>}
          {cap.pending > 0 && <span className="italic text-marble-400"> {cap.recording ? "writing it down…" : "writing the last part…"}</span>}
        </button>
      )}
    </div>
  )

  const lampMode = cap.recording && cap.meter ? 'voice' : talker ? 'breath' : 'still'

  return (
    <>
      {slot && draftView ? createPortal(draftView, slot) : null}
      <section
        aria-label="The floor"
        data-testid="voice-bar"
        className="floor fixed inset-x-0 bottom-0 z-30 bg-ink-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto max-w-xl px-4 pt-2 pb-2">
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
          {replyTo && (
            <p data-testid="replying" className="flex items-center justify-between gap-2 text-[17px] leading-[23px] text-marble-200">
              <span className="min-w-0 truncate">
                <span className="rubric">Answering</span> {replyTo}
              </span>
              <button type="button" onClick={onReplyClear} aria-label={`Stop answering ${replyTo}`} className={`${small} shrink-0`}>
                ×
              </button>
            </p>
          )}
          <FloorLamp cap={cap} mode={lampMode}>
            <button
              type="button"
              aria-expanded={list}
              disabled={!floors.length || !active}
              onClick={() => setList((v) => !v)}
              data-testid="voice-where"
              className="-my-2.5 flex min-h-11 w-full items-center gap-2 py-2.5 text-left disabled:cursor-default"
            >
              {active && <span className="t-label shrink-0 text-candle-300">{floors.length ? `Question ${floors.length}` : 'Opening'}</span>}
              <span
                role="status"
                data-testid="talk-status"
                className={`min-w-0 text-[18px] italic leading-[23px] ${status.tone === 'bad' ? 'text-clay-400' : 'text-marble-200'}`}
              >
                {status.text}
              </span>
            </button>
          </FloorLamp>
          {timing && lastTurn && (
            <p data-testid="voice-timing" className="t-fine">
              {lastTurn}
            </p>
          )}
          {(problem || cap.problem) && (
            <p role="alert" data-testid="talk-problem" className="t-body mt-1 border-l-2 border-clay-500 pl-4">
              {problem ?? cap.problem}
            </p>
          )}
          {!!notes?.count && (
            <p data-testid="notes-tray" role={notes.over ? 'alert' : undefined} className={`flex items-center justify-between gap-2 text-[17px] leading-[23px] ${notes.over ? 'text-clay-400' : 'text-marble-300'}`}>
              {notes.over
                ? `Too long for one message (${notes.length} of ${notes.max} characters). Shorten your words.`
                : `${notes.count === 1 ? 'Your mark goes' : `Your ${notes.count} marks go`} with your next message.`}
              <button type="button" className={`${small} shrink-0`} onClick={notes.onClear}>
                Clear
              </button>
            </p>
          )}
          <div className="mt-1 flex gap-2">
            {other && button(other, false)}
            {button(main, !!other)}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between">
            <span className="flex">
              {!hasDraft && !editing && !cap.recording && hasMic && (
                <button type="button" onClick={typeInstead} data-testid="type-instead" className={small}>
                  Type instead
                </button>
              )}
            </span>
            <span className="flex">
              {active && (
                <>
                  <button
                    type="button"
                    aria-label="Back to the previous question"
                    disabled={floors.length < 2}
                    onClick={() => steer(`Let's go back to the previous question: "${floors[floors.length - 2]}"`)}
                    className={small}
                  >
                    Back
                  </button>
                  <button type="button" aria-label="Next question" disabled={!floors.length} onClick={() => steer("Let's move on to the next question.")} className={small}>
                    Next
                  </button>
                </>
              )}
              {hasMic && (
                <button type="button" data-testid="talk" aria-pressed={on} onClick={on ? () => onChange(false) : tap} className={small}>
                  {on ? 'Stop reading aloud' : 'Read aloud'}
                </button>
              )}
            </span>
          </div>
          <p className="t-fine hidden text-center md:block">Space bar: talk, finish, cut in. ⌘ or Ctrl with Enter: send.</p>
        </div>
      </section>
    </>
  )
}
