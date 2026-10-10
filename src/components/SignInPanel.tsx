import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { track } from '@/analytics'

/**
 * The magic-link panel. Shown inline where the wall is hit (the gateway's
 * `401 {reason:"sign_in"}` after the one anonymous session), and from the header.
 */
export function SignInPanel({ reason, title = 'Keep this idea' }: { reason?: string; title?: string }) {
  const { configured, signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    track('signup_started')
    const res = await signInWithEmail(email)
    if (res.ok) {
      setSent(true)
      track('signup_completed')
    } else setError(res.error ?? 'Something went wrong.')
  }

  return (
    <section aria-label="Sign in" data-testid="sign-in-panel">
      <h2 className="t-title">{title}</h2>
      {reason && <p className="t-body mt-2 text-marble-300">{reason}</p>}
      {!configured ? (
        <p className="t-body mt-2 text-marble-300">Sign-in is not available in this build yet.</p>
      ) : sent ? (
        <p className="t-body mt-2 text-laurel-400">Check your inbox — the sign-in link is on its way to {email}.</p>
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
