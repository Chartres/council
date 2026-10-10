import { useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { Monogram } from '@/components/Monogram'
import { SignInPanel } from '@/components/SignInPanel'
import { OutcomeButtons } from '@/components/OutcomeButtons'
import { PrivacyLink } from '@/components/screens/PrivacyScreen'
import { humanDate } from '@/domain/dates'
import {
  BUSINESS_DISCLOSURE,
  DISCLOSURE,
  MAX_PERSONAS,
  MONTESSORI_NOTE,
  ROSTERS,
  type RosterId,
} from '@/content/personas'

const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

const ROSTER_LABEL: Record<RosterId, string> = { business: 'Business', classics: 'Classics' }

export function StartScreen() {
  const { go } = useCouncil()
  const { roster, setRoster, advisers, toggleAdviser, memory, linkNeedsSignIn } = useMastermind()
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

      <div role="group" aria-label="Roster" className={`grid grid-cols-2 gap-2 ${memory ? 'mt-12' : 'mt-2'}`}>
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
      {inspired.length > 0 && (
        <p className="mt-6 text-[13px] leading-[18px] text-marble-400">Simulations inspired by {listOf(inspired)}.</p>
      )}

      {/* Above the bottom nav, so Begin is in reach however long the roster runs. */}
      <div className="sticky z-10 mt-6 bg-ink-950 py-2" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => go('intake')} className="slab">
          Begin
        </button>
      </div>

      <p className="mt-6 text-[13px] leading-[18px] text-marble-400">
        The advisers are AI. {roster === 'business' ? BUSINESS_DISCLOSURE : `${DISCLOSURE} ${MONTESSORI_NOTE}`}{' '}
        <PrivacyLink />
      </p>
    </div>
  )
}
