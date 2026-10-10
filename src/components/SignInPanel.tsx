import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { track } from '@/analytics'

/**
 * The magic-link panel. Shown inline where the wall is hit (the gateway's
 * `401 {reason:"sign_in"}` after the one anonymous session), and from the header.
 */
export function SignInPanel({ reason }: { reason?: string }) {
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
    <section
      aria-label="Sign in"
      className="py-1"
      data-testid="sign-in-panel"
    >
      <h2 className="font-display text-xl text-candle-200">Keep this idea</h2>
      <p className="mt-1 text-sm text-marble-300">
        {reason ?? 'Sign in to keep your ideas and convene the council again.'}
      </p>
      {!configured ? (
        <p className="mt-3 text-sm text-marble-400">
          Sign-in is not wired up in this build, so your ideas stay in this browser.
        </p>
      ) : sent ? (
        <p className="mt-3 text-sm text-laurel-400">
          Check your inbox — the sign-in link is on its way to {email}.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3">
          <label className="block text-sm text-marble-300" htmlFor="signin-email">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="mt-1 w-full rounded-card border border-ink-700 bg-ink-850 px-3 py-3 text-base text-marble-100 placeholder:text-marble-500 focus:border-candle-500"
          />
          <button
            type="submit"
            className="mt-3 min-h-11 w-full rounded-card bg-candle-400 px-4 py-3 font-semibold text-ink-950 hover:bg-candle-300"
          >
            Send a sign-in link
          </button>
          {error && <p className="mt-2 text-sm text-clay-400">{error}</p>}
        </form>
      )}
    </section>
  )
}
