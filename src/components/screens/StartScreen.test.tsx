import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StartScreen, TODAY_ROOT } from './StartScreen'
import { dailyQuestion, todayKey } from '@/domain/daily'
import { keyAction } from '@/analytics'

vi.mock('@/app/CouncilContext', () => ({ useCouncil: () => ({ go: vi.fn() }) }))
const begin = vi.hoisted(() => vi.fn())
vi.mock('@/app/MastermindContext', () => ({
  useMastermind: () => ({ roster: 'business', setRoster: vi.fn(), advisers: ['drucker'], toggleAdviser: vi.fn(), memory: null, linkNeedsSignIn: false, begin, lastIntake: { role: 'Baker', goal: 'old goal', situation: 'old situation' } }),
}))
vi.mock('@/analytics', () => ({ keyAction: vi.fn() }))

describe("StartScreen today's question", () => {
  it('shows the day\'s question, the same for everyone, and opens it as a council', async () => {
    const q = dailyQuestion(todayKey())
    render(<StartScreen />)
    const card = screen.getByTestId('today')
    expect(card).toHaveTextContent(q)
    await userEvent.click(screen.getByRole('button', { name: /Take it to the council/ }))
    // The stable answers (who she is) carry over; this session's goal is the question.
    expect(begin).toHaveBeenCalledWith({ role: 'Baker', goal: q })
    expect(keyAction).toHaveBeenCalledWith('daily_opened', { day: todayKey() })
  })
})

describe("StartScreen today's question: where it comes from", () => {
  it('a tap opens one line naming Plato’s Apology 38a in Jowett’s words, and closes it again', async () => {
    render(<StartScreen />)
    const why = screen.getByRole('button', { name: 'Why?' })
    expect(why).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(TODAY_ROOT)).not.toBeVisible()
    await userEvent.click(why)
    expect(why).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(TODAY_ROOT)).toBeVisible()
    expect(TODAY_ROOT).toContain('Apology 38a')
    expect(TODAY_ROOT).toContain('“the unexamined life is not worth living')
    expect(TODAY_ROOT).toContain('Jowett')
    await userEvent.click(why)
    expect(why).toHaveAttribute('aria-expanded', 'false')
    expect(begin).not.toHaveBeenCalledWith(expect.objectContaining({ goal: TODAY_ROOT }))
  })

  it('opens while a mouse hovers and when the keyboard reaches it; Escape closes', async () => {
    render(<StartScreen />)
    const why = screen.getByRole('button', { name: 'Why?' })
    await userEvent.hover(why)
    expect(why).toHaveAttribute('aria-expanded', 'true')
    await userEvent.unhover(why)
    expect(why).toHaveAttribute('aria-expanded', 'false')
    await userEvent.tab()
    expect(why).toHaveFocus()
    expect(why).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    expect(why).toHaveAttribute('aria-expanded', 'false')
  })
})

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
