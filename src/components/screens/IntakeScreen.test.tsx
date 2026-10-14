import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntakeScreen } from './IntakeScreen'

const begin = vi.fn()
vi.mock('@/app/CouncilContext', () => ({ GATEWAY_URL: 'https://gw.test', useCouncil: () => ({ go: vi.fn(), councilKey: 'k', lockDoor: vi.fn() }) }))
vi.mock('@/app/MastermindContext', () => ({ useMastermind: () => ({ begin, lastIntake: null }) }))
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ token: null }) }))

const reply = (intake: object) => new Response(JSON.stringify({ intake }), { status: 200 })

describe('IntakeScreen shortcuts', () => {
  it('puts the three shortcuts under the goal, before the primary button, once each', () => {
    render(<IntakeScreen />)
    const row = screen.getByRole('group', { name: 'Shortcuts' })
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Let your AI fill this in',
      'Talk it through',
      'Drop files',
    ])
    const goal = screen.getByLabelText('What would you like the group to help you achieve?')
    const go = screen.getByRole('button', { name: 'Bring it to the group' })
    expect(goal.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.compareDocumentPosition(go) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const name of ['Ask your AI', 'Pick a file']) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Talk it through' })).toHaveLength(1)
  })

  it('"Let your AI fill this in" opens the copyable prompt', async () => {
    render(<IntakeScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Let your AI fill this in' }))
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Write UNKNOWN rather than guessing.')
  })

  it('"Drop files" opens a picker that takes several files', async () => {
    render(<IntakeScreen />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    await userEvent.click(screen.getByRole('button', { name: 'Drop files' }))
    expect(click).toHaveBeenCalled()
    expect(input.multiple).toBe(true)
  })

  it('files dropped on the goal are read in turn, merged, and the overflow lands in Materials', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ role: 'a'.repeat(900), goal: 'cut churn' }))
      .mockResolvedValueOnce(reply({ role: 'b'.repeat(300), situation: 'flat sales' }))
    vi.stubGlobal('fetch', fetch)
    render(<IntakeScreen />)
    const files = [
      new File(['x'], 'cv.pdf', { type: 'application/pdf' }),
      Object.defineProperty(new File(['x'], 'huge.pdf'), 'size', { value: 6e6 }),
      new File(['x'], 'plan.txt', { type: 'text/plain' }),
    ]
    fireEvent.drop(screen.getByLabelText('What would you like the group to help you achieve?'), { dataTransfer: { files } })
    await waitFor(() =>
      expect(screen.getByTestId('intake-note')).toHaveTextContent(
        'Read 2 files. Filled 3 of 7; the rest went to Materials. Skipped huge.pdf: over 5 MB.',
      ),
    )
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Who are you professionally?')).toHaveValue(`${'a'.repeat(900)}\n\n${'b'.repeat(98)}`)
    expect(screen.getByLabelText('Materials')).toHaveValue(`Role: ${'b'.repeat(202)}`)
    await userEvent.click(screen.getByRole('button', { name: 'Bring it to the group' }))
    expect(begin.mock.calls[0][0]).toMatchObject({ goal: 'cut churn', materials: `Role: ${'b'.repeat(202)}` })
    vi.unstubAllGlobals()
  })
})
