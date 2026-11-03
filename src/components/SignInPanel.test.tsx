import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// Eyal, 30 Oct (feedback a452794d): on a new laptop the email gave him a code and the app had
// nowhere to type it. Sending the email must open a code field next to the "check your inbox"
// line, and the code must sign in on this device without leaving the tab.

const auth = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  verifyEmailCode: vi.fn(),
}))

vi.mock('@/auth/AuthContext', () => ({
  SIGNUP_FLAG: 'council:signup-started',
  useAuth: () => ({ configured: true, ...auth }),
}))
vi.mock('@/analytics', () => ({ track: vi.fn() }))

const { SignInPanel } = await import('./SignInPanel')

async function sendTo(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Send link' }))
  return screen.findByLabelText('Code from the email')
}

beforeEach(() => {
  auth.signInWithEmail.mockReset().mockResolvedValue({ ok: true })
  auth.verifyEmailCode.mockReset().mockResolvedValue({ ok: true })
})

describe('SignInPanel: link or code', () => {
  it('after sending, asks for the code from the email (not a password)', async () => {
    render(<SignInPanel />)
    const code = await sendTo('eyal@example.com')
    expect(code).toHaveAttribute('inputmode', 'numeric')
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    expect(screen.queryByLabelText(/password/i)).toBeNull()
    expect(screen.getByText(/open the link on this device, or type the code/i)).toBeInTheDocument()
  })

  it('signs in with the code for the address it was sent to', async () => {
    render(<SignInPanel />)
    const code = await sendTo('eyal@example.com')
    fireEvent.change(code, { target: { value: ' 123 456 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use code' }))
    await waitFor(() => expect(auth.verifyEmailCode).toHaveBeenCalledWith('eyal@example.com', '123456'))
  })

  it('says so in words when the code is wrong or old, and keeps the field', async () => {
    auth.verifyEmailCode.mockResolvedValue({ ok: false, error: 'Token has expired or is invalid' })
    render(<SignInPanel />)
    const code = await sendTo('eyal@example.com')
    fireEvent.change(code, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t work/)
    expect(screen.getByLabelText('Code from the email')).toBeInTheDocument()
  })

  it('lets her send it again to a different address', async () => {
    render(<SignInPanel />)
    await sendTo('typo@example.con')
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByLabelText('Email')).toHaveValue('typo@example.con')
  })
})
