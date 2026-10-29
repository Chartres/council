import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CouncilError } from '@/domain/council'
import type { MastermindEvent } from '@/domain/mastermind'

// Discussions (Eyal, 29 Oct): saved after each turn and after a decision, reopened read-only,
// continued; a refused continue goes back to the record; a stream from before writes nowhere.

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
  reasoning: '',
  assumptions: [],
  next_action: 'Email two clients',
  owner: 'me',
  review_trigger: '',
  confidence: 60,
  map: null,
}

/** Each call to startCouncil takes the next script; a script may wait on a gate before ending. */
let scripts: (() => AsyncGenerator<MastermindEvent>)[] = []
const starts: unknown[] = []
vi.mock('@/domain/mastermind', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/mastermind')>()
  return {
    ...actual,
    startCouncil: (body: unknown) => {
      starts.push(body)
      return scripts.shift()!()
    },
    capture: vi.fn(async () => ({ entry: { ...proposal, status: 'proposal', created_at: '2026-10-28' } })),
  }
})

const { MastermindProvider, useMastermind } = await import('./MastermindContext')
const mastermind = await import('@/domain/mastermind')
const wrapper = ({ children }: { children: ReactNode }) => <MastermindProvider>{children}</MastermindProvider>

const opening = (sid: string): (() => AsyncGenerator<MastermindEvent>) =>
  async function* () {
    yield { type: 'session', session_id: sid } as MastermindEvent
    yield { type: 'contribution', speaker: 'drucker', text: 'Who is the customer?' } as MastermindEvent
    yield { type: 'proposal', ...proposal } as MastermindEvent
    yield { type: 'floor', question: 'Which customer first?' } as MastermindEvent
  }

beforeEach(() => {
  localStorage.clear()
  scripts = []
  starts.length = 0
})

