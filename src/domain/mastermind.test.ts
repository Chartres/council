import { describe, expect, it, vi } from 'vitest'
import {
  INTAKE_QUESTIONS,
  assembleMemory,
  controlRoute,
  exportJournal,
  intakePayload,
  itemsReducer,
  settleItems,
  sendTurn,
  type Item,
  stableIntake,
  journalReducer,
  normalizeEntry,
  parseDeepLink,
  type Commitment,
  type JournalEntry,
  type JournalState,
} from './mastermind'
import { JOURNAL_STORAGE, loadLocalJournal, saveLocalJournal } from './journalStore'

const entry = (id: string, created_at: string, status: JournalEntry['status'] = 'accepted'): JournalEntry => ({
  id,
  decision: `Decision ${id}`,
  reasoning: 'Because.',
  assumptions: ['Sven says yes'],
  next_action: `Act on ${id}`,
  owner: 'me',
  review_trigger: 'Friday',
  confidence: 60,
  map: null,
  status,
  created_at,
})

const commitment = (id: string, journal_id: string, outcome: Commitment['outcome'] = null): Commitment => ({
  id,
  journal_id,
  what: `Do ${id}`,
  due_date: '2026-10-15',
  remind: true,
  outcome,
})

describe('controlRoute', () => {
  it('maps every chip to the contract command', () => {
    expect(controlRoute({ kind: 'pause' })).toEqual({ route: 'control', command: 'pause' })
    expect(controlRoute({ kind: 'back_to', speaker: 'grove' })).toEqual({ route: 'control', command: 'back_to:grove' })
    expect(controlRoute({ kind: 'let', a: 'jobs', b: 'drucker' })).toEqual({ route: 'control', command: 'let:jobs,drucker' })
    expect(controlRoute({ kind: 'disagree' })).toEqual({ route: 'control', command: 'disagree' })
    expect(controlRoute({ kind: 'concrete' })).toEqual({ route: 'control', command: 'concrete' })
    expect(controlRoute({ kind: 'test' })).toEqual({ route: 'control', command: 'test' })
    expect(controlRoute({ kind: 'wrap_up' })).toEqual({ route: 'control', command: 'wrap_up' })
  })

  it('sends capture to its own route and keeps export in the browser', () => {
    expect(controlRoute({ kind: 'capture' })).toEqual({ route: 'capture' })
    expect(controlRoute({ kind: 'export' })).toEqual({ route: 'export' })
  })
})

describe('intake', () => {
  it('uses the gateway keys, in Eyal\'s order', () => {
    expect(INTAKE_QUESTIONS.map((q) => q.id)).toEqual([
      'role', 'organization', 'goal', 'situation', 'success', 'constraints', 'working_style',
    ])
    expect(INTAKE_QUESTIONS[1].hint).toBe(
      "Your industry, who you serve, and your scope of responsibility. No company or people's names needed.",
    )
  })

  it('payload trims, drops blanks, caps each field at 1,000 characters; undefined when empty', () => {
    expect(intakePayload({ role: '  CFO ', goal: '   ' })).toEqual({ role: 'CFO' })
    expect(intakePayload({ goal: 'x'.repeat(1200) })!.goal).toHaveLength(1000)
    expect(intakePayload({})).toBeUndefined()
  })

  it('payload carries materials, trimmed and capped at 8,000 characters', () => {
    expect(intakePayload({ materials: '  notes  ' })).toEqual({ materials: 'notes' })
    expect(intakePayload({ materials: 'x'.repeat(9000) })!.materials).toHaveLength(8000)
  })

  it('does not carry materials into the next session (it is this decision’s background)', () => {
    expect(stableIntake({ role: 'CFO', goal: 'Cut churn', materials: 'plan' })).toEqual({ role: 'CFO' })
  })

  it('prefills only the stable fields, mapping v4 keys to the gateway keys', () => {
    expect(stableIntake({ role: 'CFO', goal: 'Cut churn', organization: 'SaaS' })).toEqual({ role: 'CFO', organization: 'SaaS' })
    expect(stableIntake({ workplace: 'Retail', mode: 'challenge me', today: 'busy' } as never)).toEqual({
      organization: 'Retail',
      working_style: 'challenge me',
    })
    expect(stableIntake(null)).toEqual({})
  })
})

