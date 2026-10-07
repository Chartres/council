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
    <div className="mx-auto max-w-xl px-4 pb-6">
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => go('home')}
          className="min-h-11 text-sm text-marble-400 hover:text-candle-300"
        >
          ← New idea
        </button>
        <ListenToggle on={listen} onChange={setListen} />
      </div>

      <h1 className="mt-1 font-display text-xl leading-snug text-marble-100 text-balance">
        {question ?? idea}
      </h1>

      <ol className="mt-5 space-y-5">
        {turns.map((turn, i) => (
          <li key={`${turn.persona}-${i}`} className="rise flex gap-3">
            <Monogram id={turn.persona} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-base text-candle-200">
                {personaName(turn.persona)}
              </p>
              <p className="mt-1 text-[0.95rem] leading-relaxed text-marble-200">{turn.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {streaming && (
        <p className="mt-5 text-sm text-marble-400" role="status" data-testid="streaming">
          The council is speaking…
        </p>
      )}

      {verdict && split && (
        <section
          aria-label="Verdict"
          data-testid="verdict"
          className="vellum lit mt-7 rounded-card border border-candle-500/40 p-4"
        >
          <p className="font-display text-xs uppercase tracking-widest text-candle-400">Verdict</p>
          <p className="mt-2 text-[0.98rem] leading-relaxed text-marble-100">{verdict.summary}</p>

          <p className="mt-4 font-display text-xs uppercase tracking-widest text-candle-400">
            Next action
          </p>
          <p className="mt-1 text-[0.98rem] leading-relaxed text-marble-100">
            {verdict.next_action}
          </p>

          {verdict.quotes && verdict.quotes.length > 0 && (
            <div className="mt-4 border-t border-ink-700 pt-3" data-testid="verdict-quotes">
              <p className="font-display text-xs uppercase tracking-widest text-candle-400">
                From the texts
              </p>
              <ul className="mt-2 space-y-2">
                {verdict.quotes.map((q, i) => (
                  <li key={i} className="flex gap-2">
                    <Monogram id={q.persona} size={24} />
                    <p className="font-serif text-[0.95rem] leading-relaxed text-marble-200">
                      “{q.text}”{' '}
                      <span className="text-xs text-marble-400">
                        — {personaName(q.persona)}, {q.locator}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="mt-4 flex flex-wrap gap-2 border-t border-ink-700 pt-3">
            {Object.entries(verdict.votes).map(([id, vote]) => (
              <li key={id} className="flex items-center gap-2 rounded-card bg-ink-850 px-2 py-1">
                <Monogram id={id} size={24} />
                <span className="text-xs text-marble-300">{personaName(id)}</span>
                <span className={`text-xs font-semibold ${VOTE_CLASS[vote]}`}>
                  {VOTE_LABEL[vote]}
                </span>
              </li>
            ))}
          </ul>

          {dailyKey && (
            <div className="mt-4 border-t border-ink-700 pt-3">
              <p className="text-sm text-marble-300">
                {split.for} for · {split.mixed} mixed · {split.against} against
              </p>
              <button
                type="button"
                onClick={async () =>
                  setShareState(
                    await shareText(dailyShareText(dailyKey, question ?? idea, verdict)),
                  )
                }
                className="mt-2 min-h-11 w-full rounded-card border border-candle-500/60 px-4 py-2 font-semibold text-candle-200 hover:bg-candle-400/10"
              >
                Share today’s split
              </button>
              {shareState !== 'idle' && (
                <p className="mt-2 text-xs text-marble-400" role="status">
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
        <p className="mt-3 text-xs text-marble-500" data-testid="tier">
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
          className="mt-6 rounded-card border border-ink-700 bg-ink-900 p-4 text-sm text-marble-200"
          role="alert"
          data-testid="failure"
        >
          {FAILURE_COPY[failure]}
        </p>
      )}

      {verdict && !streaming && !failure && (
        <form onSubmit={sendReply} className="mt-6">
          <label htmlFor="reply" className="block text-sm text-marble-300">
            Answer the council
          </label>
          <div className="mt-1 flex items-end gap-2">
            <textarea
              id="reply"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Push back, add a constraint, ask them to go further."
              className="min-w-0 flex-1 resize-y rounded-card border border-ink-700 bg-ink-900 px-3 py-3 text-base leading-relaxed text-marble-100 placeholder:text-marble-500 focus:border-candle-500"
            />
            <MicButton value={message} onChange={setMessage} label="your reply" />
          </div>
          <button
            type="submit"
            disabled={!message.trim()}
            className={`mt-2 min-h-12 w-full rounded-card px-4 py-3 font-display text-lg font-semibold ${
              message.trim()
                ? 'bg-candle-400 text-ink-950 hover:bg-candle-300'
                : 'border border-ink-700 bg-transparent text-marble-500'
            }`}
          >
            Continue the debate
          </button>
        </form>
      )}

      <p className="mt-6 text-xs leading-snug text-marble-500">{DISCLOSURE}</p>
      <div ref={end} />
    </div>
  )
}
