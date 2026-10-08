import { useReducer } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { MicButton } from '@/components/MicButton'
import { INTAKE_QUESTIONS, intakePayload, intakeReducer } from '@/domain/mastermind'

/** The seven context questions, one at a time, every one skippable. */
export function IntakeScreen() {
  const { go } = useCouncil()
  const { begin, lastIntake } = useMastermind()
  const [state, dispatch] = useReducer(intakeReducer, { step: 0, answers: {} })
  const q = INTAKE_QUESTIONS[state.step]
  const value = state.answers[q.id] ?? ''
  const last = state.step === INTAKE_QUESTIONS.length - 1
  const bring = () => begin(intakePayload(state.answers))

  return (
    <div className="mx-auto max-w-xl px-4 pb-6">
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (state.step ? dispatch({ type: 'back' }) : go('start'))}
          className="min-h-11 text-sm text-marble-400 hover:text-candle-300"
        >
          ← Back
        </button>
        <span className="text-xs text-marble-500" data-testid="intake-step">
          {state.step + 1} / {INTAKE_QUESTIONS.length}
        </span>
      </div>

      {lastIntake && state.step === 0 && !Object.keys(state.answers).length && (
        <div className="vellum mt-2 flex items-center gap-3 rounded-card border border-ink-700 p-3">
          <p className="flex-1 text-sm text-marble-300">Same context as last time?</p>
          <button
            type="button"
            onClick={() => dispatch({ type: 'prefill', intake: lastIntake })}
            className="min-h-11 rounded-card border border-candle-500/60 px-3 text-sm text-candle-200"
          >
            Use it
          </button>
        </div>
      )}

      <label htmlFor="intake" className="mt-3 block font-display text-xl text-marble-100 text-balance">
        {q.q}
      </label>
      <p className="mt-1 text-xs text-marble-400">{q.hint}</p>
      <div className="mt-2 flex items-end gap-2">
        <textarea
          id="intake"
          key={q.id}
          rows={4}
          value={value}
          onChange={(e) => dispatch({ type: 'answer', text: e.target.value })}
          placeholder="A line or two is enough."
          className="min-w-0 flex-1 resize-y rounded-card border border-ink-700 bg-ink-900 px-3 py-3 text-base leading-relaxed text-marble-100 placeholder:text-marble-500 focus:border-candle-500"
        />
        <MicButton value={value} onChange={(text) => dispatch({ type: 'answer', text })} label="your answer" />
      </div>

      {last ? (
        <button
          type="button"
          onClick={bring}
          className="lit mt-3 min-h-12 w-full rounded-card bg-candle-400 px-4 py-3 font-display text-lg font-semibold text-ink-950 hover:bg-candle-300"
        >
          Bring it to the group
        </button>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: 'skip' })}
              className="min-h-12 rounded-card border border-ink-700 px-4 text-marble-300"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'next' })}
              className="min-h-12 rounded-card bg-candle-400 px-4 font-semibold text-ink-950 hover:bg-candle-300"
            >
              Next
            </button>
          </div>
          <button
            type="button"
            onClick={bring}
            className="mt-2 min-h-11 w-full text-sm text-marble-400 hover:text-candle-300"
          >
            Bring it to the group now
          </button>
        </>
      )}
    </div>
  )
}
