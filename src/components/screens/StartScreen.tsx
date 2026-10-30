import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { Monogram } from '@/components/Monogram'
import { SignInPanel } from '@/components/SignInPanel'
import { OutcomeButtons } from '@/components/OutcomeButtons'
import { PrivacyLink } from '@/components/screens/PrivacyScreen'
import { humanDate } from '@/domain/dates'
import { dailyQuestion, todayKey } from '@/domain/daily'
import { stableIntake } from '@/domain/mastermind'
import { keyAction } from '@/analytics'
import {
  BUSINESS_DISCLOSURE,
  DISCLOSURE,
  MAX_PERSONAS,
  MONTESSORI_NOTE,
  ROSTERS,
  type RosterId,
} from '@/content/personas'

const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

export const MCP_URL = 'https://llm.dravec.org/mcp'

function ConnectPanel() {
  const [copied, setCopied] = useState(false)
  return (
    <details className="mt-6" data-testid="connect">
      <summary className="text-btn flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden">
        Connect from your AI
      </summary>
      <p className="t-body mt-2 break-all text-marble-50">{MCP_URL}</p>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(MCP_URL).then(() => setCopied(true), () => setCopied(false))}
        className="text-btn -ml-3 px-3"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <p className="t-body mt-2">
        Add it as a connector in Claude or ChatGPT; it signs you in by email and your AI starts the council with what it
        knows about you.
      </p>
    </details>
  )
}

const ROSTER_LABEL: Record<RosterId, string> = { business: 'Business', classics: 'Classics' }

/** Where the daily question comes from (docs/SIGNATURE.md lineage; Jowett's translation, public domain). */
export const TODAY_ROOT =
  'A practice from Plato’s Apology 38a: “the unexamined life is not worth living.” Trans. Jowett.'

/** One question a day, the same for everyone (docs/SIGNATURE.md "Today's question"). */
function Today({ onOpen }: { onOpen: (question: string) => void }) {
  const day = todayKey()
  const question = dailyQuestion(day)
  // Open on tap (pinned) or while a mouse hovers / the keyboard focuses the button (peek).
  const [pinned, setPinned] = useState(false)
  const [peek, setPeek] = useState(false)
  const open = pinned || peek
  const focusVisible = (el: Element) => {
    try {
      return el.matches(':focus-visible')
    } catch {
      return false // an engine without :focus-visible: tap or click still opens it
    }
  }
  return (
    <section aria-label="Today's question" data-testid="today" className="relative mt-2">
      {/* The whole card is the control: the question is what she taps (and the fold's first control). */}
      <button
        type="button"
        onClick={() => {
          keyAction('daily_opened', { day })
          onOpen(question)
        }}
        className="block w-full rounded-card py-2 text-left"
      >
        <span className="t-label block pr-14">Today’s question</span>
        <span className="t-title mt-2 block">{question}</span>
        <span className="t-body mt-1 block font-semibold text-candle-300">Take it to the council ›</span>
      </button>
      {/* After the card in the DOM, beside its label on screen; the note opens below the card, so
          nothing above the question moves. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="today-root"
        data-testid="today-why"
        onClick={() => {
          // A click pins it open (even while hovered) or, when pinned, closes it.
          setPinned(!pinned)
          if (pinned) setPeek(false)
        }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setPeek(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPeek(false)}
        onFocus={(e) => focusVisible(e.currentTarget) && setPeek(true)}
        onBlur={() => setPeek(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setPinned(false)
            setPeek(false)
          }
        }}
        className="absolute -right-3 -top-1.5 min-h-11 min-w-11 px-3 text-[13px] text-marble-400 hover:text-marble-100"
      >
        Why?
      </button>
      <p id="today-root" hidden={!open} className="text-[13px] leading-snug text-marble-400">
        {TODAY_ROOT}
      </p>
    </section>
  )
}

export function StartScreen() {
  const { go } = useCouncil()
  const { roster, setRoster, advisers, toggleAdviser, memory, linkNeedsSignIn, begin, lastIntake } = useMastermind()
  const last = memory?.entries[0]
  const inspired = ROSTERS[roster].flatMap((p) => ('inspiredBy' in p && p.inspiredBy ? [p.inspiredBy] : []))

  return (
    <div className="mx-auto max-w-xl px-4 pb-12">
      {linkNeedsSignIn && (
        <div className="pt-3">
          <SignInPanel reason="Sign in to record how it went. The group picks up where you left off." />
        </div>
      )}

      {memory && (
        <section aria-label="Last time" data-testid="last-time" className="mt-6">
          <p className="t-label">Last time</p>
          {last && <p className="t-title mt-2">{last.decision}</p>}
          <ul className="mt-2 space-y-6">
            {memory.commitments.map((c) => (
              <li key={c.id}>
                <p className="t-body">
                  You said you’d {c.what} by {humanDate(c.due_date)}. How did it go?
                </p>
                <OutcomeButtons id={c.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Who she is carries over (role, organization, working style); the question is today's goal. */}
      <Today onOpen={(goal) => begin({ ...stableIntake(lastIntake), goal })} />

      <div role="group" aria-label="Roster" className="mt-12 grid grid-cols-2 gap-2">
        {(Object.keys(ROSTERS) as RosterId[]).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={roster === r}
            onClick={() => setRoster(r)}
            className={`min-h-11 border-b-2 px-3 font-display text-xl font-medium ${
              roster === r ? 'border-marble-100 text-marble-50' : 'border-transparent text-marble-400 hover:text-marble-200'
            }`}
          >
            {ROSTER_LABEL[r]}
          </button>
        ))}
      </div>

      <p className="t-body mt-6 text-marble-400">
        Pick up to {MAX_PERSONAS}. A neutral facilitator is always there.
      </p>
      {inspired.length > 0 && (
        <p className="mt-2 text-[13px] leading-[18px] text-marble-400">Simulations inspired by {listOf(inspired)}.</p>
      )}
      {/* The room's people are the picture: one seat per adviser, lit when taken, what they bring in plain sight. */}
      <ul className="mt-6 space-y-6">
        {ROSTERS[roster].map((p) => {
          const on = advisers.includes(p.id)
          const full = !on && advisers.length >= MAX_PERSONAS
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggleAdviser(p.id)}
                aria-pressed={on}
                disabled={full}
                className={`flex w-full items-center gap-4 rounded-card text-left ${full ? 'opacity-40' : ''}`}
              >
                <Monogram id={p.id} size={64} lit={on} />
                <span className="min-w-0 flex-1">
                  <span className={`t-title block ${on ? '' : 'text-marble-300'}`}>{p.name}</span>
                  <span className={`t-body mt-1 block ${on ? '' : 'text-marble-400'}`}>{p.brings}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Above the bottom nav, so Begin is in reach however long the roster runs. */}
      <div className="sticky z-10 mt-6 bg-ink-950 py-2" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => go('intake')} className="slab">
          Begin
        </button>
      </div>

      <ConnectPanel />

      <p className="mt-6 text-[13px] leading-[18px] text-marble-400">
        The advisers are AI. {roster === 'business' ? BUSINESS_DISCLOSURE : `${DISCLOSURE} ${MONTESSORI_NOTE}`}{' '}
        <PrivacyLink />
      </p>
    </div>
  )
}
