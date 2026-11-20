import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { useMastermind, type Item } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { keyAction } from '@/analytics'
import { ListenToggle, useListen, useNarration, usePref } from '@/components/Listen'
import { smooth, Talk, TALK_STORAGE, type Now } from '@/components/Talk'
import { Monogram } from '@/components/Monogram'
import { composedLength, composeMessage, quoteOf, type Note } from '@/domain/notes'
import { sentenceAt, sentencesOf } from '@/domain/sentences'
import { CouncilMap } from '@/components/CouncilMap'
import { SignInPanel } from '@/components/SignInPanel'
import { Quaestio } from '@/components/Quaestio'
import { Device } from '@/components/Furniture'
import { quaestio, verifiedLine } from '@/domain/quaestio'
import { BUSINESS_DISCLOSURE, DISCLOSURE, personaName } from '@/content/personas'
import { FAILURE_COPY, type Turn } from '@/domain/council'
import { humanDate } from '@/domain/dates'
import * as tts from '@/domain/tts'
import type { Control } from '@/domain/mastermind'

type Proposal = Extract<Item, { kind: 'proposal' }>

/** One screen per discussion: notes, a draft and the read-aloud place never carry across. */
export function ConversationScreen() {
  const { conversation } = useMastermind()
  return <ConversationView key={conversation?.localId ?? 'none'} />
}

