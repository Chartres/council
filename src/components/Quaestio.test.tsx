import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Quaestio } from './Quaestio'

const q = {
  question: 'Add a mobile repair van?',
  objections: [{ speaker: 'socrates', text: 'A van doubles the fixed costs' }],
  answer: 'A month answers the demand question at a tenth of the cost.',
  mustHold: ['Call-outs keep coming in winter'],
}

describe('Quaestio', () => {
  it('reads as question, objection, on the contrary, I answer, what must hold', () => {
    render(<Quaestio q={q} contra={{ speaker: 'seneca', text: 'While we are postponing, life speeds by.', source: 'Letter 1' }} />)
    const rubrics = screen.getAllByTestId('rubric').map((r) => r.textContent)
    expect(rubrics).toEqual(['Question', 'It seems not, because', 'On the contrary', 'I answer', 'What must hold'])
    expect(screen.getByText('A van doubles the fixed costs')).toBeInTheDocument()
    expect(screen.getByText(/Socrates/)).toBeInTheDocument()
    expect(screen.getByText('“While we are postponing, life speeds by.”')).toBeInTheDocument()
    expect(screen.getByText('Seneca · Letter 1')).toBeInTheDocument()
  })

  it('with no objection says so, and offers to test it when the session is live', () => {
    const onTest = vi.fn()
    render(<Quaestio q={{ ...q, objections: [] }} onTest={onTest} />)
    expect(screen.getByText('No one argued against this yet.')).toBeInTheDocument()
    expect(screen.queryByText('On the contrary')).toBeNull() // no verified line, no rubric
    fireEvent.click(screen.getByRole('button', { name: 'Test it' }))
    expect(onTest).toHaveBeenCalled()
  })

  it('in the journal (no live session) there is no test button', () => {
    render(<Quaestio q={{ ...q, objections: [] }} />)
    expect(screen.queryByRole('button', { name: 'Test it' })).toBeNull()
  })
})
