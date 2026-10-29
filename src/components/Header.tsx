import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCouncil } from '@/app/CouncilContext'
import { useAuth } from '@/auth/AuthContext'
import { supabase } from '@/auth/supabase'
import { AccountPanel } from './AccountPanel'
import { DiscussionsDrawer } from './DiscussionsDrawer'
import { FeedbackSheet } from './Feedback'
import { SignInPanel } from './SignInPanel'

/** One slim row: wordmark, feedback, account. No second chrome row anywhere (mobile-ux tell #8). */
export function Header() {
  const { configured, user, signOut } = useAuth()
  const { gate } = useCouncil()
  const [open, setOpen] = useState<'account' | 'feedback' | null>(null)
  const [drawer, setDrawer] = useState(false)
  const menu = useRef<HTMLButtonElement>(null)
  // Closing hands focus back to the button that opened the sheet.
  const closeDrawer = useCallback(() => {
    setDrawer(false)
    menu.current?.focus()
  }, [])
  const toggle = (panel: 'account' | 'feedback') => setOpen((o) => (o === panel ? null : panel))

  return (
    <header
      className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur"
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-2">
        <div className="flex items-center">
          {gate === 'ready' && (
            <button
              ref={menu}
              type="button"
              onClick={() => setDrawer(true)}
              aria-expanded={drawer}
              aria-label="Discussions"
              data-testid="open-discussions"
              className="-ml-3 flex h-11 w-11 items-center justify-center text-marble-300 hover:text-marble-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <span className="font-display text-lg font-medium text-marble-100">
            Mastermind <span className="font-normal text-marble-400">Council</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          {gate === 'ready' && (
            <button
              type="button"
              onClick={() => toggle('feedback')}
              aria-expanded={open === 'feedback'}
              className="min-h-11 px-3 text-[15px] font-medium text-marble-400 hover:text-marble-100"
            >
              Feedback
            </button>
          )}
          {configured && (
            <button
              type="button"
              onClick={() => toggle('account')}
              aria-expanded={open === 'account'}
              aria-label={user ? 'Account' : 'Sign in'}
              className="flex h-11 w-11 items-center justify-center rounded-full text-marble-400 hover:text-marble-100"
            >
              {user ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-marble-500 bg-ink-800 font-display text-[15px] text-marble-100">
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
      </div>
      {open && (
        <div className="mx-auto max-w-xl px-4 pb-3">
          {open === 'feedback' ? (
            <FeedbackSheet />
          ) : user ? (
            <AccountPanel sb={supabase} user={user} onSignOut={() => void signOut()} />
          ) : (
            <SignInPanel reason="Sign in to keep your ideas across devices." />
          )}
        </div>
      )}
      {/* Outside the header: its backdrop blur would make it the box a fixed sheet sits in. */}
      {drawer && createPortal(<DiscussionsDrawer onClose={closeDrawer} />, document.body)}
    </header>
  )
}