function ConversationView() {
  const { go, isAdmin } = useCouncil()
  const { conversation, say, control, journal, continueDiscussion } = useMastermind()
  const { token } = useAuth()
  const [more, setMore] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  // Marks (Agree, Push back), by the contribution's index; they go with his next message
  // (Eyal, 29 Oct). A reply to one adviser goes at once (Eyal, feedback 533a9ad9).
  const [notes, setNotes] = useState<Record<number, Pick<Note, 'stance' | 'text'>>>({})
  const [replyTo, setReplyTo] = useState<number | null>(null)
  // Where the floor sets his draft: the end of the conversation.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const [listen, setListen] = useListen()
  const [talk, setTalk] = usePref(TALK_STORAGE, false)
  // The line being read aloud: marked in its message, and kept in view (Pavol, 8 Nov).
  const [now, setNow] = useState<Now | null>(null)
  useEffect(() => {
    if (now && !now.stopped) list.current?.children[now.index]?.scrollIntoView({ block: 'center', behavior: smooth() })
  }, [now?.index])
  // Where read-aloud starts when it comes on: the turn on screen; after Talk, nothing already heard.
  const readFrom = useRef<number | null>(null)
  const list = useRef<HTMLOListElement>(null)
  const turnStart = useRef(0)
  const items = conversation?.items
  const streaming = conversation?.streaming
  // Continued: what came before is the earlier sessions' record — shown, never read aloud again.
  const earlier = conversation?.earlier ?? 0

  // Spoken: the speaker's name, then the contribution (Eyal's voice rule). `current`: the first
  // turn after her last message — the turn on screen.
  const { turns, current } = useMemo(() => {
    const turns: Turn[] = []
    let current = 0
    for (const it of (items ?? []).slice(earlier)) {
      if (it.kind === 'user') current = turns.length
      else if (it.kind === 'contribution' && !it.streaming)
        turns.push({ persona: it.speaker, text: `${personaName(it.speaker)}. ${it.text}` })
      else if (it.kind === 'facilitator') turns.push({ persona: 'facilitator', text: it.text })
      else if (it.kind === 'floor') turns.push({ persona: 'facilitator', text: it.question })
    }
    return { turns, current }
  }, [items, earlier])
  // Talk switched off mid-answer: read-aloud skips that answer and starts after the stream.
  const [quiet, setQuiet] = useState(false)
  useEffect(() => {
    if (streaming || !quiet) return
    readFrom.current = turns.length
    setQuiet(false)
  }, [streaming, quiet])
  // The floor reads aloud while the discussion is open; Listen reads it once it has ended.
  // A past discussion is read on screen, never aloud: nothing there turns it on or off.
  useNarration(turns, null, listen && !conversation?.past && !quiet && !!conversation?.ended, readFrom.current ?? current)
  const onListen = (on: boolean) => {
    readFrom.current = null
    setListen(on)
  }
  const onTalk = (on: boolean) => {
    if (on) keyAction('talk_on')
    readFrom.current = on ? null : turns.length
    setTalk(on)
  }

  // The gateway voices advisers only inside this session; forget it on leaving.
  const sessionIdNow = conversation?.sessionId ?? null
  useEffect(() => {
    tts.setSession(sessionIdNow, token)
    return () => tts.setSession(null)
  }, [sessionIdNow, token])

  // Read from the start of what arrived: the first item of the newest turn goes to the top.
  // The opening turn needs no scroll; the question is pinned above it.
  useEffect(() => {
    if (streaming) turnStart.current = items?.length ?? 0
  }, [streaming])
  useEffect(() => {
    const i = turnStart.current
    if (i > 0 && (items?.length ?? 0) === i + 1)
      list.current?.children[i]?.scrollIntoView({ block: 'start', behavior: smooth() })
  }, [items?.length])

  if (!conversation) return null
  const { failure, ended, advisers, sessionId, roster, past = false } = conversation
  const spoken = [...new Set(conversation.items.flatMap((it) => (it.kind === 'contribution' ? [it.speaker] : [])))]
  const busy = streaming || !sessionId
  const run = (c: Control) => control(c)
  const decided = journal.entries.filter((e) => e.status !== 'proposal').length
  // While a proposal is open, Wrap up and Capture are its buttons; while one awaits a date, the reply steps aside.
  const openAt = conversation.items.reduce(
    (at, it, i) => (!past && i >= earlier && it.kind === 'proposal' && it.state === 'open' ? i : at),
    -1,
  )
  const committing =
    !replyOpen && !past && conversation.items.some((it, i) => i >= earlier && it.kind === 'proposal' && it.state === 'accepted')
  const floorOn = !past && !ended && !committing

  const noted = Object.entries(notes).flatMap(([i, n]) => {
    const it = conversation.items[Number(i)]
    return it?.kind === 'contribution' ? [{ ...n, speaker: it.speaker, quote: quoteOf(it.text) }] : []
  })
  const answered = replyTo !== null ? conversation.items[replyTo] : undefined
  const reply = answered?.kind === 'contribution' ? { speaker: answered.speaker, quote: quoteOf(answered.text) } : undefined
  /** His words with his marks in front, addressed to the adviser he answers; marks and reply are spent. */
  const compose = (text: string) => {
    if (noted.length) keyAction('noted', { count: noted.length, push: noted.filter((n) => n.stance === 'push').length })
    setNotes({})
    setReplyTo(null)
    return composeMessage(noted, text, personaName, reply)
  }
  const mark = (index: number, stance: Note['stance'] | null) =>
    setNotes((all) => {
      const { [index]: _gone, ...rest } = all
      return stance && all[index]?.stance !== stance ? { ...rest, [index]: { stance, text: '' } } : rest
    })

  return (
    <div className="mx-auto max-w-xl px-4 pb-12">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => go('start')} className="text-btn -ml-3 px-3 text-marble-400">
          ← Council
        </button>
        <button type="button" onClick={() => go('journal')} className="text-btn px-3 text-marble-400">
          {decided ? `Journal · ${decided}` : 'Journal'}
        </button>
      </div>

      <section aria-label="The question" className="mt-2">
        <p className="rubric">The question</p>
        <h1 className="t-display mt-2 text-balance">{conversation.intake?.goal ?? 'Open question'}</h1>
      </section>

      <ol ref={list} className="mt-12 space-y-6" data-testid="conversation">
        {conversation.items.map((it, i) => {
          const before = past || i < earlier
          return (
            <li key={i} className={`scroll-mt-20 ${before ? '' : 'rise'}`}>
              {i === earlier && earlier > 0 && (
                <p className="rubric mb-6 border-t border-ink-800 pt-6" data-testid="continued">
                  Continued
                </p>
              )}
              <ItemView
                item={it}
                index={i}
                speaking={now?.index === i ? now : undefined}
                inert={before}
                steer={!before && i === openAt ? { busy: !!busy, run } : undefined}
                react={
                  !before && !ended && it.kind === 'contribution' && !it.streaming && it.text.trim()
                    ? { mark: notes[i]?.stance, onMark: (s) => mark(i, s), onReply: () => setReplyTo(i), replying: replyTo === i }
                    : undefined
                }
              />
            </li>
          )
        })}
      </ol>
      {/* The floor sets his words here, as the last message, while he speaks or corrects them. */}
      <div ref={setSlot} className="mt-6 flex empty:hidden" />

      {streaming && !talk && (
        <p className="t-title mt-6 flex items-center gap-3 italic text-marble-200" role="status" data-testid="streaming">
          <Device size={28} flicker />
          The group is talking…
        </p>
      )}

      {failure === 'sign_in' && (
        <div className="mt-6">
          <SignInPanel reason={FAILURE_COPY.sign_in} />
        </div>
      )}
      {failure && failure !== 'sign_in' && (
        <p className="t-body mt-6 border-l-2 border-clay-500 pl-4" role="alert">
          {FAILURE_COPY[failure]}
        </p>
      )}

      {past ? (
        <div className="mt-10" data-testid="past">
          <button type="button" onClick={continueDiscussion} className="slab">
            Continue this discussion
          </button>
          <p className="mt-2 text-[17px] leading-[23px] text-marble-400">
            {advisers.map(personaName).join(', ')} pick it up where it stopped.
          </p>
        </div>
      ) : ended ? (
        <>
          <div className="mt-6 flex">
            <ListenToggle chip on={listen} onChange={onListen} />
          </div>
          {!streaming && (
            <button type="button" onClick={() => go('journal')} className="slab mt-6">
              Open the journal
            </button>
          )}
        </>
      ) : (
        <>
          {committing ? (
            <button
              type="button"
              aria-label="Reply instead"
              onClick={() => setReplyOpen(true)}
              className="mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-ink-850 text-marble-200 hover:bg-ink-800"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <Talk
              on={talk}
              onChange={onTalk}
              items={conversation.items}
              streaming={!!busy}
              // Back / Next / the question list go as they are: his marks and his reply wait.
              onSay={(text, voice, plain) => say(plain ? text : compose(text), voice ? { voice: true } : undefined)}
              onQuiet={() => setQuiet(true)}
              timing={isAdmin}
              onNow={setNow}
              slot={slot}
              replyTo={reply ? personaName(reply.speaker) : null}
              onReplyClear={() => setReplyTo(null)}
              notes={{ count: noted.length, onClear: () => setNotes({}) }}
              lengthOf={(words) => composedLength(noted, words, personaName, reply)}
            />
          )}

          <div role="group" aria-label="Steer the group" className="mt-6">
            <div className="flex flex-wrap gap-2 py-1">
              <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'disagree' })}>
                I disagree
              </button>
              <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'concrete' })}>
                Make this concrete
              </button>
              {openAt < 0 && (
                <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'wrap_up' })}>
                  Wrap up
                </button>
              )}
              <button type="button" aria-expanded={more} className="chip text-marble-400" onClick={() => setMore((m) => !m)}>
                {more ? 'Less' : 'More ›'}
              </button>
            </div>
            {more && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'pause' })}>
                  Pause
                </button>
                <select
                  aria-label="Go back to"
                  disabled={busy || !spoken.length}
                  value=""
                  onChange={(e) => e.target.value && run({ kind: 'back_to', speaker: e.target.value })}
                  className="chip"
                >
                  <option value="">Go back to…</option>
                  {spoken.map((id) => (
                    <option key={id} value={id}>
                      {personaName(id)}’s point
                    </option>
                  ))}
                </select>
                <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'test' })}>
                  What would we test?
                </button>
                {openAt < 0 && (
                  <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'capture' })}>
                    Capture that decision
                  </button>
                )}
                <LetExplore advisers={advisers} disabled={!!busy} onRun={run} />
              </div>
            )}
          </div>
        </>
      )}

      <p className="t-fine mt-12">
        {roster === 'business' ? BUSINESS_DISCLOSURE : DISCLOSURE}
      </p>
      {/* Room for the floor, so the last line is never under it. */}
      {floorOn && <div aria-hidden="true" style={{ height: 'calc(var(--floor-h, 18rem) + 1.5rem)' }} />}
    </div>
  )
}

