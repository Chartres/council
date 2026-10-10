import { useEffect, useRef, useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { ListenToggle, useListen, useNarration } from '@/components/Listen'
import { MicButton } from '@/components/MicButton'
import { Monogram } from '@/components/Monogram'
import { SignInPanel } from '@/components/SignInPanel'
import { DISCLOSURE, personaName } from '@/content/personas'
import { FAILURE_COPY, voteSplit, type Turn, type Vote } from '@/domain/council'
import { dailyShareText, shareText } from '@/domain/daily'

const NO_TURNS: Turn[] = [] // stable identity so the narration effect does not loop
const TIER_LABEL = { free: 'Free council', premium: 'Premium council' } as const

const VOTE_LABEL: Record<Vote, string> = { for: 'for', against: 'against', mixed: 'mixed' }
const VOTE_CLASS: Record<Vote, string> = {
  for: 'text-laurel-400',
  against: 'text-clay-400',
  mixed: 'text-marble-300',
}

export function SessionScreen() {
  const { session, reply, go } = useCouncil()
  const [message, setMessage] = useState('')
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied' | 'failed'>('idle')
  const [listen, setListen] = useListen()
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [session?.turns.length, session?.verdict])

  useNarration(session?.turns ?? NO_TURNS, session?.verdict ?? null, listen)

  if (!session) return null
  const { turns, verdict, streaming, failure, question, dailyKey, idea, tier } = session
  const split = verdict ? voteSplit(verdict.votes) : null

  const sendReply = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return
    setMessage('')
    reply(trimmed)
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-12">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => go('home')} className="text-btn -ml-3 px-3 text-marble-400">
          ← New idea
        </button>
        <ListenToggle on={listen} onChange={setListen} />
      </div>

      <h1 className="t-title mt-2 text-balance">
        {question ?? idea}
      </h1>

      <ol className="mt-12 space-y-6">
        {turns.map((turn, i) => (
          <li key={`${turn.persona}-${i}`} className="rise flex gap-4">
            <Monogram id={turn.persona} />
            <div className="min-w-0 flex-1">
              <p className="t-title">{personaName(turn.persona)}</p>
              <p className="t-body mt-1">{turn.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {streaming && (
        <p className="t-title mt-6 italic text-marble-200" role="status" data-testid="streaming">
          The council is speaking…
        </p>
      )}

      {verdict && split && (
        <section
          aria-label="Verdict"
          data-testid="verdict"
          className="mt-12 border-t-2 border-candle-400 pt-6"
        >
          <p className="t-display">{verdict.summary}</p>

          <p className="t-label mt-6">Next action</p>
          <p className="t-title mt-2">{verdict.next_action}</p>

          {/* The split as one line: who sat, and which way each one went. */}
          <p className="mt-6 font-display text-[20px] leading-[26px] text-marble-200">
            {Object.entries(verdict.votes).map(([id, vote], i) => (
              <span key={id}>
                {i > 0 && <span className="text-marble-400"> · </span>}
                {personaName(id)} <span className={`font-medium ${VOTE_CLASS[vote]}`}>{VOTE_LABEL[vote]}</span>
              </span>
            ))}
          </p>

          {verdict.quotes && verdict.quotes.length > 0 && (
            <div className="mt-12" data-testid="verdict-quotes">
              <ul className="space-y-6">
                {verdict.quotes.map((q, i) => (
                  <li key={i}>
                    <p className="font-display text-[20px] italic leading-[28px] text-marble-100">
                      “{q.text}”{' '}
                      <span className="font-sans text-[13px] not-italic text-marble-400">
                        — {personaName(q.persona)}, {q.locator}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dailyKey && (
            <div className="mt-6">
              <p className="text-[15px] text-marble-300">
                {split.for} for · {split.mixed} mixed · {split.against} against
              </p>
              <button
                type="button"
                onClick={async () =>
                  setShareState(
                    await shareText(dailyShareText(dailyKey, question ?? idea, verdict)),
                  )
                }
                className="text-btn -ml-3 px-3"
              >
                Share today’s split
              </button>
              {shareState !== 'idle' && (
                <p className="mt-2 text-[13px] text-marble-400" role="status">
                  {shareState === 'copied'
                    ? 'Copied — your own text is never included.'
                    : shareState === 'shared'
                      ? 'Shared.'
                      : 'Could not share from this browser.'}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Which council sat, never which model (DESIGN.md: no model names in the UI). */}
      {tier && (
        <p className="mt-6 text-[13px] text-marble-400" data-testid="tier">
          {TIER_LABEL[tier]}
        </p>
      )}

      {failure === 'sign_in' && (
        <div className="mt-6">
          <SignInPanel reason={FAILURE_COPY.sign_in} />
        </div>
      )}

      {failure && failure !== 'sign_in' && (
        <p
          className="t-body mt-6 border-l-2 border-clay-500 pl-4"
          role="alert"
          data-testid="failure"
        >
          {FAILURE_COPY[failure]}
        </p>
      )}

      {verdict && !streaming && !failure && (
        <form onSubmit={sendReply} className="mt-12">
          <label htmlFor="reply" className="sr-only">
            Answer the council
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="reply"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Push back, add a constraint, ask them to go further."
              className="field min-w-0 flex-1 resize-y"
            />
            <MicButton value={message} onChange={setMessage} label="your reply" />
          </div>
          <button
            type="submit"
            disabled={!message.trim()}
            className="slab mt-2"
          >
            Continue the debate
          </button>
        </form>
      )}

      <p className="mt-12 text-[13px] leading-[18px] text-marble-400">{DISCLOSURE}</p>
      <div ref={end} />
    </div>
  )
}
