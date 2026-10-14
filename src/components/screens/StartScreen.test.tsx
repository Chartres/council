import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StartScreen } from './StartScreen'

vi.mock('@/app/CouncilContext', () => ({ useCouncil: () => ({ go: vi.fn() }) }))
vi.mock('@/app/MastermindContext', () => ({
  useMastermind: () => ({ roster: 'business', setRoster: vi.fn(), advisers: [], toggleAdviser: vi.fn(), memory: null, linkNeedsSignIn: false }),
}))

describe('StartScreen connect panel', () => {
  it('opens to the MCP address, a copy button and one sentence', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<StartScreen />)
    await userEvent.click(screen.getByText('Connect from your AI'))
    expect(screen.getByText('https://llm.dravec.org/mcp')).toBeVisible()
    expect(screen.getByText(/Add it as a connector in Claude or ChatGPT; it signs you in by email/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('https://llm.dravec.org/mcp')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
