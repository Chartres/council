import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// Eyal, 30 Oct: on a new laptop without the beta password, his email should be enough. The
// door offers the account sign-in (email code) as a second way in.

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email?: string } }))
vi.mock('@/auth/AuthContext', () => ({
  SIGNUP_FLAG: 'council:signup-started',
  useAuth: () => ({ configured: true, user: auth.user, signInWithEmail: vi.fn(), verifyEmailCode: vi.fn(), signOut: council.signOut }),
}))
const council = vi.hoisted(() => ({ gate: 'ask', checkAgain: vi.fn(async () => false), signOut: vi.fn(async () => {}) }))
vi.mock('@/app/CouncilContext', () => ({
  useCouncil: () => ({ submitKey: vi.fn(), checkingKey: false, keyError: null, gate: council.gate, checkAgain: council.checkAgain }),
}))
vi.mock('@/analytics', () => ({ track: vi.fn() }))

const { PasswordPanel } = await import('./PasswordPanel')

beforeEach(() => {
  auth.user = null
  council.gate = 'ask'
})

describe('PasswordPanel', () => {
  it('offers sign-in by email as a second way in, and opens it there', () => {
    render(<PasswordPanel />)
    expect(screen.getByTestId('password-vs-account')).toHaveTextContent('you do not need the password')
    fireEvent.click(screen.getByRole('button', { name: 'Have an account? Sign in' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send link' })).toBeInTheDocument()
  })

  it('signed in and still at the door (the sign-in was refused), it offers the password, not a second sign-in', () => {
    auth.user = { id: 'u', email: 'eyal@test.dravec.org' }
    render(<PasswordPanel />)
    expect(screen.getByTestId('password-vs-account')).toHaveTextContent('signed in as eyal@test.dravec.org')
    expect(screen.queryByRole('button', { name: 'Have an account? Sign in' })).toBeNull()
  })

  // Pavol, 17 Nov: new registrations wait for his approval.
  it('waiting for approval: says who was told, keeps the password, offers Check again and Sign out', async () => {
    auth.user = { id: 'u', email: 'new@test.dravec.org' }
    council.gate = 'approval'
    render(<PasswordPanel />)
    expect(screen.getByRole('heading', { name: 'Waiting for approval' })).toBeInTheDocument()
    expect(screen.getByTestId('approval-waiting')).toHaveTextContent(
      'Pavol has been told that new@test.dravec.org would like to join. You will get in as soon as he approves. If you have the council password, you can enter it below.',
    )
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Have an account? Sign in' })).toBeNull()
    expect(screen.queryByTestId('password-vs-account')).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check again' })))
    expect(council.checkAgain).toHaveBeenCalledOnce()
    expect(screen.getByTestId('approval-still-waiting')).toHaveTextContent('Not approved yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(council.signOut).toHaveBeenCalledOnce()
  })
})
