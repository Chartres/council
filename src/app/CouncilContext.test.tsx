import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// The beta door as the provider decides it (review 15 Nov): signed in passes it, loading waits,
// and signing in at the door after a 401 closes it and resumes what was refused.

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email?: string }, token: null as string | null, loading: false }))
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/auth/supabase', () => ({ supabase: null }))
vi.mock('@/analytics', () => ({ conversion: vi.fn(), keyAction: vi.fn(), logError: vi.fn() }))
const council = vi.hoisted(() => ({ openSession: vi.fn() }))
vi.mock('@/domain/council', async (orig) => ({ ...(await orig<object>()), openSession: council.openSession }))

const { CouncilProvider, useCouncil } = await import('./CouncilContext')
const { CouncilError } = await import('@/domain/council')

function Probe() {
  const c = useCouncil()
  return (
    <>
      <span data-testid="gate">{c.gate}</span>
      <button type="button" onClick={() => c.convene({ idea: 'Hire a first engineer?' })}>
        go
      </button>
      <button type="button" onClick={c.lockDoor}>
        lock
      </button>
    </>
  )
}
const app = () => (
  <CouncilProvider>
    <Probe />
  </CouncilProvider>
)
const gate = () => screen.getByTestId('gate').textContent
const signIn = () => Object.assign(auth, { user: { id: 'u1', email: 'eyal@test.dravec.org' }, token: 'jwt', loading: false })

beforeEach(() => {
  localStorage.clear()
  Object.assign(auth, { user: null, token: null, loading: false })
  council.openSession.mockReset()
})

describe('CouncilProvider gate', () => {
  it('asks a signed-out first visitor, and lets a signed-in user in with no stored key', () => {
    const { unmount } = render(app())
    expect(gate()).toBe('ask')
    unmount()
    signIn()
    render(app())
    expect(gate()).toBe('ready')
  })

  it('waits while the sign-in is loading and no key is stored', () => {
    auth.loading = true
    render(app())
    expect(gate()).toBe('wait')
  })

  it('a door reopened by a 401 closes when she signs in there', () => {
    localStorage.setItem('council:key', 'old')
    const r = render(app())
    fireEvent.click(screen.getByText('lock'))
    expect(gate()).toBe('ask')
    signIn()
    r.rerender(app())
    expect(gate()).toBe('ready')
  })

  it('a council refused at the door runs again with her token once she signs in there', async () => {
    localStorage.setItem('council:key', 'rotated')
    council.openSession.mockImplementationOnce(async function* () {
      throw new CouncilError('password')
    })
    council.openSession.mockImplementationOnce(async function* () {
      yield { type: 'done' }
    })
    const r = render(app())
    await act(async () => fireEvent.click(screen.getByText('go')))
    expect(gate()).toBe('ask')
    signIn()
    await act(async () => r.rerender(app()))
    expect(council.openSession).toHaveBeenCalledTimes(2)
    expect(council.openSession.mock.calls[1]![0]).toMatchObject({ idea: 'Hire a first engineer?' })
    expect(council.openSession.mock.calls[1]![1]).toMatchObject({ token: 'jwt' })
    expect(gate()).toBe('ready')
  })
})