describe('journalReducer', () => {
  const empty: JournalState = { entries: [], commitments: [] }

  it('accepts a proposal as an accepted entry, newest first, without duplicates', () => {
    let s = journalReducer(empty, { type: 'accept', entry: entry('a', '2026-10-01', 'proposal') })
    s = journalReducer(s, { type: 'accept', entry: entry('b', '2026-10-02', 'proposal') })
    s = journalReducer(s, { type: 'accept', entry: entry('a', '2026-10-01', 'proposal') })
    expect(s.entries.map((e) => [e.id, e.status])).toEqual([
      ['a', 'accepted'],
      ['b', 'accepted'],
    ])
  })

  it('an outcome writes back to the commitment and moves the entry status', () => {
    const base: JournalState = {
      entries: [entry('a', '2026-10-01'), entry('b', '2026-10-02')],
      commitments: [commitment('c1', 'a'), commitment('c2', 'b')],
    }
    const done = journalReducer(base, { type: 'outcome', id: 'c1', outcome: 'done', at: 'T' })
    expect(done.commitments[0]).toMatchObject({ outcome: 'done', outcome_at: 'T' })
    expect(done.entries[0].status).toBe('done')
    const dropped = journalReducer(base, { type: 'outcome', id: 'c2', outcome: 'drop', at: 'T' })
    expect(dropped.entries[1].status).toBe('dropped')
    const later = journalReducer(base, { type: 'outcome', id: 'c2', outcome: 'later', at: 'T' })
    expect(later.entries[1].status).toBe('accepted')
    const quiet = journalReducer(base, { type: 'remind', id: 'c1', remind: false })
    expect(quiet.commitments.map((c) => c.remind)).toEqual([false, true])
    expect(journalReducer(base, { type: 'outcome', id: 'nope', outcome: 'done', at: 'T' })).toBe(base)
  })
})

describe('assembleMemory', () => {
  it('sends the 3 newest non-proposal entries and only open commitments', () => {
    const memory = assembleMemory({
      entries: [
        entry('old', '2026-09-01'),
        entry('p', '2026-10-05', 'proposal'),
        entry('n1', '2026-10-04'),
        entry('n2', '2026-10-03'),
        entry('n3', '2026-10-02', 'done'),
      ],
      commitments: [commitment('open', 'n1'), commitment('later', 'n2', 'later'), commitment('closed', 'n3', 'done')],
    })
    expect(memory!.entries.map((e) => e.decision)).toEqual(['Decision n1', 'Decision n2', 'Decision n3'])
    expect(memory!.commitments.map((c) => c.id)).toEqual(['open', 'later'])
  })

  it('is null for a first visit', () => {
    expect(assembleMemory({ entries: [], commitments: [] })).toBeNull()
  })
})

describe('parseDeepLink', () => {
  it('reads the commitment id and a known outcome', () => {
    expect(parseDeepLink('/c/3f2a-9b', '?outcome=done')).toEqual({ id: '3f2a-9b', outcome: 'done' })
    expect(parseDeepLink('/c/abc/', '?outcome=later')).toEqual({ id: 'abc', outcome: 'later' })
    expect(parseDeepLink('/c/abc', '')).toEqual({ id: 'abc', outcome: null })
  })

  it('ignores other paths and unknown outcomes', () => {
    expect(parseDeepLink('/', '?outcome=done')).toBeNull()
    expect(parseDeepLink('/c/', '')).toBeNull()
    expect(parseDeepLink('/c/a/b', '')).toBeNull()
    expect(parseDeepLink('/c/abc', '?outcome=delete')).toEqual({ id: 'abc', outcome: null })
  })
})

