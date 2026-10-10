import { useMastermind } from '@/app/MastermindContext'
import type { Outcome } from '@/domain/mastermind'

const LABEL: Record<Outcome, string> = { done: 'Done', later: 'Not yet — another round', drop: 'Drop' }

/** Done (the one filled action) / not yet / drop. "Not yet" is a normal answer: it starts another round. */
export function OutcomeButtons({ id }: { id: string }) {
  const { recordOutcome, begin, lastIntake } = useMastermind()
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-6">
      {(Object.keys(LABEL) as Outcome[]).map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => {
            recordOutcome(id, o)
            if (o === 'later') begin(lastIntake ?? undefined)
          }}
          className={
            o === 'done'
              ? 'min-h-11 rounded-card bg-candle-400 px-5 font-display text-[19px] font-semibold text-ink-950 hover:bg-candle-300'
              : `text-btn ${o === 'drop' ? 'text-marble-400' : ''}`
          }
        >
          {LABEL[o]}
        </button>
      ))}
    </div>
  )
}
