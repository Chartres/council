import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CouncilError } from '@/domain/council'
import type { MastermindEvent } from '@/domain/mastermind'

// Pavol, 17 Nov: an account waiting for approval. On the v4 path a refused start or turn
// waits at the door; once Check again lets her in, it runs again and the failure line goes.

vi.mock('@/analytics', () => ({ conversion: vi.fn(), keyAction: vi.fn(), logError: vi.fn() }))
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: null, token: null, loading: false }) }))
vi.mock('@/auth/supabase', () => ({ supabase: null }))
const council = vi.hoisted(() => ({ gate: 'ready', lockApproval: vi.fn() }))
vi.mock('./CouncilContext', () => ({
  useCouncil: () => ({ councilKey: null, isAdmin: false, tier: null, lockDoor: vi.fn(), lockApproval: council.lockApproval, gate: council.gate, go: vi.fn() }),
}))

type Script = () => AsyncGenerator<MastermindEvent>
let starts: Script[] = []
let turns: Script[] = []
const startBodies: unknown[] = []
const turnBodies: unknown[] = []
vi.mock('@/domain/mastermind', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/domain/mastermind')>()),
  startCouncil: (body: unknown) => (startBodies.push(body), starts.shift()!()),
  sendTurn: (body: unknown) => (turnBodies.push(body), turns.shift()!()),
}))

const { MastermindProvider, useMastermind } = await import('./MastermindContext')
const wrapper = ({ children }: { children: ReactNode }) => <MastermindProvider>{children}</MastermindProvider>

const refused: Script = async function* () {
  throw new CouncilError('approval')
}
const opening: Script = async function* () {
  yield { type: 'session', session_id: 's1' } as MastermindEvent
  yield { type: 'floor', question: 'Which customer first?' } as MastermindEvent
}

beforeEach(() => {
  localStorage.clear()
  council.gate = 'ready'
  council.lockApproval.mockReset()
  starts = []
  turns = []
  startBodies.length = 0
  turnBodies.length = 0
})

describe('v4 and the approval door', () => {
  it('a start refused for approval runs again with the same intake after Check again, and the failure line goes', async () => {
    starts = [refused, opening]
    const { result, rerender } = renderHook(() => useMastermind(), { wrapper })
    act(() => result.current.begin({ goal: 'Open a bakery' }))
    await waitFor(() => expect(result.current.conversation?.failure).toBe('approval'))
    expect(council.lockApproval).toHaveBeenCalled()
    council.gate = 'approval'
    rerender()
    expect(startBodies).toHaveLength(1)
    council.gate = 'ready'
    rerender()
    await waitFor(() => expect(result.current.conversation?.sessionId).toBe('s1'))
    expect(startBodies[1]).toMatchObject({ intake: { goal: 'Open a bakery' } })
    expect(result.current.conversation?.failure).toBeNull()
  })

  it('a turn refused for approval is sent again once, without a second copy of her message', async () => {
    starts = [opening]
    turns = [refused, async function* () {
      yield { type: 'floor', question: 'And then?' } as MastermindEvent
    }]
    const { result, rerender } = renderHook(() => useMastermind(), { wrapper })
    act(() => result.current.begin({ goal: 'Open a bakery' }))
    await waitFor(() => expect(result.current.conversation?.sessionId).toBe('s1'))
    act(() => result.current.say('Saturdays only'))
    await waitFor(() => expect(result.current.conversation?.failure).toBe('approval'))
    council.gate = 'approval'
    rerender()
    council.gate = 'ready'
    rerender()
    await waitFor(() => expect(turnBodies).toHaveLength(2))
    expect(turnBodies[1]).toMatchObject({ session_id: 's1', message: 'Saturdays only' })
    await waitFor(() => expect(result.current.conversation?.streaming).toBe(false))
    expect(result.current.conversation?.items.filter((i) => i.kind === 'user')).toHaveLength(1)
    expect(result.current.conversation?.failure).toBeNull()
  })
})
