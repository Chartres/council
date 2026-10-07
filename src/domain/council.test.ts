import { describe, expect, it } from 'vitest'
import { parseSse, voteSplit, type CouncilEvent } from './council'

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

describe('voteSplit', () => {
  it('counts for / against / mixed', () => {
    expect(
      voteSplit({ socrates: 'for', seneca: 'against', 'marcus-aurelius': 'mixed', buddha: 'for' }),
    ).toEqual({ for: 2, against: 1, mixed: 1 })
  })
})
