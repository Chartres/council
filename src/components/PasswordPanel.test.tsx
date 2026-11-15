import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// Eyal, 30 Oct: on a new laptop without the beta password, his email should be enough. The
// door offers the account sign-in (email code) as a second way in.

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email?: string } }))
vi.mock('@/auth/AuthContext', () => ({
  SIGNUP_FLAG: 'council:signup-started',
  useAuth: () => ({ configured: true, user: auth.user, signInWithEmail: vi.fn(), verifyEmailCode: vi.fn() }),
}))
vi.mock('@/app/CouncilContext', () => ({ useCouncil: () => ({ submitKey: vi.fn(), checkingKey: false, keyError: null }) }))
vi.mock('@/analytics', () => ({ track: vi.fn() }))

const { PasswordPanel } = await import('./PasswordPanel')

beforeEach(() => {
  auth.user = null
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
})
