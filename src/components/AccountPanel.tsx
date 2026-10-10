import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/analytics'
import { PrivacyLink } from '@/components/screens/PrivacyScreen'
import { clearLocalState, exportFilename, fetchExport, shapeExport } from '@/domain/account'

/** Signed-in account menu: sign out, export everything, delete everything. */
export function AccountPanel({
  sb,
  user,
  onSignOut,
  onDeleted = () => window.location.replace('/'),
}: {
  sb: SupabaseClient | null
  user: { id: string; email?: string }
  onSignOut: () => void
  onDeleted?: () => void
}) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const exportAll = async () => {
    if (!sb) return
    setProblem(null)
    try {
      const now = new Date()
      const doc = shapeExport(await fetchExport(sb, user.id), user.email, now)
      const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = exportFilename(now)
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      logError(e, { where: 'export' })
      setProblem('The export failed. Try again in a moment.')
    }
  }

  const deleteAll = async () => {
    if (!sb) return
    setStep('deleting')
    const { error } = await sb.rpc('council_delete_me')
    if (error) {
      logError(error, { where: 'delete_me' })
      setProblem('Nothing was deleted. Try again, or write to council@dravec.org.')
      setStep('confirm')
      return
    }
    // The auth user is gone server-side; dropping the stored session signs this browser out
    // without a re-render that would copy the journal back into localStorage.
    clearLocalState()
    onDeleted()
  }

  return (
    <section aria-label="Account" className="text-sm" data-testid="account-panel">
      <p className="truncate text-marble-300">{user.email}</p>
      <div className="flex flex-wrap gap-x-5">
        <button type="button" onClick={onSignOut} className="min-h-11 text-marble-200 hover:text-candle-300">
          Sign out
        </button>
        <button type="button" onClick={() => void exportAll()} className="min-h-11 text-marble-200 hover:text-candle-300">
          Export everything
        </button>
        {step === 'idle' && (
          <button type="button" onClick={() => setStep('confirm')} className="min-h-11 text-clay-400 hover:text-clay-500">
            Delete everything
          </button>
        )}
      </div>
      {step !== 'idle' && (
        <div className="mt-1 border-t border-ink-800 pt-2" data-testid="delete-confirm">
          <label htmlFor="delete-typed" className="block text-marble-300">
            This deletes your sessions, journal, commitments and account. It cannot be undone. Type DELETE to confirm.
          </label>
          <input
            id="delete-typed"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-1 w-full rounded-card border border-ink-700 bg-ink-900 px-3 py-2 text-base text-marble-100"
          />
          <div className="flex gap-x-5">
            <button
              type="button"
              disabled={typed !== 'DELETE' || step === 'deleting'}
              onClick={() => void deleteAll()}
              className="min-h-11 font-semibold text-clay-400 disabled:text-marble-500"
            >
              {step === 'deleting' ? 'Deleting…' : 'Delete everything'}
            </button>
            <button type="button" onClick={() => setStep('idle')} className="min-h-11 text-marble-300">
              Cancel
            </button>
          </div>
        </div>
      )}
      {problem && <p className="text-clay-400">{problem}</p>}
      <p className="mt-1 text-xs text-marble-500">
        <PrivacyLink />
      </p>
    </section>
  )
}
