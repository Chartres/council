// Gateway client for the council SSE contract
// (flywheel/docs/expansion/council-build.md "Gateway contract"):
//   POST /v1/council/session  { idea, personas[1..4], turns?, anon? }
//   POST /v1/council/reply    { session_id, message }
// Both answer with an SSE stream of:
//   {type:"turn", persona, text} … {type:"verdict", summary, next_action, votes}
//   … {type:"done", usage:{cost_cents}}
// Error bodies: 401 {reason:"sign_in"} · 429 {reason:"quota"} · 503 {reason:"cap"}
//
// EventSource cannot POST, so this is fetch + a hand-rolled SSE reader. That also
// keeps the dependency list at zero for the streaming path.

export type Vote = 'for' | 'against' | 'mixed'

export interface Verdict {
  summary: string
  next_action: string
  votes: Record<string, Vote>
}

export interface Turn {
  persona: string
  text: string
}

export type CouncilEvent =
  | ({ type: 'session'; session_id: string })
  | ({ type: 'turn' } & Turn)
  | ({ type: 'verdict' } & Verdict)
  | { type: 'done'; usage?: { cost_cents?: number } }
  | { type: 'error'; reason: string; message?: string }

export type FailureReason = 'sign_in' | 'quota' | 'cap' | 'gateway'

export class CouncilError extends Error {
  constructor(
    readonly reason: FailureReason,
    message?: string,
  ) {
    super(message ?? reason)
    this.name = 'CouncilError'
  }
}

const REASONS: Record<number, FailureReason> = { 401: 'sign_in', 429: 'quota', 503: 'cap' }

/**
 * Split an SSE buffer into complete events, returning the unparsed tail.
 * Handles multi-line `data:` payloads, `\r\n`, comments and unknown fields.
 */
export function parseSse(buffer: string): { events: CouncilEvent[]; rest: string } {
  const normalised = buffer.replace(/\r\n/g, '\n')
  const boundary = normalised.lastIndexOf('\n\n')
  if (boundary === -1) return { events: [], rest: normalised }

  const events: CouncilEvent[] = []
  for (const block of normalised.slice(0, boundary).split('\n\n')) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data || data === '[DONE]') continue
    try {
      const parsed = JSON.parse(data) as CouncilEvent
      if (parsed && typeof parsed.type === 'string') events.push(parsed)
    } catch {
      // A truncated or non-JSON frame is not worth tearing the stream down for.
    }
  }
  return { events, rest: normalised.slice(boundary + 2) }
}

export interface StreamOptions {
  gatewayUrl: string
  /** Supabase access token; omitted for the one anonymous session. */
  token?: string | null
  signal?: AbortSignal
}

async function* stream(
  path: string,
  body: unknown,
  { gatewayUrl, token, signal }: StreamOptions,
): AsyncGenerator<CouncilEvent> {
  let res: Response
  try {
    res = await fetch(`${gatewayUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      // The anonymous allowance is a signed httpOnly cookie set by the Worker.
      credentials: 'include',
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    throw new CouncilError('gateway', e instanceof Error ? e.message : 'Network error')
  }

  if (!res.ok) {
    const reason = REASONS[res.status]
    const payload = (await res.json().catch(() => null)) as { reason?: string } | null
    throw new CouncilError(
      reason ?? (payload?.reason as FailureReason) ?? 'gateway',
      `Gateway returned ${res.status}`,
    )
  }

  // The contract leaves session_id's channel open; accept either a header or an event.
  const headerSessionId = res.headers.get('x-session-id')
  if (headerSessionId) yield { type: 'session', session_id: headerSessionId }

  if (!res.body) throw new CouncilError('gateway', 'Gateway sent no stream')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSse(buffer)
    buffer = rest
    for (const event of events) yield event
  }
}

export function openSession(
  input: { idea: string; personas: string[]; turns?: number; anon?: boolean },
  options: StreamOptions,
): AsyncGenerator<CouncilEvent> {
  return stream('/v1/council/session', input, options)
}

export function replyToSession(
  input: { session_id: string; message: string },
  options: StreamOptions,
): AsyncGenerator<CouncilEvent> {
  return stream('/v1/council/reply', input, options)
}

export function voteSplit(votes: Record<string, Vote>): { for: number; against: number; mixed: number } {
  const split = { for: 0, against: 0, mixed: 0 }
  for (const vote of Object.values(votes)) if (vote in split) split[vote] += 1
  return split
}

export const FAILURE_COPY: Record<FailureReason, string> = {
  sign_in: 'Your free session is used up. Sign in to keep this idea and convene again.',
  quota: 'You have reached today’s limit of three councils. Come back tomorrow.',
  cap: 'The council is closed for this month — the running budget is spent. It reopens on the 1st.',
  gateway: 'The council could not be reached. Try again in a moment.',
}
