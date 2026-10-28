import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Commitment } from '@/domain/mastermind'
import { dueTonight, Examination } from './Examination'
import { keyAction } from '@/analytics'

vi.mock('@/analytics', () => ({ keyAction: vi.fn() }))
const recordOutcome = vi.fn()
const begin = vi.fn()
vi.mock('@/app/MastermindContext', () => ({ useMastermind: () => ({ recordOutcome, begin, lastIntake: null }) }))

const c = (id: string, due_date: string, outcome: Commitment['outcome'] = null): Commitment => ({
  id,
  journal_id: 'j',
  what: `do ${id}`,
  due_date,
  remind: false,
  outcome,
})

describe('dueTonight', () => {
  it('today and overdue commitments still without an outcome', () => {
    const list = [c('a', '2026-10-27'), c('b', '2026-10-20'), c('c', '2026-10-28'), c('d', '2026-10-27', 'done'), c('e', '2026-10-26', 'later')]
    expect(dueTonight(list, '2026-10-27').map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('Examination', () => {
  const at = (h: number) => new Date(2026, 9, 27, h, 0)

  it('in the evening: Seneca\'s three questions and one tap per commitment', () => {
    render(<Examination commitments={[c('a', '2026-10-27')]} now={at(20)} />)
    expect(screen.getByTestId('examination')).toHaveTextContent('What ill did you cure today? What fault did you resist? In what are you better?')
    expect(screen.getByText('Seneca, De Ira III.36')).toBeInTheDocument()
    expect(screen.getByText(/do a/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(recordOutcome).toHaveBeenCalledWith('a', 'done')
    expect(keyAction).toHaveBeenCalledWith('examined', { outcome: 'Done' })
  })

  it('"Not yet" in the examination records it and stays on the Journal (no new session)', () => {
    render(<Examination commitments={[c('a', '2026-10-27')]} now={at(20)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }))
    expect(recordOutcome).toHaveBeenCalledWith('a', 'later')
    expect(begin).not.toHaveBeenCalled()
  })

  it('not before evening, and not when nothing is due', () => {
    const { container, rerender } = render(<Examination commitments={[c('a', '2026-10-27')]} now={at(10)} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<Examination commitments={[c('a', '2026-10-28')]} now={at(20)} />)
    expect(container).toBeEmptyDOMElement()
  })
})
