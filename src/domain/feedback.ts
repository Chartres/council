// POST /v1/feedback {text ≤ 2000, page, session_id?} → 204; 429 over the daily cap.
// The gateway stores it in D1 and emails Pavol; the flywheel sweep turns open items into findings.

import { gatewayHeaders, type StreamOptions } from './council'

export const MAX_FEEDBACK = 2000

export async function sendFeedback(
  input: { text: string; page: string; session_id?: string | null },
  opts: StreamOptions,
): Promise<'sent' | 'quota' | 'failed'> {
  const body = {
    text: input.text.trim().slice(0, MAX_FEEDBACK),
    page: input.page,
    ...(input.session_id ? { session_id: input.session_id } : {}),
  }
  try {
    const res = await fetch(`${opts.gatewayUrl.replace(/\/$/, '')}/v1/feedback`, {
      method: 'POST',
      headers: { ...gatewayHeaders(opts), accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (res.ok) return 'sent'
    return res.status === 429 ? 'quota' : 'failed'
  } catch {
    return 'failed'
  }
}
