import { useMastermind } from '@/app/MastermindContext'
import type { Outcome } from '@/domain/mastermind'

const LABEL: Record<Outcome, string> = { done: 'Done', later: 'Not yet — another round', drop: 'Drop' }

/** Done / not yet / drop. "Not yet" is a normal answer: it starts another round. */
export function OutcomeButtons({ id }: { id: string }) {
  const { recordOutcome, begin, lastIntake } = useMastermind()
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {(Object.keys(LABEL) as Outcome[]).map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => {
            recordOutcome(id, o)
            if (o === 'later') begin(lastIntake ?? undefined)
          }}
          className="min-h-11 rounded-card border border-ink-700 px-3 text-sm text-marble-200 hover:border-candle-500"
        >
          {LABEL[o]}
        </button>
      ))}
    </div>
  )
}