function LetExplore({ advisers, disabled, onRun }: { advisers: string[]; disabled: boolean; onRun: (c: Control) => void }) {
  const [a, setA] = useState(advisers[0])
  const [b, setB] = useState(advisers[1] ?? advisers[0])
  if (advisers.length < 2) return null
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      className="min-h-10 bg-transparent font-semibold text-marble-50"
    >
      {advisers.map((id) => (
        <option key={id} value={id}>
          {personaName(id)}
        </option>
      ))}
    </select>
  )
  return (
    <span className="chip gap-1">
      Let {pick(a, setA, 'First adviser')} and {pick(b, setB, 'Second adviser')}
      <button
        type="button"
        disabled={disabled || a === b}
        onClick={() => onRun({ kind: 'let', a, b })}
        className="min-h-10 px-1 font-semibold text-marble-50 underline decoration-marble-500 underline-offset-[3px] disabled:opacity-40"
      >
        explore
      </button>
    </span>
  )
}

type Steer = { busy: boolean; run: (c: Control) => void }

/** What he can do with one adviser's message: answer it, or mark it for his next message. */
type Reactions = { mark?: Note['stance']; onMark: (s: Note['stance'] | null) => void; onReply: () => void; replying: boolean }

const MARK: Partial<Record<Note['stance'], string>> = { agree: 'You agree', push: 'You push back' }

