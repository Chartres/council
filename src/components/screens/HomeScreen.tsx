import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { Monogram } from '@/components/Monogram'
import { DISCLOSURE, MAX_PERSONAS, MONTESSORI_NOTE, PERSONAS, personaName } from '@/content/personas'
import { dailyQuestion, todayKey } from '@/domain/daily'

export function HomeScreen() {
  const { picked, togglePersona, convene } = useCouncil()
  const [idea, setIdea] = useState('')
  const day = todayKey()
  const question = dailyQuestion(day)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = idea.trim()
    if (trimmed) convene({ idea: trimmed })
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-6">
      <form onSubmit={submit} className="pt-3">
        <label htmlFor="idea" className="block font-display text-2xl text-marble-100">
          What are you working on?
        </label>
        <textarea
          id="idea"
          rows={4}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="A business, a project, a decision you keep turning over."
          className="mt-2 w-full resize-y rounded-card border border-ink-700 bg-ink-900 px-3 py-3 text-base leading-relaxed text-marble-100 placeholder:text-marble-500 focus:border-candle-500"
        />

        <details className="mt-3 rounded-card border border-ink-800 bg-ink-900/60">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2">
            <span className="flex gap-1">
              {picked.map((id) => (
                <Monogram key={id} id={id} size={24} />
              ))}
            </span>
            <span className="text-sm text-marble-300">
              {picked.map(personaName).join(' · ')}
            </span>
            <span className="ml-auto text-xs text-marble-500">
              {picked.length}/{MAX_PERSONAS}
            </span>
          </summary>
          <ul className="border-t border-ink-800 p-2">
            {PERSONAS.map((p) => {
              const on = picked.includes(p.id)
              const full = !on && picked.length >= MAX_PERSONAS
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => togglePersona(p.id)}
                    aria-pressed={on}
                    disabled={full}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-card px-2 py-2 text-left ${
                      on ? 'bg-candle-400/10' : full ? 'opacity-40' : 'hover:bg-ink-850'
                    }`}
                  >
                    <Monogram id={p.id} size={36} lit={on} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block font-display text-base ${
                          on ? 'text-candle-200' : 'text-marble-100'
                        }`}
                      >
                        {p.name}
                      </span>
                      <span className="block text-xs leading-snug text-marble-400">
                        {p.brings}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`text-sm ${on ? 'text-candle-300' : 'text-marble-600'}`}
                    >
                      {on ? '✓' : '+'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="px-4 pb-3 text-xs text-marble-500">
            Up to {MAX_PERSONAS} at a time. {MONTESSORI_NOTE}
          </p>
        </details>

        {/* Unlit until there is something to debate — an amber slab at 40% opacity
            reads as mud, so the empty state is an outline instead. */}
        <button
          type="submit"
          disabled={!idea.trim()}
          className={`mt-3 min-h-12 w-full rounded-card px-4 py-3 font-display text-lg font-semibold ${
            idea.trim()
              ? 'lit bg-candle-400 text-ink-950 hover:bg-candle-300'
              : 'border border-ink-700 bg-transparent text-marble-500'
          }`}
        >
          Convene the council
        </button>
      </form>

      <p className="mt-3 text-xs leading-snug text-marble-500">{DISCLOSURE}</p>

      <section
        aria-label="Today’s question"
        data-testid="daily-card"
        className="vellum mt-6 rounded-card border border-ink-700 p-4"
      >
        <p className="font-display text-xs uppercase tracking-widest text-candle-400">
          Today’s question · {day}
        </p>
        <h2 className="mt-2 font-display text-xl leading-snug text-marble-100 text-balance">
          {question}
        </h2>
        <p className="mt-2 text-xs text-marble-400">
          The same question for everyone today. Convene on it and share how your council split.
        </p>
        <button
          type="button"
          onClick={() => convene({ idea: question, dailyKey: day, question })}
          className="mt-3 min-h-11 w-full rounded-card border border-candle-500/60 px-4 py-2 font-semibold text-candle-200 hover:bg-candle-400/10"
        >
          Convene on this
        </button>
      </section>
    </div>
  )
}
