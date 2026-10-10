import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CouncilMap as CMap } from '@/domain/mastermind'
import { CouncilMap } from './CouncilMap'

const MAP: CMap = {
  nodes: [
    { id: 'q', kind: 'question', label: 'Will customers pay before it exists?' },
    { id: 'c1', kind: 'claim', label: 'Pre-orders are the cheapest proof', speaker: 'drucker' },
    { id: 'c2', kind: 'claim', label: 'Ten is too few to trust', speaker: 'grove' },
    { id: 'p', kind: 'proposal', label: 'Two-week pre-order test, ten customers' },
    { id: 'as', kind: 'assumption', label: 'Ten customers are reachable' },
    { id: 'a', kind: 'action', label: 'Write the pre-order page today' },
  ],
  edges: [
    { from: 'c1', to: 'p', kind: 'supports' },
    { from: 'c2', to: 'p', kind: 'challenges' },
    { from: 'p', to: 'as', kind: 'rests_on' },
    { from: 'p', to: 'a', kind: 'leads_to' },
    { from: 'p', to: 'gone', kind: 'supports' }, // dangling: not drawn
  ],
}

describe('CouncilMap', () => {
  it('draws one group per node and one path per edge, by kind', () => {
    render(<CouncilMap map={MAP} />)
    const svg = screen.getByTestId('council-map')
    const nodes = [...svg.querySelectorAll('.map-node')]
    const edges = [...svg.querySelectorAll('.map-edge')]
    expect(nodes.map((n) => n.getAttribute('data-kind'))).toEqual(['question', 'claim', 'claim', 'proposal', 'assumption', 'action'])
    expect(edges.map((e) => e.getAttribute('data-kind'))).toEqual(['supports', 'challenges', 'rests_on', 'leads_to'])
    expect(svg.querySelector('[data-kind="challenges"]')).toHaveClass('stroke-clay-400')
    expect(svg.querySelector('[data-kind="leads_to"]')).toHaveClass('stroke-candle-400')
    expect(svg.querySelector('[data-kind="challenges"]')).toHaveAttribute('stroke-dasharray')
  })

  it('reads as sentences and shows monograms on claims', () => {
    render(<CouncilMap map={MAP} />)
    const svg = screen.getByRole('img', { name: /^Council map\. Question: Will customers pay/ })
    expect(svg.getAttribute('aria-label')).toContain('Grove challenges the proposal.')
    expect(svg.getAttribute('aria-label')).toContain('The proposal leads to the action.')
    expect(svg.getAttribute('viewBox')).toMatch(/^0 0 360 \d+/)
    expect(svg).toHaveTextContent('PD')
  })
})
