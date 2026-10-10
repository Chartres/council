import { useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { Monogram } from '@/components/Monogram'
import { SignInPanel } from '@/components/SignInPanel'
import { OutcomeButtons } from '@/components/OutcomeButtons'
import { PrivacyLink } from '@/components/screens/PrivacyScreen'
import {
  BUSINESS_DISCLOSURE,
  DISCLOSURE,
  MAX_PERSONAS,
  MONTESSORI_NOTE,
  ROSTERS,
  type RosterId,
} from '@/content/personas'

const ROSTER_LABEL: Record<RosterId, string> = { business: 'Business', classics: 'Classics' }

export function StartScreen() {
  const { go } = useCouncil()
  const { roster, setRoster, advisers, toggleAdviser, memory, linkNeedsSignIn } = useMastermind()
  const last = memory?.entries[0]

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
                  You said you’d {c.what} by {c.due_date}. How did it go?
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

      <p className="mt-6 text-[15px] leading-[22px] text-marble-400">
        Pick up to {MAX_PERSONAS}. A neutral facilitator is always there.
      </p>
      {/* The room's people are the picture: a row of seats, lit when taken. */}
      <ul className="mt-6 grid grid-cols-4 gap-x-2 gap-y-6">
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
                className={`flex w-full flex-col items-center gap-2 rounded-card py-1 text-center ${full ? 'opacity-40' : ''}`}
              >
                <Monogram id={p.id} size={64} lit={on} />
                <span className={`t-title ${on ? '' : 'text-marble-300'}`}>{p.name}</span>
                {'inspiredBy' in p && p.inspiredBy && (
                  <span className="text-[13px] leading-[18px] text-marble-400">Simulation inspired by {p.inspiredBy}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <details className="mt-6">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-[15px] font-semibold text-marble-100 [&::-webkit-details-marker]:hidden">
          What they bring ›
        </summary>
        <dl className="mt-2 space-y-2">
          {ROSTERS[roster].map((p) => (
            <div key={p.id}>
              <dt className="inline font-display text-[17px] font-medium text-marble-50">{p.name} </dt>
              <dd className="inline text-[15px] leading-[22px] text-marble-300">{p.brings}</dd>
            </div>
          ))}
        </dl>
      </details>

      <button type="button" onClick={() => go('intake')} className="slab mt-6">
        Begin
      </button>

      <p className="mt-6 text-[13px] leading-[18px] text-marble-400">
        The advisers are AI. {roster === 'business' ? BUSINESS_DISCLOSURE : `${DISCLOSURE} ${MONTESSORI_NOTE}`}{' '}
        <PrivacyLink />
      </p>
    </div>
  )
}
