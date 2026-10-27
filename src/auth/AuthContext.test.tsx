import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { track } from '@/analytics'

// signup_completed is the person actually arriving signed in (the magic link or code worked),
// not the email being sent — counting sends made "4 sign-ups" mean 4 emails requested.

type Cb = (event: string, session: { access_token: string; user: { id: string; email?: string } } | null) => void
const auth = vi.hoisted(() => ({ cb: null as Cb | null }))

vi.mock('./supabase', () => ({
  isAuthConfigured: true,
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: (cb: Cb) => {
        auth.cb = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signInWithOtp: () => Promise.resolve({ error: null }),
      signOut: () => Promise.resolve({}),
    },
  },
}))
vi.mock('@/analytics', () => ({ track: vi.fn(), identify: vi.fn() }))

const { AuthProvider } = await import('./AuthContext')

const session = (id: string) => ({ access_token: 't', user: { id, email: `${id}@x.test` } })
const completions = () => vi.mocked(track).mock.calls.filter(([e]) => e === 'signup_completed')

beforeEach(() => {
  localStorage.clear()
  vi.mocked(track).mockReset()
})

describe('signup_completed', () => {
  it('fires once when a person signs in, not on a restored session or a token refresh', async () => {
    render(
      <AuthProvider>
        <p>app</p>
      </AuthProvider>,
    )
    await act(async () => {})
    act(() => auth.cb!('INITIAL_SESSION', session('u1')))
    expect(completions()).toEqual([])
    act(() => auth.cb!('SIGNED_IN', session('u1')))
    act(() => auth.cb!('TOKEN_REFRESHED', session('u1')))
    act(() => auth.cb!('SIGNED_IN', session('u1'))) // tab refocus re-emits it
    expect(completions()).toEqual([['signup_completed', { method: 'email' }]])
    act(() => auth.cb!('SIGNED_IN', session('u2')))
    expect(completions()).toHaveLength(2)
  })
})