function ItemView({
  item,
  index,
  steer,
  react,
  inert = false,
  speaking,
}: {
  item: Item
  index: number
  /** The sentence of this item being read aloud right now, if any. */
  speaking?: Now
  steer?: Steer
  react?: Reactions
  /** The record of an earlier session: shown, nothing to act on. */
  inert?: boolean
}) {
  switch (item.kind) {
    case 'facilitator':
      return (
        <p className="text-[17px] italic leading-[23px] text-marble-400" data-testid="facilitator">
          {item.text}
        </p>
      )
    case 'contribution':
      return <Contribution item={item} speaking={speaking} react={react} />
    case 'floor':
      return (
        <p className="t-display border-l-[3px] border-candle-500 pl-4 text-candle-200" data-testid="floor">
          <Spoken text={item.question} now={speaking} />
        </p>
      )
    case 'user':
      return (
        // His words: the ink-outlined note on the right, as his draft was before it went.
        <div data-testid="user" className="mine ml-auto max-w-[88%]">
          <p className="sr-only">You</p>
          <p className="t-body whitespace-pre-line text-marble-50">{item.text}</p>
        </div>
      )
    case 'proposal':
      return <ProposalCard item={item} index={index} steer={steer} inert={inert} />
  }
}

/** `text` as it is read aloud, the way a podcast transcript follows the voice: the sentence
 *  being read marked, those read in a lighter ink, those to come grey. After a cut-in it stops
 *  there: what was not read stays grey. */
function Spoken({ text, now }: { text: string; now?: Now }) {
  const k = now ? sentenceAt(text, now.text) : -1
  if (!now || k < 0) return <>{text}</>
  return (
    <>
      {sentencesOf(text).map((s, i) =>
        i === k && !now.stopped ? (
          <mark key={i} data-testid="now-speaking" className="now-reading">
            {s}{' '}
          </mark>
        ) : (
          <span key={i} data-read={i <= k ? 'done' : 'wait'} className={i <= k ? 'text-marble-300' : 'text-marble-400'}>
            {s}{' '}
          </span>
        ),
      )}
    </>
  )
}

