import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { OutcomeButtons } from '@/components/OutcomeButtons'
import { isOpen } from '@/domain/mastermind'

export function JournalScreen() {
  const { go } = useCouncil()
  const { journal, exportText, setRemind } = useMastermind()
  const { user } = useAuth()
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const entries = journal.entries.filter((e) => e.status !== 'proposal')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText())
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-6">
      <h1 className="pt-3 font-display text-2xl text-marble-100">Journal</h1>
      <p className="mt-1 text-sm text-marble-400">
        {user ? 'Kept on your account.' : 'Kept in this browser only. Sign in to keep it across devices.'}
      </p>

      {entries.length === 0 ? (
        <div className="mt-6">
          <p className="text-sm text-marble-300">No decisions yet.</p>
          <button
            type="button"
            onClick={() => go('start')}
            className="mt-3 min-h-12 w-full rounded-card bg-candle-400 px-4 py-3 font-display text-lg font-semibold text-ink-950"
          >
            Sit down with the group
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-4 min-h-11 w-full rounded-card border border-candle-500/60 px-4 text-sm font-semibold text-candle-200"
          >
            Export (copy as text)
          </button>
          {copied !== 'idle' && (
            <p role="status" className="mt-1 text-xs text-marble-400">
              {copied === 'copied' ? 'Copied — paste it into another session to resume.' : 'Could not copy from this browser.'}
            </p>
          )}
          <ul className="mt-4 space-y-3" data-testid="journal">
            {entries.map((e) => (
              <li key={e.id} className="vellum rounded-card border border-ink-700 p-3">
                <p className="flex items-center gap-2 text-xs text-marble-500">
                  {e.created_at.slice(0, 10)}
                  <span className="rounded-card bg-candle-400/10 px-1.5 uppercase tracking-wide text-candle-300">{e.status}</span>
                  {e.confidence !== null && <span>confidence {e.confidence}</span>}
                </p>
                <p className="mt-1 font-display text-base leading-snug text-marble-100">{e.decision}</p>
                <p className="mt-1 text-xs text-marble-300">{e.reasoning}</p>
                {e.assumptions.length > 0 && (
                  <p className="mt-1 text-xs text-marble-400">Assumptions: {e.assumptions.join('; ')}</p>
                )}
                <p className="mt-1 text-xs text-marble-300">
                  Next: {e.next_action} · {e.owner} · review: {e.review_trigger}
                </p>
                {journal.commitments
                  .filter((c) => c.journal_id === e.id)
                  .map((c) => (
                    <div key={c.id} className="mt-2 border-t border-ink-700 pt-2" data-testid="commitment">
                      <p className="text-sm text-marble-200">
                        {c.what} — by {c.due_date}
                        {c.outcome && <span className="text-marble-500"> · {c.outcome === 'later' ? 'not yet' : c.outcome}</span>}
                      </p>
                      <label className="mt-1 flex min-h-11 items-center gap-2 text-sm text-marble-300">
                        <input
                          type="checkbox"
                          checked={c.remind}
                          onChange={(ev) => setRemind(c.id, ev.target.checked)}
                          className="h-5 w-5 accent-candle-400"
                        />
                        Remind me by email
                      </label>
                      {isOpen(c) && <OutcomeButtons id={c.id} />}
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
