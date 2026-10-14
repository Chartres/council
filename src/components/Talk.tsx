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

const words = (t: string) => t.split(/\s+/).filter(Boolean).length

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
  const live = useRef({ active, streaming, onSay, onChange })
  live.current = { active, streaming, onSay, onChange }

  const voice = (text: string, speaker: string) => {
    if (muted.current) return
    queued.current += 1
    if (speaker !== 'facilitator') setTalker(speaker)
    const done = () => {
      queued.current = Math.max(0, queued.current - 1)
      if (!queued.current) setTalker(null)
    }
    speak(text, speaker === 'facilitator' ? FACILITATOR_VOICE : personaVoice(speaker), done, speaker)
  }

  const hush = () => {
    cancel()
    queued.current = 0
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
      let t = ''
      for (let i = offset; i < seen; i++) t += ` ${e.results[i][0]?.transcript ?? ''}`
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
