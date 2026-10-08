import { useState } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { formatCents, formatUsageLine } from '@/domain/usage'

/**
 * Admin-only cost indicator + free/premium switch. Not reachable unless
 * `useCouncil().isAdmin` is true — the caller (App.tsx) never mounts it otherwise.
 * One line, 44 px, under the header; tap to expand the per-model breakdown.
 */
export function AdminBar() {
  const { usage, tier, setTier, session } = useCouncil()
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      data-testid="admin-bar"
      className="border-b border-ink-800 bg-ink-900 text-xs text-marble-300"
    >
      <div className="mx-auto flex h-11 max-w-xl items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label="Usage detail"
          className="min-w-0 flex-1 truncate text-left"
        >
          {usage ? (
            <>
              {formatUsageLine('day', usage.day_cents)} ({usage.sessions_day}) ·{' '}
              {formatUsageLine('week', usage.week_cents)} ({usage.sessions_week}) ·{' '}
              {formatUsageLine('month', usage.month_cents, usage.month_cap_cents)} (
              {usage.sessions_month})
            </>
          ) : (
            'usage: …'
          )}
        </button>

        {session?.tier && (
          <span data-testid="tier-ran" className="shrink-0 text-marble-400">
            ran: {session.tier}
            {session.model ? ` · ${session.model}` : ''}
          </span>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={tier === 'premium'}
          aria-label="Free or premium tier"
          data-testid="tier-toggle"
          onClick={() => setTier(tier === 'premium' ? 'free' : 'premium')}
          className="flex h-11 shrink-0 items-center rounded-card border border-ink-700 px-2 font-semibold text-marble-100"
        >
          {tier}
        </button>
      </div>

      {expanded && usage && (
        <div
          data-testid="admin-bar-models"
          className="mx-auto max-w-xl space-y-1 border-t border-ink-800 px-3 py-2"
        >
          {Object.entries(usage.by_model).map(([model, cents]) => (
            <p key={model}>
              {model}: {formatCents(cents)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
