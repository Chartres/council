import { keyAction } from '@/analytics'
import { OutcomeButtons } from '@/components/OutcomeButtons'
import { todayKey } from '@/domain/daily'
import type { Commitment } from '@/domain/mastermind'

// The evening examination (docs/SIGNATURE.md, after Seneca, De Ira III.36: "quod hodie malum
// tuum sanasti? cui vitio obstitisti? qua parte melior es?"). Our translation. No streak, no
// count of nights: what is due, and one tap each.

/** From this hour (local) the Journal opens with the examination. */
export const EVENING_HOUR = 17

/** Commitments due today or earlier that still have no outcome. */
export function dueTonight(commitments: Commitment[], today: string): Commitment[] {
  return commitments.filter((c) => c.outcome === null && c.due_date <= today)
}

export function Examination({ commitments, now = new Date() }: { commitments: Commitment[]; now?: Date }) {
  const due = dueTonight(commitments, todayKey(now))
  if (now.getHours() < EVENING_HOUR || due.length === 0) return null
  return (
    <section
      aria-label="Tonight's examination"
      data-testid="examination"
      className="mt-6 border-l-[3px] border-clay-500 pl-4"
      onClickCapture={(e) => {
        const b = (e.target as HTMLElement).closest('button')
        if (b) keyAction('examined', { outcome: b.textContent })
      }}
    >
      <p className="rubric">Tonight’s examination</p>
      <p className="t-body mt-2 text-marble-200">
        What ill did you cure today? What fault did you resist? In what are you better?
      </p>
      <p className="mt-1 text-[13px] text-marble-400">Seneca, De Ira III.36</p>
      <ul className="mt-4 space-y-6">
        {due.map((c) => (
          <li key={c.id}>
            <p className="t-body text-marble-100">You said you’d {c.what}.</p>
            <OutcomeButtons id={c.id} />
          </li>
        ))}
      </ul>
    </section>
  )
}
