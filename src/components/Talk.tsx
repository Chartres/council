import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cancel, FACILITATOR_VOICE, speak } from '@/components/Listen'
import { personaName } from '@/content/personas'
import { unlock } from '@/domain/tts'
import type { Item } from '@/domain/mastermind'
import { sentenceChunker } from '@/domain/sentences'
import { personaVoice, recognitionCtor, type Recognition } from '@/domain/speech'

// Talk mode (council-v4.3.md "Talk mode"): a hands-free room. The mic stays open; a pause
// sends what was heard as a voice turn; the adviser's answer is spoken sentence by sentence
// as it streams; two words over the audio stop it and start the next message.

export const TALK_STORAGE = 'council:talk'
/** The pause that ends a spoken message here; the intake's dictation keeps 2,500 ms. */
export const TALK_SILENCE_MS = 1200
/** Words heard over the audio that count as cutting in, not a cough. */
const BARGE_IN_WORDS = 2
/** After an engine error (network, aborted, no-speech) wait this long before listening again. */
export const RETRY_MS = 1000
const FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture']
/** After the room goes quiet, its own voice can still arrive from the recogniser this late. */
export const ECHO_GRACE_MS = 4000
/** Share of the heard words that must be the room's recent words, in order, to count as echo. */
const ECHO_SHARE = 0.75
/** Lines remembered for the echo check. */
const ECHO_LINES = 8

const words = (t: string) => t.split(/\s+/).filter(Boolean).length
const tokens = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .split(' ')
    .filter(Boolean)

/**
 * On speakerphone the mic hears the adviser. True when `heard` is mostly `said` coming back:
 * the longest run of heard words found in order (gaps allowed, for misheard words) covers
 * ECHO_SHARE of what was heard. A cut-in ("wait, no") shares little with the room's words.
 */
export function isEcho(heard: string, said: string[]): boolean {
  const h = tokens(heard)
  if (!h.length) return false
  const s = tokens(said.join(' '))
  // Longest common subsequence, one row at a time.
  let prev = new Array<number>(s.length + 1).fill(0)
  for (const w of h) {
    const row = [0]
    for (let j = 1; j <= s.length; j++) row[j] = w === s[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1])
    prev = row
  }
  return prev[s.length] / h.length >= ECHO_SHARE
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
  const said = useRef<string[]>([]) // the room's last lines, for the echo check
  const quietAt = useRef(0) // when the room last stopped talking
  /** While the room talks any match is echo; just after, only a longer one (a short answer
   *  to the question may well reuse its words). */
  const echoOf = (heard: string) =>
    (queued.current > 0 || (Date.now() - quietAt.current < ECHO_GRACE_MS && words(heard) >= 3)) &&
    isEcho(heard, said.current)
  const live = useRef({ active, streaming, onSay, onChange })
  live.current = { active, streaming, onSay, onChange }

  const voice = (text: string, speaker: string) => {
    if (muted.current) return
    queued.current += 1
    said.current = [...said.current, text].slice(-ECHO_LINES)
    if (speaker !== 'facilitator') setTalker(speaker)
    const done = () => {
      queued.current = Math.max(0, queued.current - 1)
      if (!queued.current) {
        quietAt.current = Date.now()
        setTalker(null)
      }
    }
    speak(text, speaker === 'facilitator' ? FACILITATOR_VOICE : personaVoice(speaker), done, speaker)
  }

  const hush = () => {
    cancel()
    queued.current = 0
    quietAt.current = Date.now()
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

  const listen = () => {
    if (!Ctor || rec.current) return
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    let offset = 0 // results before this index were already sent
    let seen = 0
    let heard = ''
    let echo = false // these words came while the room was (or had just been) talking, and match it
    let error: string | null = null
    const flush = () => {
      clearTimeout(timer.current)
      offset = seen
      const text = heard
      heard = ''
      const wasEcho = echo
      echo = false
      if (rec.current !== r || !text) return
      // The adviser's own voice through the speaker is not her message.
      if (wasEcho) return
      // A cough or one word over the audio is not a message.
      if (queued.current && words(text) < BARGE_IN_WORDS) return
      send(text)
    }
    r.onresult = (e) => {
      seen = e.results.length
      let t = ''
      for (let i = offset; i < seen; i++) t += ` ${e.results[i][0]?.transcript ?? ''}`
      heard = t.replace(/\s+/g, ' ').trim()
      echo = echoOf(heard)
      if (queued.current && !echo && words(heard) >= BARGE_IN_WORDS) {
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
      if (error && FATAL.includes(error)) return live.current.onChange(false)
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
  useEffect(() => () => (close(), cancel()), [])

  // Words that finished while the group was answering go as soon as it is done.
  useEffect(() => {
    if (streaming || !held.current) return
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
    unlock() // inside the tap: the shared player may speak from now on (iOS)
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
        : 'Listening…'

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        {Ctor && (
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
      {Ctor && on && (
        <p role="status" data-testid="talk-status" className="mt-2 text-[15px] leading-[23px] text-marble-300">
          {status}
        </p>
      )}
    </div>
  )
}
