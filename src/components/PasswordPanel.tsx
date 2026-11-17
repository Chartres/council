import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { FAILURE_COPY } from '@/domain/council'
import { useAuth } from '@/auth/AuthContext'
import { SignInPanel } from '@/components/SignInPanel'
import { Device } from '@/components/Furniture'
import { PRIVATELY_PRINTED } from '@/content/catalogue'

/**
 * The private-beta door. One field, no account — the gateway checks the password
 * (`GET /v1/council/key`) before this panel ever closes, so a wrong guess never
 * costs the idea text an in-flight convene/reply would otherwise have carried.
 */
export function PasswordPanel() {
  const { submitKey, checkingKey, keyError, gate, checkAgain } = useCouncil()
  const { user, configured, signOut } = useAuth()
  const [value, setValue] = useState('')
  const [signIn, setSignIn] = useState(false)
  const [checking, setChecking] = useState(false)
  const [stillWaiting, setStillWaiting] = useState(false)
  const disabled = !value.trim() || checkingKey
  // Pavol, 17 Nov: a signed-in account waits for his approval; the password still opens.
  const waiting = gate === 'approval'

  return (
    <div className="mx-auto max-w-xl px-4 pt-3 pb-6">
      <section
        aria-label="Council password"
        data-testid="password-panel"
        className="pt-3"
      >
        <Device size={92} label="Mastermind Council" className="mx-auto mt-3" />
        <p className="rubric mt-4 text-center">{PRIVATELY_PRINTED}</p>
        {waiting ? (
          <>
            <h1 className="t-display mt-2 text-center">Waiting for approval</h1>
            <p className="t-body mt-2 text-center text-marble-300" data-testid="approval-waiting">
              Pavol has been told that {user?.email ?? 'your account'} would like to join. You will get in as soon as he
              approves. If you have the council password, you can enter it below.
            </p>
            <div className="mt-6 text-center">
              <button
                type="button"
                className="slab"
                disabled={checking}
                onClick={async () => {
                  setChecking(true)
                  setStillWaiting(!(await checkAgain()))
                  setChecking(false)
                }}
              >
                {checking ? 'Checking…' : 'Check again'}
              </button>
              <button type="button" className="text-btn mt-2 px-3" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
            {stillWaiting && (
              <p className="t-note text-center" role="status" data-testid="approval-still-waiting">
                Not approved yet.
              </p>
            )}
            <div className="dbl mt-4" />
          </>
        ) : (
          <>
            <h1 className="t-display mt-2 text-center">Enter the council password</h1>
            <p className="t-body mt-2 text-center text-marble-300">
              The council is in private beta. The password comes from Pavol.
            </p>
          </>
        )}
        {/* Eyal, 30 Oct: on a new laptop the email code signed him in and this door still asked
            for "the password". They are two different things; say which is which. */}
        {configured && !waiting && (
          <p className="t-note mt-2 text-center" data-testid="password-vs-account">
            {user
              ? `You are signed in as ${user.email ?? 'your account'}, but the council did not accept the sign-in this time. The beta password still works.`
              : 'This is not your account sign-in. If you have an account, sign in with your email instead; you do not need the password.'}
          </p>
        )}
        {configured && !user && (
          <>
            <button type="button" onClick={() => setSignIn((s) => !s)} aria-expanded={signIn} className="text-btn -ml-3 mt-2 px-3">
              Have an account? Sign in
            </button>
            {signIn && <SignInPanel title="Sign in" reason="We email you a link and a six-digit code." />}
          </>
        )}
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
