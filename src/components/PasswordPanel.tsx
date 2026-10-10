import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { FAILURE_COPY } from '@/domain/council'

/**
 * The private-beta door. One field, no account — the gateway checks the password
 * (`GET /v1/council/key`) before this panel ever closes, so a wrong guess never
 * costs the idea text an in-flight convene/reply would otherwise have carried.
 */
export function PasswordPanel() {
  const { submitKey, checkingKey, keyError } = useCouncil()
  const [value, setValue] = useState('')
  const disabled = !value.trim() || checkingKey

  return (
    <div className="mx-auto max-w-xl px-4 pt-3 pb-6">
      <section
        aria-label="Council password"
        data-testid="password-panel"
        className="pt-3"
      >
        <h1 className="t-display">Enter the council password</h1>
        <p className="t-body mt-2 text-marble-300">
          The council is in private beta. The password comes from Pavol.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitKey(value)
          }}
          className="mt-6"
        >
          <label htmlFor="council-key" className="t-label block">
            Password
          </label>
          <input
            id="council-key"
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="field mt-2"
          />
          <button
            type="submit"
            disabled={disabled}
            className="slab mt-6"
          >
            {checkingKey ? 'Checking…' : 'Enter'}
          </button>
          {keyError === 'password' && (
            <p className="t-body mt-2 text-clay-400" role="alert" data-testid="password-rejected">
              {FAILURE_COPY.password}
            </p>
          )}
          {keyError === 'gateway' && (
            <p className="t-body mt-2 text-clay-400" role="alert" data-testid="password-gateway-error">
              {FAILURE_COPY.gateway}
            </p>
          )}
        </form>
      </section>
    </div>
  )
}
