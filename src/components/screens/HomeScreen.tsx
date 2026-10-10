import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { MicButton } from '@/components/MicButton'
import { Monogram } from '@/components/Monogram'
import { DISCLOSURE, MAX_PERSONAS, MONTESSORI_NOTE, PERSONAS, personaName } from '@/content/personas'
import { dailyQuestion, todayKey } from '@/domain/daily'
import { humanDate } from '@/domain/dates'

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
        <label htmlFor="idea" className="t-display block">
          What are you working on?
        </label>
        <div className="mt-2 flex items-end gap-2">
          <textarea
            id="idea"
            rows={4}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="A business, a project, a decision you keep turning over."
            className="field min-w-0 flex-1 resize-y"
          />
          <MicButton value={idea} onChange={setIdea} label="your idea" />
        </div>

        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
            <span className="flex gap-1">
              {picked.map((id) => (
                <Monogram key={id} id={id} size={24} />
              ))}
            </span>
            <span className="text-[15px] text-marble-200">
              {picked.map(personaName).join(' · ')}
            </span>
            <span className="ml-auto text-[13px] text-marble-400">
              {picked.length}/{MAX_PERSONAS}
            </span>
          </summary>
          <ul className="py-1">
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
                      on ? 'bg-ink-850' : full ? 'opacity-40' : 'hover:bg-ink-900'
                    }`}
                  >
                    <Monogram id={p.id} size={36} lit={on} />
                    <span className="min-w-0 flex-1">
                      <span className={`t-title block ${on ? '' : 'text-marble-300'}`}>
                        {p.name}
                      </span>
                      <span className="block text-[15px] leading-[22px] text-marble-400">
                        {p.brings}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`text-[17px] ${on ? 'text-marble-50' : 'text-marble-400'}`}
                    >
                      {on ? '✓' : '+'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="py-2 text-[13px] leading-[18px] text-marble-400">
            Up to {MAX_PERSONAS} at a time. {MONTESSORI_NOTE}
          </p>
        </details>

        {/* Unlit until there is something to debate: .slab:disabled is an outline. */}
        <button type="submit" disabled={!idea.trim()} className="slab mt-6">
          Convene the council
        </button>
      </form>

      <p className="mt-6 text-[13px] leading-[18px] text-marble-400">{DISCLOSURE}</p>

      <section
        aria-label="Today’s question"
        data-testid="daily-card"
        className="mt-12"
      >
        <p className="t-label">Today’s question · {humanDate(day)}</p>
        <h2 className="t-title mt-2 text-balance">
          {question}
        </h2>
        <p className="mt-2 text-[15px] leading-[22px] text-marble-400">
          The same question for everyone today. Convene on it and share how your council split.
        </p>
        <button
          type="button"
          onClick={() => convene({ idea: question, dailyKey: day, question })}
          className="text-btn mt-2 -ml-3 px-3"
        >
          Convene on this
        </button>
      </section>
    </div>
  )
}
