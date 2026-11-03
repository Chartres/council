import { useState } from 'react'
import { SIGNUP_FLAG, useAuth } from '@/auth/AuthContext'
import { track } from '@/analytics'

/**
 * The email sign-in panel: one email carries a link and a six-digit code. The link works on
 * the device that opens it; the code works anywhere (Eyal, 30 Oct: on a new laptop the app had
 * nowhere to type the code). Shown inline where the wall is hit (the gateway's
 * `401 {reason:"sign_in"}` after the one anonymous session), and from the header.
 */
export function SignInPanel({ reason, title = 'Keep this idea' }: { reason?: string; title?: string }) {
  const { configured, signInWithEmail, verifyEmailCode } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [codeError, setCodeError] = useState(false)

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    const digits = code.replace(/\D/g, '')
    if (!digits || checking) return
    setChecking(true)
    setCodeError(false)
    const res = await verifyEmailCode(email, digits)
    setChecking(false)
    // On success the session arrives through AuthContext and the header swaps this panel out.
    if (!res.ok) setCodeError(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    track('signup_started')
    const res = await signInWithEmail(email)
    // signup_completed fires when the link or code actually signs them in (AuthContext).
    if (res.ok) {
      setSent(true)
      try {
        localStorage.setItem(SIGNUP_FLAG, '1') // AuthContext counts the sign-in that follows
      } catch {
        // Private mode: the completion goes uncounted.
      }
    } else setError(res.error ?? 'Something went wrong.')
  }

  return (
    <section aria-label="Sign in" data-testid="sign-in-panel">
      <h2 className="t-title">{title}</h2>
      {reason && <p className="t-body mt-2 text-marble-300">{reason}</p>}
      {!configured ? (
        <p className="t-body mt-2 text-marble-300">Sign-in is not available in this build yet.</p>
      ) : sent ? (
        <form onSubmit={submitCode} className="mt-2" data-testid="sign-in-code">
          <p className="t-body text-laurel-400">
            Check your inbox: an email is on its way to {email}. Open the link on this device, or type the
            code from it here.
          </p>
          <label htmlFor="signin-code" className="t-label mt-3 block">
            Code from the email
          </label>
          <div className="field mt-2 flex items-center gap-1 py-1 pr-1">
            <input
              id="signin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="min-h-11 min-w-0 flex-1 bg-transparent text-[17px] tracking-widest text-marble-100 placeholder:text-marble-400 focus-visible:shadow-none"
            />
            <button type="submit" disabled={!/\d/.test(code) || checking} className="text-btn shrink-0 px-3">
              {checking ? 'Checking…' : 'Use code'}
            </button>
          </div>
          {codeError && (
            <p className="t-body mt-2 text-clay-400" role="alert">
              That code didn’t work. Codes expire and only the newest one counts; use a different email to send a new one.
            </p>
          )}
          <button
            type="button"
            className="text-btn mt-2 min-h-11"
            onClick={() => {
              setSent(false)
              setCode('')
              setCodeError(false)
            }}
          >
            Use a different email
          </button>
        </form>
      ) : (
        <form onSubmit={submit} className="mt-2">
          <label className="sr-only" htmlFor="signin-email">
            Email
          </label>
          <div className="field flex items-center gap-1 py-1 pr-1">
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="min-h-11 min-w-0 flex-1 bg-transparent text-[17px] text-marble-100 placeholder:text-marble-400 focus-visible:shadow-none"
            />
            <button type="submit" className="text-btn shrink-0 px-3">
              Send link
            </button>
          </div>
          {error && <p className="t-body mt-2 text-clay-400">{error}</p>}
        </form>
      )}
    </section>
  )
}
