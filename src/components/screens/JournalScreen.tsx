import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { OutcomeButtons } from '@/components/OutcomeButtons'
import { humanDate } from '@/domain/dates'
import { isOpen } from '@/domain/mastermind'

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

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
    <div className="mx-auto max-w-xl px-4 pb-12">
      <h1 className="t-display pt-6">Journal</h1>
      <p className="t-body mt-2 text-marble-400">
        {user ? 'Kept on your account.' : 'Kept in this browser only. Sign in to keep it across devices.'}
      </p>

      {entries.length === 0 ? (
        <div className="mt-12">
          <p className="t-body">No decisions yet.</p>
          <button type="button" onClick={() => go('start')} className="slab mt-6">
            Sit down with the group
          </button>
        </div>
      ) : (
        <>
          <ul className="mt-12 space-y-12" data-testid="journal">
            {entries.map((e) => (
              <li key={e.id}>
                <p className="t-title">{e.decision}</p>
                <p className="t-label mt-2">
                  {e.status} · {humanDate(e.created_at, { weekday: false })}
                  {e.confidence !== null && ` · ${e.confidence} % confident`}
                </p>
                {!journal.commitments.some((c) => c.journal_id === e.id) && (
                  <p className="t-body mt-2 text-marble-300">{sentence(e.next_action)}</p>
                )}
                {journal.commitments
                  .filter((c) => c.journal_id === e.id)
                  .map((c) => (
                    <div key={c.id} className="mt-6" data-testid="commitment">
                      <p className="t-body text-marble-100">
                        {sentence(c.what)} by <span className="whitespace-nowrap">{humanDate(c.due_date)}</span>
                        {c.outcome && <span className="text-marble-400"> · {c.outcome === 'later' ? 'not yet' : c.outcome}</span>}
                      </p>
                      {isOpen(c) && <OutcomeButtons id={c.id} />}
                      <label className="mt-2 flex min-h-11 items-center gap-2 text-[17px] text-marble-300">
                        <input
                          type="checkbox"
                          checked={c.remind}
                          onChange={(ev) => setRemind(c.id, ev.target.checked)}
                          className="h-5 w-5 accent-candle-400"
                        />
                        Remind me by email
                      </label>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void copy()} className="text-btn mt-12 -ml-3 px-3">
            Export (copy as text)
          </button>
          {copied !== 'idle' && (
            <p role="status" className="t-body mt-2 text-marble-300">
              {copied === 'copied' ? 'Copied — paste it into another session to resume.' : 'Could not copy from this browser.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
