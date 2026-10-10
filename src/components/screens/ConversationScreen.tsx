import { useEffect, useMemo, useRef, useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { useMastermind, type Item } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { ListenToggle, useListen, useNarration } from '@/components/Listen'
import { MicButton } from '@/components/MicButton'
import { Monogram } from '@/components/Monogram'
import { SignInPanel } from '@/components/SignInPanel'
import { BUSINESS_DISCLOSURE, DISCLOSURE, personaName } from '@/content/personas'
import { FAILURE_COPY, type Turn } from '@/domain/council'
import type { Control } from '@/domain/mastermind'

type Proposal = Extract<Item, { kind: 'proposal' }>

export function ConversationScreen() {
  const { go } = useCouncil()
  const { conversation, say, control, journal } = useMastermind()
  const [message, setMessage] = useState('')
  const [more, setMore] = useState(false)
  const [listen, setListen] = useListen()
  const list = useRef<HTMLOListElement>(null)
  const turnStart = useRef(0)
  const items = conversation?.items
  const streaming = conversation?.streaming

  // Spoken: the speaker's name, then the contribution (Eyal's voice rule).
  const turns = useMemo<Turn[]>(
    () =>
      (items ?? []).flatMap((it): Turn[] =>
        it.kind === 'contribution'
          ? [{ persona: it.speaker, text: `${personaName(it.speaker)}. ${it.text}` }]
          : it.kind === 'facilitator'
            ? [{ persona: 'facilitator', text: it.text }]
            : it.kind === 'floor'
              ? [{ persona: 'facilitator', text: it.question }]
              : [],
      ),
    [items],
  )
  useNarration(turns, null, listen)

  // Read from the start of what arrived: the first item of the newest turn goes to the top.
  // The opening turn needs no scroll; the question is pinned above it.
  useEffect(() => {
    if (streaming) turnStart.current = items?.length ?? 0
  }, [streaming])
  useEffect(() => {
    const i = turnStart.current
    if (i > 0 && (items?.length ?? 0) === i + 1)
      list.current?.children[i]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [items?.length])

  if (!conversation) return null
  const { failure, ended, advisers, sessionId, roster } = conversation
  const spoken = [...new Set(conversation.items.flatMap((it) => (it.kind === 'contribution' ? [it.speaker] : [])))]
  const busy = streaming || !sessionId
  const run = (c: Control) => control(c)
  const decided = journal.entries.filter((e) => e.status !== 'proposal').length

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const text = message.trim()
    if (!text || busy) return
    setMessage('')
    say(text)
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-12">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => go('start')} className="text-btn -ml-3 px-3 text-marble-400">
          ← Council
        </button>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => go('journal')} className="text-btn px-3 text-marble-400">
            {decided ? `Journal · ${decided}` : 'Journal'}
          </button>
          <ListenToggle on={listen} onChange={setListen} />
        </span>
      </div>

      <section aria-label="The question" className="mt-2">
        <p className="t-label">The question</p>
        <h1 className="t-display mt-2 text-balance">{conversation.intake?.goal ?? 'Open question'}</h1>
      </section>

      <ol ref={list} className="mt-12 space-y-6" data-testid="conversation">
        {conversation.items.map((it, i) => (
          <li key={i} className="rise scroll-mt-20">
            <ItemView item={it} index={i} />
          </li>
        ))}
      </ol>

      {streaming && (
        <p className="t-title mt-6 italic text-marble-200" role="status" data-testid="streaming">
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

      {ended ? (
        !streaming && (
          <button type="button" onClick={() => go('journal')} className="slab mt-6">
            Open the journal
          </button>
        )
      ) : (
        <>
          <form onSubmit={send} className="mt-6">
            <label htmlFor="reply" className="sr-only">
              Your turn
            </label>
            <div className="field flex items-end gap-1 py-1.5 pr-1.5 pl-4">
              <textarea
                id="reply"
                rows={1}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Answer, push back, add what they are missing."
                className="min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2 text-[17px] leading-[26px] text-marble-100 [field-sizing:content]"
              />
              <MicButton value={message} onChange={setMessage} label="your reply" />
              <button
                type="submit"
                aria-label="Say it"
                disabled={!message.trim() || busy}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-marble-100 text-ink-950 disabled:bg-ink-800 disabled:text-marble-400"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </form>

          <div role="group" aria-label="Steer the group" className="mt-2">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
              <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'disagree' })}>
                I disagree
              </button>
              <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'concrete' })}>
                Make this concrete
              </button>
              <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'wrap_up' })}>
                Wrap up
              </button>
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
                <button type="button" disabled={busy} className="chip" onClick={() => run({ kind: 'capture' })}>
                  Capture that decision
                </button>
                <LetExplore advisers={advisers} disabled={!!busy} onRun={run} />
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-12 text-[13px] leading-[18px] text-marble-400">
        {roster === 'business' ? BUSINESS_DISCLOSURE : DISCLOSURE}
      </p>
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

