import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { FAILURE_COPY } from '@/domain/council'

/** The private-beta door. One field, no account — the gateway checks the password. */
export function PasswordPanel({ rejected }: { rejected?: boolean }) {
  const { submitKey } = useCouncil()
  const [value, setValue] = useState('')

  return (
    <div className="mx-auto max-w-xl px-4 pt-3 pb-6">
      <section
        aria-label="Council password"
        data-testid="password-panel"
        className="vellum rounded-card border border-ink-700 p-4"
      >
        <h1 className="font-display text-2xl text-marble-100">Enter the council password</h1>
        <p className="mt-2 text-sm leading-relaxed text-marble-300">
          The council is in private beta. The password comes from Pavol.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitKey(value)
          }}
          className="mt-3"
        >
          <label htmlFor="council-key" className="block text-sm text-marble-300">
            Password
          </label>
          <input
            id="council-key"
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-card border border-ink-700 bg-ink-850 px-3 py-3 text-base text-marble-100 placeholder:text-marble-500 focus:border-candle-500"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className={`mt-3 min-h-12 w-full rounded-card px-4 py-3 font-display text-lg font-semibold ${
              value.trim()
                ? 'lit bg-candle-400 text-ink-950 hover:bg-candle-300'
                : 'border border-ink-700 bg-transparent text-marble-500'
            }`}
          >
            Enter
          </button>
          {rejected && (
            <p className="mt-2 text-sm text-clay-400" role="alert" data-testid="password-rejected">
              {FAILURE_COPY.password}
            </p>
          )}
        </form>
      </section>
    </div>
  )
}