/** One dot per sentence: read, being read, to come (Pavol picked them in lab/one-voice). */
function Dots({ text, now }: { text: string; now: Now }) {
  const k = sentenceAt(text, now.text)
  if (k < 0) return null
  return (
    <span aria-hidden="true" data-testid="sentence-dots" className="inline-flex gap-[5px] self-center">
      {sentencesOf(text).map((_, i) => (
        <i key={i} className={`block h-1.5 w-1.5 rounded-full ${i < k || (i === k && now.stopped) ? 'bg-marble-500' : i === k ? 'bg-candle-400' : 'bg-ink-700'}`} />
      ))}
    </span>
  )
}

/** Swipe a message right to answer it, as in a messenger. Only a touch or a pen that starts
 *  away from the screen's left edge (iOS Safari's back swipe and Android's back gesture start
 *  there) and moves sideways more than down; `touch-action: pan-y` keeps vertical scrolling the
 *  browser's own. A mouse uses the Reply button. */
const EDGE = 28
const SWIPE = 56
function Swipe({ onSwipe, children }: { onSwipe?: () => void; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  const g = useRef<{ x: number; y: number; id: number; on: boolean } | null>(null)
  const shift = (dx: number) => el.current && (el.current.style.transform = dx ? `translateX(${dx}px)` : '')
  if (!onSwipe) return <>{children}</>
  return (
    <div
      ref={el}
      data-testid="swipe"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || e.clientX < EDGE) return
        g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false }
      }}
      onPointerMove={(e) => {
        const s = g.current
        if (!s || s.id !== e.pointerId) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (!s.on) {
          if (Math.abs(dy) > 12 || dx < -12) return void (g.current = null)
          if (dx > 12 && dx > 2 * Math.abs(dy)) s.on = true
          else return
        }
        shift(Math.max(0, Math.min(dx, 96)) * 0.6)
      }}
      onPointerUp={(e) => {
        const s = g.current
        g.current = null
        shift(0)
        if (s?.on && e.clientX - s.x >= SWIPE) onSwipe()
      }}
      onPointerCancel={() => {
        g.current = null
        shift(0)
      }}
    >
      {children}
    </div>
  )
}

