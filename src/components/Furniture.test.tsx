import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { COLOPHON, ERRATA } from '@/content/catalogue'
import { Colophon, Device, Versal } from './Furniture'

describe('Furniture', () => {
  it('the device is decoration unless it is given a name', () => {
    const { rerender } = render(<Device />)
    expect(screen.getByTestId('device')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Device label="Mastermind Council" />)
    expect(screen.getByRole('img', { name: 'Mastermind Council' })).toBeInTheDocument()
  })

  it('the device keeps its flame at every size and flickers only when asked', () => {
    const { container, rerender } = render(<Device size={24} />)
    expect(container.querySelector('.device-flame')).not.toBeNull()
    expect(container.querySelector('text')).toBeNull() // no initials under 60 px
    rerender(<Device size={48} />)
    expect(container.querySelector('text')).toBeNull()
    expect(screen.getByTestId('device')).not.toHaveClass('device-flicker')
    rerender(<Device size={160} flicker />)
    expect(container.querySelectorAll('text')).toHaveLength(2)
    expect(screen.getByTestId('device')).toHaveClass('device-flicker')
  })

  it('a versal leaves the question whole for a reader and for find-in-page', () => {
    render(<Versal>Should I return to a craft I abandoned?</Versal>)
    expect(screen.getByText('Should I return to a craft I abandoned?')).toBeInTheDocument()
    expect(screen.getByTestId('versal')).toHaveAttribute('data-letter', 'S')
    expect(screen.getByTestId('versal')).toHaveAttribute('aria-hidden', 'true')
  })

  it('a question that does not open on a capital is set plain', () => {
    render(<Versal>“Enough” — is it?</Versal>)
    expect(screen.queryByTestId('versal')).toBeNull()
    expect(screen.getByText('“Enough” — is it?')).toBeInTheDocument()
  })

  it('the colophon prints the edition and the faces; the errata line and the device only where asked', () => {
    const { rerender } = render(<Colophon folio="ii" />)
    for (const line of COLOPHON) expect(screen.getByText(line)).toBeInTheDocument()
    expect(screen.queryByText(ERRATA[0])).toBeNull()
    expect(screen.getByTestId('device')).toBeInTheDocument()
    expect(screen.getByTestId('folio')).toHaveTextContent('ii')
    rerender(<Colophon errata device={false} />)
    for (const line of ERRATA) expect(screen.getByText(line)).toBeInTheDocument()
    expect(screen.queryByTestId('device')).toBeNull()
  })
})