describe('exportJournal + local store', () => {
  it('exports decisions with their commitments, skipping proposals', () => {
    const text = exportJournal({
      entries: [entry('a', '2026-10-01'), entry('p', '2026-10-02', 'proposal')],
      commitments: [commitment('c1', 'a')],
    })
    expect(text).toContain('Decision a')
    expect(text).toContain('Commitment: Do c1 by 2026-10-15')
    expect(text).not.toContain('Decision p')
  })

  it('round-trips through localStorage and survives junk', () => {
    const value = { entries: [entry('a', '2026-10-01')], commitments: [], lastIntake: { role: 'CFO' } }
    saveLocalJournal(value)
    expect(loadLocalJournal()).toEqual(value)
    localStorage.setItem(JOURNAL_STORAGE, '{nope')
    expect(loadLocalJournal()).toEqual({ entries: [], commitments: [], lastIntake: null })
  })
})

describe('normalizeEntry', () => {
  it('coerces a string assumption and a stringy confidence from the gateway', () => {
    const raw = { decision: 'x', assumptions: 'one' as unknown as string[], confidence: '70' as unknown as number }
    expect(normalizeEntry(raw)).toMatchObject({ assumptions: ['one'], confidence: 70 })
    expect(normalizeEntry({ decision: 'x' })).toMatchObject({ assumptions: [], confidence: null })
  })
})

describe('voice turn', () => {
  it('grows a streaming contribution from speaker + deltas and swaps in the final text', () => {
    let items: Item[] = [{ kind: 'user', text: 'hi' }]
    items = itemsReducer(items, { type: 'speaker', speaker: 'drucker' })
    expect(items[1]).toEqual({ kind: 'contribution', speaker: 'drucker', text: '', streaming: true })
    items = itemsReducer(items, { type: 'delta', text: 'Start with ' })
    items = itemsReducer(items, { type: 'delta', text: 'the customer. ' })
    expect(items[1]).toMatchObject({ text: 'Start with the customer. ', streaming: true })
    items = itemsReducer(items, { type: 'contribution', speaker: 'drucker', text: 'Start with the customer.', confidence: 70 })
    expect(items).toHaveLength(2)
    expect(items[1]).toEqual({ kind: 'contribution', speaker: 'drucker', text: 'Start with the customer.', confidence: 70 })
    items = itemsReducer(items, { type: 'floor', question: 'Who is it?' })
    expect(items[2]).toEqual({ kind: 'floor', question: 'Who is it?' })
  })

  it('keeps the gateway\'s grounding on a contribution (the quaestio\'s "on the contrary" reads it)', () => {
    const grounding = { quotes: 1, verified: 1, sources: ['Letter 1'] }
    const items = itemsReducer([], { type: 'contribution', speaker: 'seneca', text: 'x', grounding })
    expect(items[0]).toEqual({ kind: 'contribution', speaker: 'seneca', text: 'x', confidence: undefined, grounding })
  })

  it('appends a typed turn\'s contribution and ignores a delta with nothing streaming', () => {
    const items: Item[] = [{ kind: 'floor', question: 'q' }]
    expect(itemsReducer(items, { type: 'delta', text: 'x' })).toBe(items)
    expect(itemsReducer(items, { type: 'contribution', speaker: 'jobs', text: 't' })).toHaveLength(2)
    expect(itemsReducer(items, { type: 'done' })).toBe(items)
  })

  it('settles a contribution left growing by an error or a closed stream', () => {
    const items: Item[] = [{ kind: 'contribution', speaker: 'grove', text: 'Who owns', streaming: true }]
    expect(settleItems(items)).toEqual([{ kind: 'contribution', speaker: 'grove', text: 'Who owns', streaming: false }])
    const done: Item[] = [{ kind: 'floor', question: 'q' }]
    expect(settleItems(done)).toBe(done)
  })

  it('sendTurn posts voice: true', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(new Response('data: {"type":"done"}\n\n', { headers: { 'content-type': 'text/event-stream' } })),
    )
    vi.stubGlobal('fetch', fetch)
    const events = sendTurn({ session_id: 's', message: 'hello', voice: true }, { gatewayUrl: 'https://gw.test' } as never)
    for await (const _ of events) void _
    const calls = fetch.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('https://gw.test/v1/council/turn')
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ session_id: 's', message: 'hello', voice: true })
    vi.unstubAllGlobals()
  })
})
