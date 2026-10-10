import { describe, expect, it } from 'vitest'
import {
  INTAKE_QUESTIONS,
  assembleMemory,
  controlRoute,
  exportJournal,
  intakePayload,
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
