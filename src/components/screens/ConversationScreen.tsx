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

const chip =
  'min-h-11 rounded-full border border-ink-700 px-3 text-sm text-marble-200 hover:border-candle-500 disabled:opacity-40'

export function ConversationScreen() {
  const { go } = useCouncil()
  const { conversation, say, control, journal } = useMastermind()
  const [message, setMessage] = useState('')
  const [listen, setListen] = useListen()
  const end = useRef<HTMLDivElement>(null)
  const items = conversation?.items

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

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [items?.length])

  if (!conversation) return null
  const { streaming, failure, ended, advisers, sessionId, roster } = conversation
  const spoken = [...new Set(conversation.items.flatMap((it) => (it.kind === 'contribution' ? [it.speaker] : [])))]
  const busy = streaming || !sessionId
  const run = (c: Control) => control(c)

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const text = message.trim()
    if (!text || busy) return
    setMessage('')
    say(text)
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-6">
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => go('start')} className="min-h-11 text-sm text-marble-400 hover:text-candle-300">
          ← Council
        </button>
        <button type="button" onClick={() => go('journal')} className="min-h-11 text-sm text-marble-400 hover:text-candle-300">
          Journal · {journal.entries.filter((e) => e.status !== 'proposal').length}
        </button>
        <ListenToggle on={listen} onChange={setListen} />
      </div>

      <ol className="mt-3 space-y-4" data-testid="conversation">
        {conversation.items.map((it, i) => (
          <li key={i} className="rise">
            <ItemView item={it} index={i} />
          </li>
        ))}
      </ol>

      {streaming && (
        <p className="mt-4 text-sm text-marble-400" role="status" data-testid="streaming">
          The group is talking…
        </p>
      )}

      {failure === 'sign_in' && (
        <div className="mt-6">
          <SignInPanel reason={FAILURE_COPY.sign_in} />
        </div>
      )}
      {failure && failure !== 'sign_in' && (
        <p className="mt-6 border-l-2 border-clay-500 pl-3 text-sm text-marble-200" role="alert">
          {FAILURE_COPY[failure]}
        </p>
      )}

      {ended ? (
        !streaming && (
          <button
            type="button"
            onClick={() => go('journal')}
            className="mt-6 min-h-12 w-full rounded-card bg-candle-400 px-4 py-3 font-display text-lg font-semibold text-ink-950"
          >
            Open the journal
          </button>
        )
      ) : (
        <>
          <form onSubmit={send} className="mt-6">
            <label htmlFor="reply" className="block text-sm text-marble-300">
              Your turn
            </label>
            <div className="mt-1 flex items-end gap-2">
              <textarea
                id="reply"
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Answer, push back, add what they are missing."
                className="min-w-0 flex-1 resize-y rounded-card border border-ink-700 bg-ink-900 px-3 py-3 text-base leading-relaxed text-marble-100 placeholder:text-marble-500 focus:border-candle-500"
              />
              <MicButton value={message} onChange={setMessage} label="your reply" />
            </div>
            <button
              type="submit"
              disabled={!message.trim() || busy}
              className={`mt-2 min-h-12 w-full rounded-card px-4 py-3 font-display text-lg font-semibold ${
                message.trim() && !busy
                  ? 'bg-candle-400 text-ink-950 hover:bg-candle-300'
                  : 'border border-ink-700 bg-transparent text-marble-500'
              }`}
            >
              Say it
            </button>
          </form>

          <div role="group" aria-label="Steer the group" className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={chip} onClick={() => run({ kind: 'pause' })}>
              Pause
            </button>
            <select
              aria-label="Go back to"
              disabled={busy || !spoken.length}
              value=""
              onChange={(e) => e.target.value && run({ kind: 'back_to', speaker: e.target.value })}
              className={`${chip} bg-ink-950`}
            >
              <option value="">Go back to…</option>
              {spoken.map((id) => (
                <option key={id} value={id}>
                  {personaName(id)}’s point
                </option>
              ))}
            </select>
            <LetExplore advisers={advisers} disabled={busy} onRun={run} />
            <button type="button" disabled={busy} className={chip} onClick={() => run({ kind: 'disagree' })}>
              I disagree
            </button>
            <button type="button" disabled={busy} className={chip} onClick={() => run({ kind: 'concrete' })}>
              Make this concrete
            </button>
            <button type="button" disabled={busy} className={chip} onClick={() => run({ kind: 'test' })}>
              What would we test?
            </button>
            <button type="button" disabled={busy} className={chip} onClick={() => run({ kind: 'capture' })}>
              Capture that decision
            </button>
            <button type="button" disabled={busy} className={chip} onClick={() => run({ kind: 'wrap_up' })}>
              Wrap up
            </button>
          </div>
        </>
      )}

      <p className="mt-6 text-xs leading-snug text-marble-500">
        {roster === 'business' ? BUSINESS_DISCLOSURE : DISCLOSURE}
      </p>
      <div ref={end} />
    </div>
  )
}

