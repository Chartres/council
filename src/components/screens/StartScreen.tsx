import { useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { Monogram } from '@/components/Monogram'
import { SignInPanel } from '@/components/SignInPanel'
import { OutcomeButtons } from '@/components/OutcomeButtons'
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
    <div className="mx-auto max-w-xl px-4 pb-6">
      {linkNeedsSignIn && (
        <div className="pt-3">
          <SignInPanel reason="Sign in to record how it went. The group picks up where you left off." />
        </div>
      )}

      {memory && (
        <section
          aria-label="Last time"
          data-testid="last-time"
          className="vellum mt-3 rounded-card border border-ink-700 p-4"
        >
          <p className="font-display text-xs uppercase tracking-widest text-candle-400">Last time</p>
          {last && <p className="mt-1 text-sm text-marble-200">{last.decision}</p>}
          <ul className="mt-2 space-y-3">
            {memory.commitments.map((c) => (
              <li key={c.id}>
                <p className="text-sm text-marble-300">
                  You said you’d {c.what} by {c.due_date}. How did it go?
                </p>
                <OutcomeButtons id={c.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="group" aria-label="Roster" className="mt-3 grid grid-cols-2 gap-2">
        {(Object.keys(ROSTERS) as RosterId[]).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={roster === r}
            onClick={() => setRoster(r)}
            className={`min-h-11 rounded-card border px-3 font-display text-lg ${
              roster === r ? 'border-candle-500 text-candle-200' : 'border-ink-700 text-marble-400'
            }`}
          >
            {ROSTER_LABEL[r]}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-marble-400">
        Pick up to {MAX_PERSONAS}. A neutral facilitator is always there.
      </p>
      <ul className="mt-2">
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
                className={`flex min-h-14 w-full items-center gap-3 rounded-card px-2 py-2 text-left ${
                  on ? 'bg-candle-400/10' : full ? 'opacity-40' : 'hover:bg-ink-850'
                }`}
              >
                <Monogram id={p.id} size={36} lit={on} />
                <span className="min-w-0 flex-1">
                  <span className={`block font-display text-base ${on ? 'text-candle-200' : 'text-marble-100'}`}>
                    {p.name}
                  </span>
                  {'inspiredBy' in p && p.inspiredBy && (
                    <span className="block text-xs text-marble-400">Simulation inspired by {p.inspiredBy}</span>
                  )}
                  <span className="block text-xs leading-snug text-marble-400">{p.brings}</span>
                </span>
                <span aria-hidden="true" className={`text-sm ${on ? 'text-candle-300' : 'text-marble-500'}`}>
                  {on ? '✓' : '+'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => go('intake')}
        className="lit mt-3 min-h-12 w-full rounded-card bg-candle-400 px-4 py-3 font-display text-lg font-semibold text-ink-950 hover:bg-candle-300"
      >
        Begin
      </button>

      <p className="mt-3 text-xs leading-snug text-marble-500">
        {roster === 'business' ? BUSINESS_DISCLOSURE : `${DISCLOSURE} ${MONTESSORI_NOTE}`}
      </p>
    </div>
  )
}
