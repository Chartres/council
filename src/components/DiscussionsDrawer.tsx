import { useEffect, useRef } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { personaName } from '@/content/personas'
import { humanDate } from '@/domain/dates'
import { decisionOf, titleOf } from '@/domain/discussions'

/**
 * Every discussion she has had, one tap from the header (Eyal, 29 Oct: "I can only see the
 * first one … something a bit more like the ChatGPT experience"). Newest first: the question,
 * when, who sat, the decision if one was taken. Quick verdicts sit below. A sheet from the
 * left on a phone, the same sheet on a desktop.
 */
export function DiscussionsDrawer({ onClose }: { onClose: () => void }) {
  const { discussions, openDiscussion, conversation, journal } = useMastermind()
  const { ideas, open, go } = useCouncil()
  const { user } = useAuth()
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // The page under the sheet stays put while she scrolls the list.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const leave = (f: () => void) => () => {
    f()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Discussions">
      <button type="button" aria-label="Close discussions" tabIndex={-1} className="absolute inset-0 bg-ink-950/70" onClick={onClose} />
      <nav
        aria-label="Discussions"
        className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col overflow-y-auto overscroll-contain border-r border-ink-800 bg-ink-900 px-4"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
          paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
        }}
        data-testid="discussions"
      >
        <div className="flex items-center justify-between">
          <p className="t-label">Discussions</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center text-marble-400 hover:text-marble-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <button ref={first} type="button" className="slab mt-2" onClick={leave(() => go('start'))}>
          New discussion
        </button>

        {discussions.length === 0 ? (
          <p className="t-body mt-8 text-marble-400">No discussions yet. Each one you have is kept here.</p>
        ) : (
          <ul className="-mx-3 mt-6 space-y-1">
            {discussions.map((d) => {
              const decision = decisionOf(d, journal.entries)
              const live = conversation?.localId === d.id && !conversation.past
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={leave(() => openDiscussion(d.id))}
                    aria-current={conversation?.localId === d.id ? 'page' : undefined}
                    className={`block min-h-11 w-full rounded-md px-3 py-3 text-left hover:bg-ink-850 ${
                      conversation?.localId === d.id ? 'bg-ink-850' : ''
                    }`}
                  >
                    <span className="t-title line-clamp-2 block">{titleOf(d)}</span>
                    <span className="mt-1 block text-[13px] leading-[18px] text-marble-400">
                      {humanDate(d.created_at, { weekday: false })} · {d.advisers.map(personaName).join(', ')}
                      {live && ' · now'}
                    </span>
                    {decision && (
                      <span className="mt-1 line-clamp-2 block text-[15px] leading-[22px] text-marble-300">{decision}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {ideas.length > 0 && (
          <>
            <p className="t-label mt-10">Quick verdicts</p>
            <ul className="-mx-3 mt-2 space-y-1">
              {ideas.map((idea) => (
                <li key={idea.id}>
                  <button
                    type="button"
                    onClick={leave(() => open(idea))}
                    className="block min-h-11 w-full rounded-md px-3 py-3 text-left hover:bg-ink-850"
                  >
                    <span className="line-clamp-2 block text-[15px] leading-[22px] text-marble-100">{idea.idea}</span>
                    <span className="mt-1 block text-[13px] text-marble-400">{humanDate(idea.created_at, { weekday: false })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-10 text-[13px] leading-[18px] text-marble-400">
          {user ? 'Kept on your account.' : 'Kept in this browser. Sign in to keep them across devices.'}
        </p>
      </nav>
    </div>
  )
}
