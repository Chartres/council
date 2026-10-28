import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MastermindEvent } from '@/domain/mastermind'

// The activation moment (portfolio activation_event = 'conversion'): a proposal accepted into
// the journal. The fleet health check counts `conversion` rows, so this must call conversion().

const analytics = vi.hoisted(() => ({ conversion: vi.fn(), keyAction: vi.fn(), logError: vi.fn() }))
vi.mock('@/analytics', () => analytics)
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: null, token: null, loading: false }) }))
vi.mock('@/auth/supabase', () => ({ supabase: null }))
vi.mock('./CouncilContext', () => ({
  useCouncil: () => ({ councilKey: 'k', isAdmin: false, tier: null, lockDoor: vi.fn(), go: vi.fn() }),
}))

const proposal = {
  id: 'p1',
  decision: 'Run the pilot',
  reasoning: 'Cheap to learn',
  assumptions: ['Two clients say yes'],
  next_action: 'Email two clients',
  owner: 'me',
  review_trigger: 'Friday',
  confidence: 60,
  map: null,
}

vi.mock('@/domain/mastermind', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/mastermind')>()
  return {
    ...actual,
    startCouncil: async function* (): AsyncGenerator<MastermindEvent> {
      yield { type: 'session', session_id: 's1' } as MastermindEvent
      yield { type: 'proposal', ...proposal } as MastermindEvent
      yield { type: 'done' } as MastermindEvent
    },
    capture: vi.fn(async () => ({ entry: { ...proposal, status: 'proposal', created_at: '2026-10-28' } })),
  }
})

const { MastermindProvider, useMastermind } = await import('./MastermindContext')

describe('activation', () => {
  beforeEach(() => {
    localStorage.clear()
    analytics.conversion.mockClear()
  })

  it('accepting a proposal into the journal fires conversion() once, and only then', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MastermindProvider>{children}</MastermindProvider>
    const { result } = renderHook(() => useMastermind(), { wrapper })

    act(() => result.current.begin())
    await waitFor(() => expect(result.current.conversation?.items.some((i) => i.kind === 'proposal')).toBe(true))
    expect(analytics.conversion).not.toHaveBeenCalled()

    const index = result.current.conversation!.items.findIndex((i) => i.kind === 'proposal')
    act(() => result.current.accept(index, { decision: proposal.decision, next_action: proposal.next_action }))

    await waitFor(() => expect(analytics.conversion).toHaveBeenCalledTimes(1))
    expect(analytics.conversion).toHaveBeenCalledWith({ v: 4, roster: 'business' })
    expect(result.current.journal.entries.some((e) => e.status === 'accepted')).toBe(true)
  })
})
