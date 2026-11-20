import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// Review of PR #40: a host's send worked while the mic recorded or a part was pending, so the
// last sentence was lost or landed in an emptied box.

vi.mock('@/analytics', () => ({ keyAction: vi.fn() }))
vi.mock('@/app/CouncilContext', () => ({ GATEWAY_URL: 'https://gw.test', useCouncil: () => ({ councilKey: 'k', session: null }) }))
vi.mock('@/app/MastermindContext', () => ({ useMastermind: () => ({ conversation: null }) }))
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ token: null }) }))
const feedback = vi.hoisted(() => ({ sendFeedback: vi.fn(async () => 'sent'), MAX_FEEDBACK: 2000 }))
vi.mock('@/domain/feedback', () => feedback)
const fake = await vi.hoisted(async () => (await import('@/test/fakeCapture')).fakeCaptures())
vi.mock('@/domain/capture', async (orig) => ({ ...(await orig<object>()), openCapture: fake.openCapture }))
vi.mock('@/domain/stt', async (orig) => ({ ...(await orig<object>()), recordingSupported: () => true }))

const { FeedbackSheet } = await import('./Feedback')

beforeEach(() => {
  fake.reset()
  feedback.sendFeedback.mockClear()
})

describe('a form with a mic holds its send until his words are all in the field', () => {
  it('Send is held while it records and while the last part is being written down; what goes includes that part', async () => {
    render(<FeedbackSheet />)
    const send = screen.getByRole('button', { name: 'Send' })
    fireEvent.click(screen.getByTestId('mic'))
    await act(async () => {})
    act(() => fake.last().say('the thread is good'))
    expect(send).toBeDisabled() // text in the field, but he is still recording

    act(() => fake.last().ev.onPending(1))
    await act(async () => fireEvent.click(screen.getByTestId('mic'))) // Finish
    expect(send).toBeDisabled() // the last part is with the gateway

    act(() => fake.last().say('and the candle too'))
    act(() => fake.last().ev.onPending(0))
    expect(send).toBeEnabled()
    await act(async () => fireEvent.click(send))
    expect(feedback.sendFeedback).toHaveBeenCalledWith(expect.objectContaining({ text: 'the thread is good and the candle too' }), expect.anything())
  })
})