function LetExplore({ advisers, disabled, onRun }: { advisers: string[]; disabled: boolean; onRun: (c: Control) => void }) {
  const [a, setA] = useState(advisers[0])
  const [b, setB] = useState(advisers[1] ?? advisers[0])
  if (advisers.length < 2) return null
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value)} className="min-h-11 bg-ink-950 text-sm text-candle-200">
      {advisers.map((id) => (
        <option key={id} value={id}>
          {personaName(id)}
        </option>
      ))}
    </select>
  )
  return (
    <span className={`${chip} flex items-center gap-1`}>
      Let {pick(a, setA, 'First adviser')} and {pick(b, setB, 'Second adviser')}
      <button
        type="button"
        disabled={disabled || a === b}
        onClick={() => onRun({ kind: 'let', a, b })}
        className="min-h-11 px-1 text-candle-200 disabled:opacity-40"
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
        <p className="text-sm italic leading-relaxed text-marble-300" data-testid="facilitator">
          <span className="not-italic text-marble-500">Facilitator · </span>
          {item.text}
        </p>
      )
    case 'contribution':
      return (
        <div className="flex gap-3" data-testid="contribution">
          <Monogram id={item.speaker} size={40} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-display text-base text-candle-200">
              {personaName(item.speaker)}
              {item.confidence !== undefined && (
                <span className="rounded-full border border-ink-600 px-2 font-sans text-xs text-marble-300">
                  confidence {item.confidence}
                </span>
              )}
            </p>
            <p className="mt-1 text-[0.95rem] leading-relaxed text-marble-200">{item.text}</p>
          </div>
        </div>
      )
    case 'floor':
      return (
        <p className="rounded-card border-l-2 border-candle-500 pl-3 font-display text-lg leading-snug text-candle-200" data-testid="floor">
          {item.question}
        </p>
      )
    case 'user':
      return (
        <p className="text-[0.95rem] leading-relaxed text-marble-100">
          <span className="text-marble-500">You · </span>
          {item.text}
        </p>
      )
    case 'proposal':
      return <ProposalCard item={item} index={index} />
  }
}

const inAWeek = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)

function ProposalCard({ item, index }: { item: Proposal; index: number }) {
  const { accept, decline, commitTo, journal } = useMastermind()
  const { user } = useAuth()
  const [decision, setDecision] = useState(item.entry.decision)
  const [nextAction, setNextAction] = useState(item.entry.next_action)
  const [due, setDue] = useState(inAWeek)
  const [remind, setRemind] = useState(false)
  const { entry, state } = item
  const committed = journal.commitments.find((c) => c.journal_id === entry.id)
  const field = 'mt-1 w-full rounded-card border border-ink-700 bg-ink-900 px-3 py-2 text-base text-marble-100 focus:border-candle-500'

  return (
    <section aria-label="Proposal" data-testid="proposal" className="border-t border-candle-500/40 pt-4">
      <p className="font-display text-xs uppercase tracking-widest text-candle-400">
        {state === 'open' ? 'Proposal' : state === 'declined' ? 'Proposal · not yet' : 'In your journal'}
      </p>
      {state === 'open' ? (
        <>
          <label className="mt-2 block text-xs text-marble-400">
            Decision
            <textarea rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} className={field} />
          </label>
          <label className="mt-2 block text-xs text-marble-400">
            Next action
            <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={field} />
          </label>
        </>
      ) : (
        <p className="mt-2 text-[0.98rem] leading-relaxed text-marble-100">{entry.decision}</p>
      )}
      <dl className="mt-2 space-y-1 text-xs text-marble-300">
        <div><dt className="inline text-marble-500">Why: </dt><dd className="inline">{entry.reasoning}</dd></div>
        {entry.assumptions.length > 0 && (
          <div><dt className="inline text-marble-500">Assumptions: </dt><dd className="inline">{entry.assumptions.join('; ')}</dd></div>
        )}
        <div><dt className="inline text-marble-500">Owner: </dt><dd className="inline">{entry.owner} · review: {entry.review_trigger}</dd></div>
        {entry.confidence !== null && (
          <div><dt className="inline text-marble-500">Confidence: </dt><dd className="inline">{entry.confidence}/100</dd></div>
        )}
      </dl>

      {state === 'open' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => decline(index)}
            className="min-h-11 px-3 text-sm text-marble-300 hover:text-candle-300"
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={() => accept(index, { decision: decision.trim() || entry.decision, next_action: nextAction.trim() || entry.next_action })}
            className="min-h-11 rounded-card bg-candle-400 px-3 text-sm font-semibold text-ink-950"
          >
            Accept → journal
          </button>
        </div>
      )}

      {state === 'accepted' && (
        <form
          className="mt-3 border-t border-ink-700 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            commitTo(index, due, remind)
          }}
        >
          <p className="text-sm text-marble-200">Commit to: {entry.next_action}</p>
          <label className="mt-2 flex items-center gap-2 text-sm text-marble-300">
            Due
            <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} className="min-h-11 rounded-card border border-ink-700 bg-ink-900 px-2 text-marble-100" />
          </label>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-marble-300">
            <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="h-5 w-5 accent-candle-400" />
            Remind me by email on that day
          </label>
          {remind && !user && (
            <p className="text-xs text-marble-500">Sign in so the reminder has an address to go to.</p>
          )}
          <button type="submit" className="mt-2 min-h-11 text-sm font-semibold text-candle-300 hover:text-candle-200">
            Commit
          </button>
        </form>
      )}

      {state === 'committed' && committed && (
        <p className="mt-3 border-t border-ink-700 pt-3 text-sm text-laurel-400" data-testid="committed">
          Committed by {committed.due_date} · {committed.remind ? 'email reminder on' : 'no reminder'}
        </p>
      )}
    </section>
  )
}
