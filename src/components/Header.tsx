import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { SignInPanel } from './SignInPanel'

/** One slim row: wordmark + account. No second chrome row anywhere (mobile-ux tell #8). */
export function Header() {
  const { configured, user, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <header
      className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur"
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2">
        <span className="font-display text-lg text-candle-200">
          Mastermind <span className="text-marble-200">Council</span>
        </span>
        {configured && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={user ? 'Account' : 'Sign in'}
            className="flex h-11 w-11 items-center justify-center rounded-full text-marble-400 hover:text-candle-300"
          >
            {user ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-candle-400/60 font-display text-sm text-candle-200">
                {user.email?.[0]?.toUpperCase() ?? '·'}
              </span>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
      </div>
      {open && (
        <div className="mx-auto max-w-xl px-4 pb-4">
          {user ? (
            <div className="vellum rounded-card border border-ink-700 p-4">
              <p className="truncate text-sm text-marble-300">{user.email}</p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-3 min-h-11 w-full rounded-card border border-ink-600 px-4 py-2 text-sm font-semibold text-marble-200 hover:border-marble-400"
              >
                Sign out
              </button>
            </div>
          ) : (
            <SignInPanel reason="Sign in to keep your ideas across devices." />
          )}
        </div>
      )}
    </header>
  )
}
