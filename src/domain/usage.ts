// Admin-only cost indicator. `GET /v1/admin/usage` on the gateway, same auth as
// every other call (Supabase JWT + the beta password), but never streamed — it's
// a single JSON object, not SSE.

export interface Usage {
  day_cents: number
  week_cents: number
  month_cents: number
  month_cap_cents: number
  sessions_day: number
  sessions_week: number
  sessions_month: number
  by_model: Record<string, number>
}

export interface UsageOptions {
  gatewayUrl: string
  token?: string | null
  councilKey?: string | null
  signal?: AbortSignal
}

export async function fetchUsage({
  gatewayUrl,
  token,
  councilKey,
  signal,
}: UsageOptions): Promise<Usage | null> {
  try {
    const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/v1/admin/usage`, {
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(councilKey ? { 'x-council-key': councilKey } : {}),
      },
      signal,
    })
    if (!res.ok) return null
    return (await res.json()) as Usage
  } catch {
    return null
  }
}

/** Cents under a euro read as "¢" with one decimal; a euro or more reads as "€". */
export function formatCents(cents: number): string {
  if (cents >= 100) return `€${(cents / 100).toFixed(2)}`
  return `${cents.toFixed(1)} ¢`
}

/** "month: 12.3 ¢ / 3000" with a cap, "today: 1.2 ¢" without one. */
export function formatUsageLine(label: string, cents: number, capCents?: number): string {
  const amount = formatCents(cents)
  return capCents != null ? `${label}: ${amount} / ${capCents}` : `${label}: ${amount}`
}
