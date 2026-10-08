import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CouncilError,
  gatewayHeaders,
  openSession,
  parseSse,
  voteSplit,
  type CouncilEvent,
} from './council'

describe('parseSse', () => {
  it('returns complete events and keeps the partial tail', () => {
    const { events, rest } = parseSse(
      'data: {"type":"turn","persona":"seneca","text":"Count the cost."}\n\n' +
        'data: {"type":"turn","persona":"socra',
    )
    expect(events).toEqual([{ type: 'turn', persona: 'seneca', text: 'Count the cost.' }])
    expect(rest).toBe('data: {"type":"turn","persona":"socra')
  })

  it('joins multi-line data payloads and survives \\r\\n framing', () => {
    const { events } = parseSse(
      'event: message\r\ndata: {"type":"verdict",\r\ndata: "summary":"Run it small",\r\n' +
        'data: "next_action":"Ship one page",\r\ndata: "votes":{"seneca":"for"}}\r\n\r\n',
    )
    expect(events[0]).toEqual({
      type: 'verdict',
      summary: 'Run it small',
      next_action: 'Ship one page',
      votes: { seneca: 'for' },
    })
  })

  it('skips comments, keep-alives and malformed frames instead of throwing', () => {
    const { events } = parseSse(
      ': keep-alive\n\ndata: not json\n\ndata: [DONE]\n\ndata: {"type":"done"}\n\n',
    )
    expect(events).toEqual<CouncilEvent[]>([{ type: 'done' }])
  })
})

describe('gatewayHeaders', () => {
  it('sends the private-beta key and the token when both are known', () => {
    expect(gatewayHeaders({ token: 'jwt', councilKey: 'tallow-candle' })).toEqual({
      'content-type': 'application/json',
      accept: 'text/event-stream',
      authorization: 'Bearer jwt',
      'x-council-key': 'tallow-candle',
    })
  })

  it('omits each header rather than sending an empty one', () => {
    const headers = gatewayHeaders({ token: null, councilKey: '' })
    expect(headers).not.toHaveProperty('x-council-key')
    expect(headers).not.toHaveProperty('authorization')
  })

  it('sends x-council-tier only when a tier is given (admin-only switch)', () => {
    expect(gatewayHeaders({ tier: 'premium' })).toHaveProperty('x-council-tier', 'premium')
    expect(gatewayHeaders({ tier: null })).not.toHaveProperty('x-council-tier')
    expect(gatewayHeaders({})).not.toHaveProperty('x-council-tier')
  })
})

describe('the gateway call', () => {
  afterEach(() => vi.unstubAllGlobals())

  const run = async (response: Response) => {
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    const events = openSession(
      { idea: 'Leave my job', personas: ['seneca'] },
      { gatewayUrl: 'https://llm.example/', councilKey: 'tallow-candle' },
    )
    const out: CouncilEvent[] = []
    for await (const event of events) out.push(event)
    return { fetchMock, out }
  }

  it('injects x-council-key on every request', async () => {
    const { fetchMock } = await run(
      new Response('data: {"type":"done"}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/council/session',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-council-key': 'tallow-candle' }),
      }),
    )
  })

  it('reads the tier off the session event', async () => {
    const { out } = await run(
      new Response('data: {"type":"session","session_id":"s1","tier":"premium","model":"x"}\n\n'),
    )
    expect(out[0]).toMatchObject({ type: 'session', session_id: 's1', tier: 'premium' })
  })

  it('prefers the body reason over the status, so 401 can mean password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ reason: 'password' }), { status: 401 }),
      ),
    )
    const events = openSession(
      { idea: 'x', personas: ['seneca'] },
      { gatewayUrl: 'https://llm.example', councilKey: 'wrong' },
    )
    await expect(events.next()).rejects.toMatchObject({ reason: 'password' })
  })

  it('still maps a bare 401 to the sign-in wall', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    const events = openSession(
      { idea: 'x', personas: ['seneca'] },
      { gatewayUrl: 'https://llm.example', councilKey: 'tallow-candle' },
    )
    const error = await events.next().then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(CouncilError)
    expect(error).toMatchObject({ reason: 'sign_in' })
  })
})

describe('voteSplit', () => {
  it('counts for / against / mixed', () => {
    expect(
      voteSplit({ socrates: 'for', seneca: 'against', 'marcus-aurelius': 'mixed', buddha: 'for' }),
    ).toEqual({ for: 2, against: 1, mixed: 1 })
  })
})
