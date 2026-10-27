import { describe, expect, it } from 'vitest'
import type { CouncilMap, Item, JournalEntry } from './mastermind'
import { quaestio, verifiedLine } from './quaestio'

const map: CouncilMap = {
  nodes: [
    { id: 'q', kind: 'question', label: 'Add a mobile repair van?' },
    { id: 'c1', kind: 'claim', label: 'Twelve call-outs a week are turned away', speaker: 'seneca' },
    { id: 'c2', kind: 'claim', label: 'A van doubles the fixed costs', speaker: 'socrates' },
    { id: 'c3', kind: 'claim', label: 'You have not priced your evenings', speaker: 'marcus-aurelius' },
    { id: 'p', kind: 'proposal', label: 'Rent a van for one month' },
    { id: 'a', kind: 'action', label: 'Call the rental firm' },
  ],
  edges: [
    { from: 'q', to: 'p', kind: 'leads_to' },
    { from: 'c1', to: 'p', kind: 'supports' },
    { from: 'c2', to: 'p', kind: 'challenges' },
    { from: 'c3', to: 'c1', kind: 'challenges' },
    { from: 'p', to: 'a', kind: 'leads_to' },
  ],
}

const entry: JournalEntry = {
  id: 'e1',
  decision: 'Rent a van for one month before buying',
  reasoning: 'A month answers the demand question at a tenth of the cost.',
  assumptions: ['Call-outs keep coming in winter'],
  next_action: 'Call the rental firm on Monday',
  owner: 'me',
  review_trigger: 'End of the month',
  confidence: 60,
  map,
  status: 'accepted',
  created_at: '2026-10-27',
}

describe('quaestio', () => {
  it('reads the record as question, objections, answer and what must hold', () => {
    expect(quaestio(entry)).toEqual({
      question: 'Add a mobile repair van?',
      objections: [
        { speaker: 'socrates', text: 'A van doubles the fixed costs' },
        { speaker: 'marcus-aurelius', text: 'You have not priced your evenings' },
      ],
      answer: 'A month answers the demand question at a tenth of the cost.',
      mustHold: ['Call-outs keep coming in winter'],
    })
  })

  it('no map: objections unknown (null), not "none"; a map with no challenge: none', () => {
    expect(quaestio({ ...entry, map: null }).objections).toBeNull()
    expect(quaestio({ ...entry, map: null }).question).toBeNull()
    const quiet = { ...map, edges: map.edges.filter((e) => e.kind !== 'challenges') }
    expect(quaestio({ ...entry, map: quiet }).objections).toEqual([])
  })
})

it('a rebuttal (a claim challenging an objection) is not itself an objection; only claims count', () => {
  const m: CouncilMap = {
    nodes: [...map.nodes, { id: 'c4', kind: 'claim', label: 'Costs fall after month two', speaker: 'seneca' }, { id: 'as', kind: 'assumption', label: 'Winter demand holds' }],
    edges: [...map.edges, { from: 'c4', to: 'c2', kind: 'challenges' }, { from: 'as', to: 'p', kind: 'challenges' }],
  }
  expect(quaestio({ ...entry, map: m }).objections!.map((o) => o.text)).toEqual(['A van doubles the fixed costs', 'You have not priced your evenings'])
})

describe('verifiedLine — "on the contrary"', () => {
  const said = (speaker: string, text: string, grounding?: unknown): Item => ({ kind: 'contribution', speaker, text, grounding }) as Item

  it('takes the latest quote whose contribution was fully verified, with its source', () => {
    const items = [
      said('seneca', 'As I wrote, "While we are postponing, life speeds by." Begin.', { quotes: 1, verified: 1, sources: ['Letter 1'] }),
      said('socrates', 'Test it first.'),
    ]
    expect(verifiedLine(items)).toEqual({ speaker: 'seneca', text: 'While we are postponing, life speeds by.', source: 'Letter 1' })
  })

  it('looks only before the proposal and skips the advisers who objected', () => {
    const items = [
      said('seneca', 'As I wrote, "While we are postponing, life speeds by." Begin.', { quotes: 1, verified: 1, sources: ['Letter 1'] }),
      said('socrates', 'I said "The unexamined life is not worth living for a man." Wait.', { quotes: 1, verified: 1, sources: ['Apology'] }),
      { kind: 'floor', question: 'Next?' } as Item,
      said('marcus-aurelius', 'Later: "Do not act as if thou wert going to live ten thousand years."', { quotes: 1, verified: 1, sources: ['IV.17'] }),
    ]
    expect(verifiedLine(items, { before: 3, exclude: ['socrates'] })?.speaker).toBe('seneca')
  })

  it('never uses a quote that was not verified, or one it cannot attribute to a single source', () => {
    expect(verifiedLine([said('seneca', 'He said "a long line that nobody could check here".', { quotes: 1, verified: 0, sources: [] })])).toBeNull()
    expect(
      verifiedLine([said('seneca', '"First quoted line of some length" and "second quoted line of some length".', { quotes: 2, verified: 2, sources: ['Letter 1', 'Letter 5'] })]),
    ).toBeNull()
    expect(verifiedLine([said('seneca', 'No quote here.', { quotes: 0, verified: 0, sources: [] })])).toBeNull()
  })
})
