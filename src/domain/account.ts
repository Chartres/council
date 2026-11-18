import type { SupabaseClient } from '@supabase/supabase-js'

// Export everything / Delete everything (trust control 5). Reads go through own-row RLS;
// delete is the SECURITY DEFINER `council_delete_me()` RPC, which removes the rows and the
// auth user (docs/SUPABASE.md).

export const EXPORT_TABLES = ['council_sessions', 'council_journal', 'council_commitments', 'council_ideas'] as const
type Table = (typeof EXPORT_TABLES)[number]
export type ExportRows = Record<Table, unknown[] | null>

export async function fetchExport(sb: SupabaseClient, userId: string): Promise<ExportRows> {
  const results = await Promise.all(EXPORT_TABLES.map((t) => sb.from(t).select('*').eq('user_id', userId)))
  const rows = {} as ExportRows
  results.forEach((res, i) => {
    if (res.error) throw res.error
    rows[EXPORT_TABLES[i]] = res.data
  })
  return rows
}

export function shapeExport(rows: ExportRows, email: string | undefined, now: Date) {
  return {
    app: 'Mastermind Council',
    exported_at: now.toISOString(),
    email: email ?? null,
    sessions: rows.council_sessions ?? [],
    journal: rows.council_journal ?? [],
    commitments: rows.council_commitments ?? [],
    ideas: rows.council_ideas ?? [],
  }
}

export const exportFilename = (now: Date) => `council-export-${now.toISOString().slice(0, 10)}.json`

/**
 * The gateway's approval record for this account (email and state), deleted before the
 * Supabase rows. 204 or 404 (a gateway older than the route) count as done; anything else
 * is false, and the caller stops so nobody is told everything is gone when it is not.
 */
export async function forgetAccess(gatewayUrl: string, token: string | null): Promise<boolean> {
  try {
    const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/v1/council/access`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token ?? ''}` },
    })
    return res.status === 204 || res.status === 404
  } catch {
    return false
  }
}

/** Every key this app keeps in the browser except the beta password, plus the Supabase session. */
export function clearLocalState(storage: Storage = localStorage) {
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
    for (const k of keys) if (k && k !== 'council:key') storage.removeItem(k)
  } catch {
    // Nothing stored, nothing to clear.
  }
}
