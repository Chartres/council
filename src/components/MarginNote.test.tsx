import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarginNote, NotesTray } from './MarginNote'

describe('MarginNote', () => {
  it('offers Agree, Push back and Note under a contribution', () => {
    const onChange = vi.fn()
    render(<MarginNote name="Drucker" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Push back' }))
    expect(onChange).toHaveBeenCalledWith({ stance: 'push', text: '' })
  })

  it('keeps the mark in the margin; a push back takes her words; Remove takes it away', () => {
    const onChange = vi.fn()
    const { rerender } = render(<MarginNote name="Jobs" note={{ stance: 'push', text: '' }} onChange={onChange} />)
    expect(screen.getByText('You push back')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Why you push back on Jobs'), { target: { value: 'price is the product' } })
    expect(onChange).toHaveBeenLastCalledWith({ stance: 'push', text: 'price is the product' })
    rerender(<MarginNote name="Jobs" note={{ stance: 'agree', text: '' }} onChange={onChange} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})

describe('NotesTray', () => {
  it('says the notes go with the next message, and clears them', () => {
    const onClear = vi.fn()
    const { rerender, container } = render(<NotesTray count={0} onClear={onClear} />)
    expect(container.textContent).toBe('')
    rerender(<NotesTray count={2} onClear={onClear} />)
    expect(screen.getByText('Your 2 notes go with your next message.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalled()
  })
})
