import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCouncil, type View } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { supabase } from '@/auth/supabase'
import { AccountPanel } from './AccountPanel'
import { DiscussionsDrawer } from './DiscussionsDrawer'
import { FeedbackSheet } from './Feedback'
import { SignInPanel } from './SignInPanel'

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']

const HEAD: Partial<Record<View, string>> = {
  journal: 'Journal',
  home: 'Quick verdict',
  session: 'Quick verdict',
  ideas: 'My ideas',
  privacy: 'Privacy',
}

/** What the running head names: the book, or the part of it that is open. */
export function runningHead(view: View, items: { kind: string; state?: string }[] = []): string {
  if (view === 'conversation') {
    if (items.some((it) => it.kind === 'proposal' && it.state === 'open')) return 'Quaestio'
    const n = items.filter((it) => it.kind === 'floor').length
    if (n) return ORDINAL[n - 1] ? `The ${ORDINAL[n - 1]} question` : `Question ${n}`
  }
  return HEAD[view] ?? 'Mastermind Council'
}

/** One slim row, set as a running head: discussions, the title in small capitals, feedback,
 * account; a double rule under it. No second chrome row anywhere (mobile-ux tell #8). */
export function Header() {
  const { configured, user, token, signOut } = useAuth()
  const { gate, view } = useCouncil()
  const { conversation } = useMastermind()
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
      className="sticky top-0 z-30 bg-ink-950/90 backdrop-blur"
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-1">
        <div className="flex min-w-0 items-center">
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
          <span className="running-head truncate py-1" data-testid="running-head">
            {runningHead(gate === 'ready' ? view : 'start', conversation?.items)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {gate === 'ready' && (
            <button
              type="button"
              onClick={() => toggle('feedback')}
              aria-expanded={open === 'feedback'}
              className="head-link sc min-h-11 px-3 text-[17px] text-marble-400 hover:text-marble-100"
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
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-marble-500 bg-ink-800 font-display text-[17px] text-marble-100">
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
            <AccountPanel sb={supabase} user={user} token={token} onSignOut={() => void signOut()} />
          ) : (
            <SignInPanel reason="Sign in to keep your ideas across devices." />
          )}
        </div>
      )}
      <div className="mx-auto max-w-xl px-4">
        <div className="dbl" />
      </div>
      {/* Outside the header: its backdrop blur would make it the box a fixed sheet sits in. */}
      {drawer && createPortal(<DiscussionsDrawer onClose={closeDrawer} />, document.body)}
    </header>
  )
}
