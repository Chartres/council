import { beforeEach, describe, expect, it } from 'vitest'
import {
  decisionOf,
  loadLocalDiscussions,
  MAX_LOCAL,
  resumeItems,
  saveLocalDiscussion,
  titleOf,
  upsertDiscussion,
  type SavedDiscussion,
} from './discussions'
import type { Item, JournalEntry } from './mastermind'

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'e1',
  session_id: 'd1',
  decision: 'Pilot the premium tier with two clients',
  reasoning: '',
  assumptions: [],
  next_action: 'Email two clients',
  owner: 'me',
  review_trigger: '',
  confidence: null,
  map: null,
  status: 'accepted',
  created_at: '2026-10-27T10:00:00Z',
  ...over,
})

const items: Item[] = [
  { kind: 'facilitator', text: 'Welcome. Around the table: Drucker and Jobs.' },
  { kind: 'contribution', speaker: 'drucker', text: 'Who is the customer?' },
  { kind: 'floor', question: 'Which customer first?' },
  { kind: 'user', text: 'The two biggest accounts.' },
  { kind: 'proposal', entry: entry(), captured: false, state: 'accepted' },
]

const d = (id: string, over: Partial<SavedDiscussion> = {}): SavedDiscussion => ({
  id,
  roster: 'business',
  advisers: ['drucker', 'jobs'],
  intake: { goal: `Question ${id}` },
  items,
  created_at: '2026-10-27T10:00:00Z',
  ended: false,
  ...over,
})

beforeEach(() => localStorage.clear())

describe('discussions kept in this browser (anonymous)', () => {
  it('saves each discussion once, the latest first, and keeps the newest few', () => {
    saveLocalDiscussion(d('a'))
    saveLocalDiscussion(d('b'))
    saveLocalDiscussion(d('a', { ended: true }))
    expect(loadLocalDiscussions().map((x) => [x.id, x.ended])).toEqual([
      ['a', true],
      ['b', false],
    ])
    for (let i = 0; i < MAX_LOCAL + 5; i++) saveLocalDiscussion(d(`n${i}`))
    expect(loadLocalDiscussions()).toHaveLength(MAX_LOCAL)
  })

  it('a damaged store reads as empty', () => {
    localStorage.setItem('council:discussions', '{nope')
    expect(loadLocalDiscussions()).toEqual([])
  })

  it('upsert keeps the original start date when a discussion is continued', () => {
    const list = upsertDiscussion([d('a')], d('a', { created_at: '2026-10-29T09:00:00Z', items: [...items, { kind: 'user', text: 'more' }] }))
    expect(list[0]!.created_at).toBe('2026-10-27T10:00:00Z')
    expect(list[0]!.items).toHaveLength(items.length + 1)
  })
})

describe('what the list shows', () => {
  it('names a discussion by its question, else her first words', () => {
    expect(titleOf(d('a'))).toBe('Question a')
    expect(titleOf(d('a', { intake: null }))).toBe('The two biggest accounts.')
    expect(titleOf(d('a', { intake: null, items: [] }))).toBe('Open question')
  })

  it('shows the decision she accepted in it, if any', () => {
    expect(decisionOf(d('d1'), [entry()])).toBe('Pilot the premium tier with two clients')
    expect(decisionOf(d('d1'), [entry({ status: 'proposal' })])).toBeNull()
    expect(decisionOf(d('other'), [entry()])).toBeNull()
  })
})

describe('resumeItems: the saved record sent to continue a discussion', () => {
  it('names who said what, in the gateway contract’s words', () => {
    expect(resumeItems(items)).toEqual([
      { who: 'facilitator', text: 'Welcome. Around the table: Drucker and Jobs.' },
      { who: 'drucker', text: 'Who is the customer?' },
      { who: 'floor', text: 'Which customer first?' },
      { who: 'you', text: 'The two biggest accounts.' },
      { who: 'facilitator', text: 'Decision accepted: Pilot the premium tier with two clients. Next action: Email two clients' },
    ])
  })

  it('keeps the last 80 lines, each at most 2,000 characters', () => {
    const many: Item[] = Array.from({ length: 100 }, (_, i) => ({ kind: 'user', text: `${i} ${'x'.repeat(2100)}` }))
    const out = resumeItems(many)
    expect(out).toHaveLength(80)
    expect(out[0]!.text.startsWith('20 ')).toBe(true)
    expect(out.every((o) => o.text.length <= 2000)).toBe(true)
  })
})