function Contribution({ item, speaking, react }: { item: Extract<Item, { kind: 'contribution' }>; speaking?: Now; react?: Reactions }) {
  const [menu, setMenu] = useState(false)
  const name = personaName(item.speaker)
  const pick = (f: () => void) => () => {
    setMenu(false)
    f()
  }
  return (
    <Swipe onSwipe={react?.onReply}>
      <div className={`flex gap-4 ${react?.replying ? 'replying' : ''}`} data-testid="contribution" data-streaming={item.streaming || undefined}>
        <Monogram id={item.speaker} />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-3">
            <span className="sc text-[20px] font-semibold text-marble-50" data-testid="speaker">
              {name}
            </span>
            {speaking && <Dots text={item.text} now={speaking} />}
            {item.confidence !== undefined && <span className="t-ref">confidence {item.confidence}</span>}
            {react && (
              <button
                type="button"
                aria-expanded={menu}
                aria-label={`Answer or mark ${name}`}
                onClick={() => setMenu((m) => !m)}
                className="text-btn -my-3 ml-auto shrink-0 px-2 text-[17px] text-marble-400"
              >
                Reply
              </button>
            )}
          </p>
          <p className="t-body">
            <Spoken text={item.text} now={speaking} />
          </p>
          {react && menu && (
            <div role="group" aria-label={`Your answer to ${name}`} className="-ml-2 mt-1 flex flex-wrap">
              <button type="button" className="text-btn px-2 text-marble-200" onClick={pick(react.onReply)}>
                Answer {name}
              </button>
              <button type="button" aria-pressed={react.mark === 'agree'} className="text-btn px-2 text-marble-300" onClick={pick(() => react.onMark('agree'))}>
                Agree
              </button>
              <button type="button" aria-pressed={react.mark === 'push'} className="text-btn px-2 text-marble-300" onClick={pick(() => react.onMark('push'))}>
                Push back
              </button>
            </div>
          )}
          {react?.mark && MARK[react.mark] && (
            <div className="mt-2 flex items-center justify-between gap-2 border-l-2 border-clay-400 pl-3" data-testid="margin-note">
              <p className="rubric">{MARK[react.mark]}</p>
              <button type="button" className="text-btn px-3 text-marble-400" aria-label={`Remove your mark on ${name}`} onClick={() => react.onMark(null)}>
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </Swipe>
  )
}

/** Who owns it and when to look again; the reasoning and assumptions are in the quaestio. */
const ownerLine = (e: Proposal['entry']) => {
  const who = /^(you|me)$/i.test(e.owner) ? 'You own it' : `${e.owner} owns it`
  return `${who}; check back ${when(e.review_trigger)}.`
}
// ponytail: plain-English join for the gateway's trigger phrases ("End of week two", "Thursday", "When …").
const when = (t: string) => {
  const s = t.trim().replace(/\.$/, '')
  const lower = /^(End|After|When|If|In|Once|Next|Before|The|At|By|Every)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
  return /^(after|when|if|in|once|before|at|by|every)\b/.test(lower) ? lower : `by ${lower}`
}

const inAWeek = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
const bare =
  'block w-full resize-none bg-transparent [field-sizing:content] focus-visible:shadow-[inset_0_-2px_0_var(--color-candle-400)]'

function ProposalCard({ item: raw, index, steer, inert }: { item: Proposal; index: number; steer?: Steer; inert: boolean }) {
  // An earlier session's proposal is a record: one left open can no longer be accepted there,
  // and one accepted without a date can no longer be committed (that session is gone).
  const item = !inert ? raw : raw.state === 'open' ? { ...raw, state: 'declined' as const } : raw.state === 'accepted' ? { ...raw, state: 'committed' as const } : raw
  const { accept, decline, commitTo, journal, conversation } = useMastermind()
  const { user } = useAuth()
  const [decision, setDecision] = useState(item.entry.decision)
  const [nextAction, setNextAction] = useState(item.entry.next_action)
  const [due, setDue] = useState(inAWeek)
  const [remind, setRemind] = useState(false)
  // Epictetus, Enchiridion 1: commit to the part that is in her power.
  const [partly, setPartly] = useState(false)
  const [mine, setMine] = useState(item.entry.next_action)
  const decisionField = useRef<HTMLTextAreaElement>(null)
  const { entry, state } = item
  const committed = journal.commitments.find((c) => c.journal_id === entry.id)
  const q = quaestio(entry)

  return (
    <section
      aria-label="Proposal"
      data-testid="proposal"
      className="rounded-b-card border-t-2 border-candle-400 bg-[color-mix(in_srgb,var(--color-candle-400)_7%,var(--color-ink-950))] p-5"
    >
      <div className="flex justify-between gap-2">
        <p className="rubric">
          {state === 'open' ? 'Proposal' : state === 'declined' ? 'Proposal · not yet' : 'In your journal'}
        </p>
        {entry.confidence !== null && <p className="t-label">{entry.confidence} % confident</p>}
      </div>
      {entry.map && (
        <div className="mt-6 mb-4">
          <CouncilMap map={entry.map} />
        </div>
      )}
      {state === 'open' ? (
        <textarea
          ref={decisionField}
          rows={2}
          aria-label="Decision"
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          className={`t-display mt-2 ${bare}`}
        />
      ) : (
        <p className="t-display mt-2">{entry.decision}</p>
      )}

      {state === 'open' ? (
        <>
          <label htmlFor={`next-${index}`} className="sr-only">
            Next action
          </label>
          <div className="mt-6 flex gap-2">
            <span aria-hidden="true" className="t-body text-marble-400">→</span>
            <textarea
              id={`next-${index}`}
              rows={1}
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              className={`t-body min-h-11 text-marble-100 ${bare}`}
            />
          </div>
        </>
      ) : (
        <p className="t-body mt-6 flex gap-2 text-marble-100">
          <span aria-hidden="true" className="text-marble-400">→</span>
          <span>
            <span className="sr-only">Next action: </span>
            {entry.next_action}
          </span>
        </p>
      )}
      <Quaestio
        q={q}
        contra={verifiedLine(conversation?.items ?? [], { before: index, exclude: (q.objections ?? []).flatMap((o) => (o.speaker ? [o.speaker] : [])) })}
        busy={steer?.busy}
        onTest={
          state === 'open' && steer
            ? () => {
                keyAction('tested')
                steer.run({ kind: 'test' })
              }
            : undefined
        }
      />
      <p className="t-body mt-6 text-marble-300">{ownerLine(entry)}</p>

      {state === 'open' && (
        <>
          <button
            type="button"
            onClick={() => accept(index, { decision: decision.trim() || entry.decision, next_action: nextAction.trim() || entry.next_action })}
            className="slab mt-6"
          >
            Accept → journal
          </button>
          <div className="mt-2 flex flex-wrap justify-center gap-x-2">
            <button type="button" onClick={() => decisionField.current?.focus()} className="text-btn px-3">
              Edit
            </button>
            <button type="button" onClick={() => decline(index)} className="text-btn px-3">
              Not yet
            </button>
            {steer && (
              <button type="button" disabled={steer.busy} onClick={() => steer.run({ kind: 'wrap_up' })} className="text-btn px-3">
                Wrap up
              </button>
            )}
          </div>
          {steer && (
            <button
              type="button"
              disabled={steer.busy}
              onClick={() => steer.run({ kind: 'capture' })}
              className="text-btn mx-auto block px-3 text-marble-300"
            >
              Capture that decision
            </button>
          )}
        </>
      )}

      {state === 'accepted' && (
        <>
          <div className="mt-6" data-testid="in-power">
            <p className="rubric">In your power?</p>
            <p className="t-body mt-1 text-marble-200">“Some things are in our control and others not.”</p>
            <p className="t-ref mt-1">Epictetus, Enchiridion 1</p>
            {partly ? (
              <label className="mt-2 block">
                <span className="t-label">The part that is yours</span>
                <textarea rows={1} value={mine} onChange={(e) => setMine(e.target.value)} className={`t-body mt-1 min-h-11 text-marble-100 ${bare}`} />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMine(entry.next_action) // the accepted text, with her edits
                  setPartly(true)
                }}
                className="text-btn -ml-3 px-3"
              >
                Partly
              </button>
            )}
          </div>
          <form
            id={`commit-${index}`}
            className="field mt-6 flex flex-wrap items-center gap-x-4 py-1"
            onSubmit={(e) => {
              e.preventDefault()
              commitTo(index, due, remind, partly ? mine : undefined)
            }}
          >
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <span className="t-label">Due</span>
              <input
                type="date"
                required
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="min-h-11 min-w-0 bg-transparent text-[19px] text-marble-100 focus-visible:shadow-none"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[19px] text-marble-200">
              <input
                type="checkbox"
                aria-label="Remind me by email on that day"
                checked={remind}
                onChange={(e) => setRemind(e.target.checked)}
                className="check"
              />
              Remind me
            </label>
          </form>
          {/* Outside the form: the sign-in panel carries its own. */}
          {remind && !user && (
            <div className="mt-6">
              <SignInPanel title="Where should the reminder go?" />
            </div>
          )}
          <button type="submit" form={`commit-${index}`} disabled={partly && !mine.trim()} className="slab mt-6 disabled:opacity-40">
            Commit
          </button>
        </>
      )}

      {state === 'committed' && committed && (
        <p className="t-body mt-6 text-laurel-400" data-testid="committed">
          Committed by {humanDate(committed.due_date)} · {committed.remind ? 'email reminder on' : 'no reminder'}
        </p>
      )}
    </section>
  )
}
