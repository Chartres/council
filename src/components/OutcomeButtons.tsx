import { useMastermind } from '@/app/MastermindContext'
import type { Outcome } from '@/domain/mastermind'

const LABEL: Record<Outcome, string> = { done: 'Done', later: 'Not yet', drop: 'Drop' }

/** Done is the one filled action; "Not yet" (starts another round) and "Drop" are text beside it. */
export function OutcomeButtons({ id }: { id: string }) {
  const { recordOutcome, begin, lastIntake } = useMastermind()
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2">
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
              ? 'slab mr-3 min-h-11 w-auto px-6'
              : 'text-btn px-3'
          }
        >
          {LABEL[o]}
        </button>
      ))}
    </div>
  )
}