describe('discussions in this browser', () => {
  it('a decision she accepts is saved in the discussion record, so reopened it reads as decided', async () => {
    scripts = [opening('s1')]
    const { result } = renderHook(() => useMastermind(), { wrapper })
    act(() => result.current.begin({ goal: 'Pilot the tier?' }))
    await waitFor(() => expect(result.current.conversation?.streaming).toBe(false))
    const index = result.current.conversation!.items.findIndex((i) => i.kind === 'proposal')
    act(() => result.current.accept(index, { decision: proposal.decision, next_action: proposal.next_action }))
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('council:discussions') ?? '[]')
      expect(saved[0].items.find((i: { kind: string }) => i.kind === 'proposal').state).toBe('accepted')
    })
    expect(result.current.discussions).toHaveLength(1)
  })

  it('a continue the gateway refuses goes back to the record, with the reason and Continue again', async () => {
    scripts = [
      opening('s1'),
      // eslint-disable-next-line require-yield
      async function* () {
        throw new CouncilError('sign_in')
      },
      opening('s2'),
    ]
    const { result } = renderHook(() => useMastermind(), { wrapper })
    act(() => result.current.begin({ goal: 'Pilot the tier?' }))
    await waitFor(() => expect(result.current.conversation?.streaming).toBe(false))
    const id = result.current.conversation!.localId
    const before = result.current.conversation!.items.length

    // She starts another, then comes back to the first: read-only.
    scripts.unshift(opening('s-other'))
    act(() => result.current.begin({ goal: 'Something else' }))
    await waitFor(() => expect(result.current.conversation?.streaming).toBe(false))
    act(() => result.current.openDiscussion(id))
    expect(result.current.conversation).toMatchObject({ localId: id, past: true })

    act(() => result.current.continueDiscussion())
    await waitFor(() => expect(result.current.conversation?.failure).toBe('sign_in'))
    await waitFor(() => expect(result.current.conversation?.past).toBe(true))
    expect(result.current.conversation!.items).toHaveLength(before)

    // Signed in now: Continue works, seeded with the record, and the same discussion grows.
    act(() => result.current.continueDiscussion())
    await waitFor(() => expect(result.current.conversation?.sessionId).toBe('s2'))
    await waitFor(() => expect(result.current.conversation?.streaming).toBe(false))
    expect(result.current.conversation).toMatchObject({ localId: id, past: false, earlier: before })
    const resume = (starts.at(-1) as { resume: { items: { who: string; text: string }[] } }).resume
    expect(resume.items).toContainEqual({ who: 'drucker', text: 'Who is the customer?' })
  })

  it('a stream from before writes nowhere once she has opened another discussion, even the same one again', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    scripts = [
      async function* () {
        yield { type: 'session', session_id: 's1' } as MastermindEvent
        yield { type: 'contribution', speaker: 'drucker', text: 'Who is the customer?' } as MastermindEvent
        await gate
        yield { type: 'contribution', speaker: 'jobs', text: 'LATE LINE' } as MastermindEvent
      },
      opening('s-other'),
    ]
    const { result } = renderHook(() => useMastermind(), { wrapper })
    act(() => result.current.begin({ goal: 'Pilot the tier?' }))
    await waitFor(() => expect(result.current.conversation?.items.some((i) => i.kind === 'contribution')).toBe(true))
    const first = result.current.conversation!.localId

    // Save what she has so far by finishing another discussion, then open the first again.
    localStorage.setItem(
      'council:discussions',
      JSON.stringify([{ id: first, roster: 'business', advisers: ['drucker'], intake: null, items: result.current.conversation!.items, created_at: '2026-10-29', ended: false }]),
    )
    act(() => result.current.begin({ goal: 'Something else' }))
    await waitFor(() => expect(result.current.conversation?.streaming).toBe(false))
    await waitFor(() => expect(result.current.discussions.some((d) => d.id === first)).toBe(true))
    act(() => result.current.openDiscussion(first))
    await act(async () => release())
    expect(JSON.stringify(result.current.conversation!.items)).not.toContain('LATE LINE')
  })

  it('opening a past discussion mid-answer: the live stream does not spill into it', async () => {
    localStorage.setItem(
      'council:discussions',
      JSON.stringify([{ id: 'old', roster: 'business', advisers: ['drucker'], intake: { goal: 'Old one' }, items: [{ kind: 'user', text: 'earlier' }], created_at: '2026-10-20', ended: false }]),
    )
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    scripts = [
      async function* () {
        yield { type: 'session', session_id: 's1' } as MastermindEvent
        await gate
        yield { type: 'contribution', speaker: 'jobs', text: 'LATE LINE' } as MastermindEvent
      },
    ]
    const { result } = renderHook(() => useMastermind(), { wrapper })
    await waitFor(() => expect(result.current.discussions.some((d) => d.id === 'old')).toBe(true))
    act(() => result.current.begin({ goal: 'New one' }))
    await waitFor(() => expect(result.current.conversation?.sessionId).toBe('s1'))
    act(() => result.current.openDiscussion('old'))
    await act(async () => release())
    expect(result.current.conversation).toMatchObject({ localId: 'old', past: true })
    expect(JSON.stringify(result.current.conversation!.items)).not.toContain('LATE LINE')
  })

  it('a decision captured with the chip lands only in the discussion it was captured in', async () => {
    let release: () => void = () => {}
    vi.mocked(mastermind.capture).mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = () => res({ entry: { ...proposal, decision: 'CAPTURED IN A' } } as never)
        }),
    )
    scripts = [opening('sA'), opening('sB')]
    const { result } = renderHook(() => useMastermind(), { wrapper })
    act(() => result.current.begin({ goal: 'A' }))
    await waitFor(() => expect(result.current.conversation?.streaming).toBe(false))
    act(() => result.current.control({ kind: 'capture' }))
    act(() => result.current.begin({ goal: 'B' }))
    await waitFor(() => expect(result.current.conversation?.sessionId).toBe('sB'))
    await act(async () => release())
    await waitFor(() => expect(result.current.conversation?.streaming).toBe(false))
    expect(JSON.stringify(result.current.conversation!.items)).not.toContain('CAPTURED IN A')
  })
})
