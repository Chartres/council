import { describe, expect, it } from 'vitest'
import { toMermaid, wrapLabel } from './map'
import { exportJournal, normalizeEntry, type CouncilMap } from './mastermind'

const MAP: CouncilMap = {
  nodes: [
    { id: 'q', kind: 'question', label: 'Will customers pay before it exists?' },
    { id: 'c1', kind: 'claim', label: 'Pre-orders are the cheapest proof', speaker: 'drucker' },
    { id: 'c2', kind: 'claim', label: 'Ten is too "few" to trust', speaker: 'grove' },
    { id: 'p', kind: 'proposal', label: 'Two-week pre-order test, ten customers' },
    { id: 'as', kind: 'assumption', label: 'Ten customers are reachable' },
    { id: 'a', kind: 'action', label: 'Write the pre-order page today' },
  ],
  edges: [
    { from: 'c1', to: 'p', kind: 'supports' },
    { from: 'c2', to: 'p', kind: 'challenges' },
    { from: 'p', to: 'as', kind: 'rests_on' },
    { from: 'p', to: 'a', kind: 'leads_to' },
  ],
}

describe('wrapLabel', () => {
  it('keeps short labels on one line', () => {
    expect(wrapLabel('Write the page today')).toEqual(['Write the page today'])
  })

  it('wraps on words within the line width', () => {
    const lines = wrapLabel('Pre-orders are the cheapest proof that anyone will pay', 20)
    expect(lines).toEqual(['Pre-orders are the', 'cheapest proof that', 'anyone will pay'])
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20)
  })

  it('never exceeds 28 characters per line, even when asked for more', () => {
    for (const l of wrapLabel('one two three four five six seven eight nine ten eleven', 60)) expect(l.length).toBeLessThanOrEqual(28)
  })

  it('stops at three lines with an ellipsis', () => {
    const lines = wrapLabel('a b c d e f g h i j k l m n o p q r s t u v w x y z', 6)
    expect(lines).toHaveLength(3)
    expect(lines[2].endsWith('…')).toBe(true)
    expect(lines[2].length).toBeLessThanOrEqual(6)
  })

  it('cuts a word longer than a line', () => {
    expect(wrapLabel('supercalifragilisticexpialidocious', 10)).toEqual(['supercalif', 'ragilistic', 'expialido…'])
  })

  it('returns nothing for blank text', () => {
    expect(wrapLabel('   ')).toEqual([])
  })
})

describe('toMermaid', () => {
  it('writes a top-to-bottom flowchart with quoted labels and labelled challenge/rests-on edges', () => {
    expect(toMermaid(MAP)).toBe(
      [
        'flowchart TB',
        '  q["Will customers pay before it exists?"]',
        '  c1["Drucker: Pre-orders are the cheapest proof"]',
        '  c2["Grove: Ten is too #quot;few#quot; to trust"]',
        '  p["Two-week pre-order test, ten customers"]',
        '  as["Ten customers are reachable"]',
        '  a["Write the pre-order page today"]',
        '  c1 --> p',
        '  c2 -. challenges .-> p',
        '  p -. rests on .-> as',
        '  p ==> a',
      ].join('\n'),
    )
  })

  it('is appended to the export for entries that carry a map', () => {
    const e = normalizeEntry({
      id: 'e1', decision: 'Pre-order test', reasoning: '', assumptions: [], next_action: 'Write the page',
      owner: 'You', review_trigger: 'Friday', confidence: null, status: 'accepted' as const, created_at: '2026-10-10', map: MAP,
    })
    const text = exportJournal({ entries: [e, { ...e, id: 'e2', map: null }], commitments: [] })
    expect(text).toContain('```mermaid\nflowchart TB\n')
    expect(text.match(/```mermaid/g)).toHaveLength(1)
  })

  it('normalizeEntry drops a malformed map', () => {
    expect(normalizeEntry({ map: { nodes: 'x' } as unknown as CouncilMap }).map).toBeNull()
    expect(normalizeEntry({}).map).toBeNull()
  })
})
