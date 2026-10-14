import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cancel, FACILITATOR_VOICE, speak } from '@/components/Listen'
import { personaName } from '@/content/personas'
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
// 10 ms of silence. iOS only lets audio play after a tap has played something.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='
const FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture']

const words = (t: string) => t.split(/\s+/).filter(Boolean).length

export function Talk({
  on,
  onChange,
  items,
  streaming,
  onSay,
  children,
}: {
  on: boolean
  onChange: (on: boolean) => void
  items: Item[]
  streaming: boolean
  /** Send a voice turn. */
  onSay: (text: string) => void
  /** Sits beside the control (the Listen chip). */
  children?: ReactNode
}) {
  const Ctor = recognitionCtor()
  const [talker, setTalker] = useState<string | null>(null)
  const queued = useRef(0) // lines handed to the speaker and not yet finished
  const muted = useRef(false) // talked over: the rest of this turn stays on screen, unspoken
  const handled = useRef(items.length) // what was on screen before Talk is not read
  const chunk = useRef<{ index: number; seen: number; next: ReturnType<typeof sentenceChunker> } | null>(null)
  const rec = useRef<Recognition | null>(null)
  const held = useRef('') // words that finished while the group was still answering
  const live = useRef({ on, streaming, onSay, onChange })
  live.current = { on, streaming, onSay, onChange }

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
    let silence: ReturnType<typeof setTimeout> | undefined
    let fatal = false
    const flush = () => {
      clearTimeout(silence)
      offset = seen
      const text = heard
      heard = ''
      if (text) send(text)
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
      clearTimeout(silence)
      silence = setTimeout(flush, TALK_SILENCE_MS)
    }
    r.onerror = (e) => {
      fatal = FATAL.includes(e?.error ?? '')
    }
    r.onend = () => {
      if (rec.current !== r) return
      flush()
      rec.current = null
      // ponytail: engines end on their own (Chrome after ~8 s of quiet); listen again while on.
      if (fatal) live.current.onChange(false)
      else if (live.current.on) listen()
    }
    rec.current = r
    r.start()
  }

  const close = () => {
    const r = rec.current
    rec.current = null
    r?.abort()
  }

  // On: listen (already started inside the tap where there was one). Off: mic and audio stop.
  useEffect(() => {
    if (on) return listen()
    close()
    if (queued.current) hush() // only what Talk queued: Listen's narration is not ours to stop
    held.current = ''
  }, [on])
  useEffect(() => () => (close(), cancel()), [])

  // Words that finished while the group was answering go as soon as it is done.
  useEffect(() => {
    if (streaming || !held.current) return
    const text = held.current
    held.current = ''
    if (on) send(text)
  }, [streaming])

  // Voice out: each completed sentence of the growing contribution, then the floor question.
  useEffect(() => {
    if (!on) {
      handled.current = items.length
      chunk.current = null
      return
    }
    for (let i = handled.current; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'contribution') {
        if (chunk.current?.index !== i) chunk.current = { index: i, seen: 0, next: sentenceChunker() }
        const c = chunk.current
        // ponytail: assumes the final text extends what streamed (the gateway sends the same words).
        const out = c.next.push(it.text.slice(c.seen))
        c.seen = it.text.length
        if (!it.streaming) out.push(...c.next.flush())
        for (const s of out) voice(s, it.speaker)
        if (it.streaming) return
        chunk.current = null
      } else if (it.kind === 'floor') voice(it.question, 'facilitator')
      else if (it.kind === 'facilitator') voice(it.text, 'facilitator')
      handled.current = i + 1
    }
  }, [on, items])

  const tap = () => {
    if (on) return onChange(false)
    try {
      void new Audio(SILENT_WAV).play().catch(() => {})
    } catch {
      // No audio element: the transcript still works.
    }
    onChange(true)
    listen()
  }

  const status = talker ? `${personaName(talker)} is talking…` : streaming ? 'Thinking…' : 'Listening…'

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