function ItemView({ item, index }: { item: Item; index: number }) {
  switch (item.kind) {
    case 'facilitator':
      return (
        <p className="text-[15px] italic leading-[23px] text-marble-400" data-testid="facilitator">
          {item.text}
        </p>
      )
    case 'contribution':
      return (
        <div className="flex gap-4" data-testid="contribution">
          <Monogram id={item.speaker} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-3">
              <span className="t-title">{personaName(item.speaker)}</span>
              {item.confidence !== undefined && (
                <span className="text-[13px] font-medium text-marble-400">confidence {item.confidence}</span>
              )}
            </p>
            <p className="t-body mt-1">{item.text}</p>
          </div>
        </div>
      )
    case 'floor':
      return (
        <p className="t-display border-l-[3px] border-candle-500 pl-4 text-candle-200" data-testid="floor">
          {item.question}
        </p>
      )
    case 'user':
      return (
        <div data-testid="user">
          <p className="t-label">You</p>
          <p className="t-body mt-1 text-marble-100">{item.text}</p>
        </div>
      )
    case 'proposal':
      return <ProposalCard item={item} index={index} />
  }
}

const inAWeek = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
const bare =
  'block w-full resize-none bg-transparent [field-sizing:content] focus-visible:shadow-[inset_0_-2px_0_var(--color-candle-400)]'

function ProposalCard({ item, index }: { item: Proposal; index: number }) {
  const { accept, decline, commitTo, journal } = useMastermind()
  const { user } = useAuth()
  const [decision, setDecision] = useState(item.entry.decision)
  const [nextAction, setNextAction] = useState(item.entry.next_action)
  const [due, setDue] = useState(inAWeek)
  const [remind, setRemind] = useState(false)
  const decisionField = useRef<HTMLTextAreaElement>(null)
  const { entry, state } = item
  const committed = journal.commitments.find((c) => c.journal_id === entry.id)

  return (
    <section
      aria-label="Proposal"
      data-testid="proposal"
      className="rounded-b-card border-t-2 border-candle-400 bg-[color-mix(in_srgb,var(--color-candle-400)_7%,var(--color-ink-950))] p-5"
    >
      <div className="flex justify-between gap-2">
        <p className="t-label">
          {state === 'open' ? 'Proposal' : state === 'declined' ? 'Proposal · not yet' : 'In your journal'}
        </p>
        {entry.confidence !== null && <p className="t-label">{entry.confidence} % confident</p>}
      </div>
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
      <p className="mt-2 text-[15px] leading-[22px] text-marble-300">{entry.reasoning}</p>

      {state === 'open' ? (
        <>
          <label htmlFor={`next-${index}`} className="t-label mt-6 block">
            Next action
          </label>
          <textarea
            id={`next-${index}`}
            rows={1}
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            className={`t-body mt-1 min-h-11 text-marble-100 ${bare}`}
          />
        </>
      ) : (
        <>
          <p className="t-label mt-6">Next action</p>
          <p className="t-body mt-1 text-marble-100">{entry.next_action}</p>
        </>
      )}
      <dl className="mt-2 space-y-1 text-[15px] leading-[22px] text-marble-300">
        {entry.assumptions.length > 0 && (
          <div><dt className="inline text-marble-400">Assumptions: </dt><dd className="inline">{entry.assumptions.join('; ')}</dd></div>
        )}
        <div><dt className="inline text-marble-400">Owner: </dt><dd className="inline">{entry.owner} · review: {entry.review_trigger}</dd></div>
      </dl>

      {state === 'open' && (
        <>
          <button
            type="button"
            onClick={() => accept(index, { decision: decision.trim() || entry.decision, next_action: nextAction.trim() || entry.next_action })}
            className="slab mt-6"
          >
            Accept → journal
          </button>
          <div className="mt-2 flex justify-center gap-6">
            <button type="button" onClick={() => decisionField.current?.focus()} className="text-btn px-3">
              Edit
            </button>
            <button type="button" onClick={() => decline(index)} className="text-btn px-3 text-marble-400">
              Not yet
            </button>
          </div>
        </>
      )}

      {state === 'accepted' && (
        <>
          <form
            id={`commit-${index}`}
            className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              commitTo(index, due, remind)
            }}
          >
            <label className="flex items-center gap-2 text-[15px] text-marble-300">
              Due
              <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} className="field min-h-11 w-auto px-3 py-2" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[15px] text-marble-300">
              <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="h-5 w-5 accent-candle-400" />
              Remind me by email on that day
            </label>
          </form>
          {/* Outside the form: the sign-in panel carries its own. */}
          {remind && !user && (
            <div className="mt-6">
              <SignInPanel reason="Sign in so the reminder has an address to go to." />
            </div>
          )}
          <button type="submit" form={`commit-${index}`} className="slab mt-6">
            Commit
          </button>
        </>
      )}

      {state === 'committed' && committed && (
        <p className="mt-6 text-[15px] text-laurel-400" data-testid="committed">
          Committed by {committed.due_date} · {committed.remind ? 'email reminder on' : 'no reminder'}
        </p>
      )}
    </section>
  )
}
