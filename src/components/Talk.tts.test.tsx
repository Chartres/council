import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Item } from '@/domain/mastermind'
import { cancel } from '@/domain/tts'

let ios = false
const analytics = vi.hoisted(() => ({ keyAction: vi.fn() }))
vi.mock('@/analytics', () => analytics)
vi.mock('@/domain/stt', async (orig) => ({ ...(await orig<object>()), isAppleMobile: () => ios, recordingSupported: () => true }))
const fake = await vi.hoisted(async () => (await import('@/test/fakeCapture')).fakeCaptures())
vi.mock('@/domain/capture', async (orig) => ({ ...(await orig<object>()), openCapture: fake.openCapture, primeMic: fake.primeMic }))

const { Talk } = await import('./Talk')

// Talk against the real tts queue: only the network, the player and the mic are fakes.

class Player {
  static all: Player[] = []
  srcs: string[] = []
  playbackRate = 1
  defaultPlaybackRate = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    Player.all.push(this)
  }
  set src(v: string) {
    this.srcs.push(v)
  }
  get src() {
    return this.srcs[this.srcs.length - 1] ?? ''
  }
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)))
const audio = () => ({ ok: true, headers: { get: () => 'audio/mpeg' }, blob: () => Promise.resolve(new Blob(['mp3'])) })

let n = 0
let pending: ((v: unknown) => void)[] = []
beforeEach(() => {
  fake.reset()
  pending = []
  vi.stubGlobal('Audio', Player)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} })
  vi.stubEnv('VITE_GATEWAY_URL', 'https://gw.test')
  // Downloads wait until the test releases them (a server that ignores the abort).
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => pending.push(() => resolve(audio())))))
})
afterEach(() => {
  cancel()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const player = () => Player.all[0]!
const lines = () => player().srcs.filter((s) => s.startsWith('blob:'))

describe('Talk with the real speaker queue', () => {
  it('unlocks the shared player in the tap, and Cut in silences the line still downloading', async () => {
    let items: Item[] = []
    const view = () => <Talk on onChange={() => {}} items={items} streaming onSay={() => {}} />
    const { rerender } = render(view())
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    // Synchronously inside the tap, on the element every line will use.
    expect(player().play).toHaveBeenCalledTimes(1)
    expect(player().src).toMatch(/^data:audio\/wav/)

    items = [{ kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits? ', streaming: true }]
    rerender(view())
    await flush()
    expect(pending).toHaveLength(2) // both sentences downloading, nothing playing yet
    expect(screen.getByRole('status')).toHaveTextContent('Drucker is answering. Tap to speak instead.')

    fireEvent.click(screen.getByTestId('cut-in'))
    pending.forEach((release) => release(undefined)) // the downloads land after the cut
    await flush()
    await flush()
    expect(lines()).toHaveLength(0)
    expect(Player.all).toHaveLength(1)
    expect(screen.getByTestId('voice-finish')).toBeInTheDocument() // the mic is open: his turn
  })
})

// iPhone (Eyal, 30 Oct: the read-aloud voice is robotic): a line the gateway cannot speak is not
// read by the browser voice. Since 21 Nov the room holds at that line and offers it again,
// rather than reading on past a gap.
describe('Talk on iPhone when the gateway cannot speak a line', () => {
  const synth = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] }
  const failed = () => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })
  beforeEach(() => {
    synth.speak.mockClear()
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} })
  })
  afterEach(() => {
    ios = false
  })

  const start = (items: Item[]) => {
    const view = (it: Item[]) => <Talk on onChange={() => {}} items={it} streaming={false} onSay={() => {}} />
    const r = render(view([]))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    synth.speak.mockClear() // the unlocking tap's silent line
    r.rerender(view(items))
  }
  const floor: Item[] = [{ kind: 'floor', question: 'What would change your mind?' }]

  it('does not use the browser voice, holds the room there, and offers Tap to hear', async () => {
    ios = true
    vi.stubGlobal('fetch', vi.fn(failed))
    start(floor)
    await flush()
    await flush()
    expect(synth.speak).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('voice did not load. Tap to hear it, or read it above.')
    expect(fake.all).toHaveLength(1) // opened in the Start tap, shut for the line, not opened again

    // One tap tries the gateway once more, and this time it plays.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(audio())))
    fireEvent.click(screen.getByRole('button', { name: 'Tap to hear' }))
    await flush()
    await flush()
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body).text).toBe('What would change your mind?')
    expect(lines()).toHaveLength(1)
    expect(screen.getByRole('status')).not.toHaveTextContent('did not load')
    // Only the tap's silent unlocking line went to the browser engine.
    expect(synth.speak.mock.calls.map((c) => (c[0] as { text: string }).text)).toEqual([' '])
  })

  it('elsewhere the browser voice reads it, as before, and nothing is offered', async () => {
    vi.stubGlobal('fetch', vi.fn(failed))
    start(floor)
    await flush()
    await flush()
    expect(synth.speak).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).not.toHaveTextContent('did not load')
  })
})

describe('Talk on iPhone, review 15 Nov', () => {
  const failed = () => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] })
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} })
    analytics.keyAction.mockClear()
  })
  afterEach(() => {
    ios = false
  })

  it('a missed first sentence holds the room: the next one is not read over the gap', async () => {
    ios = true
    let call = 0
    vi.stubGlobal('fetch', vi.fn(() => (++call === 1 ? failed() : Promise.resolve(audio()))))
    const view = (it: Item[]) => <Talk on onChange={() => {}} items={it} streaming={false} onSay={() => {}} />
    const r = render(view([]))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    const before = lines().length // the player lives for the page: earlier tests' lines are on it
    r.rerender(view([{ kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits?' }]))
    await flush()
    await flush()
    await flush()
    expect(lines()).toHaveLength(before)
    expect(screen.getByRole('status')).toHaveTextContent('Drucker’s voice did not load.')
  })

  it('a retried line is not timed as the turn: the wait before the tap is hers', async () => {
    ios = true
    vi.stubGlobal('fetch', vi.fn(failed))
    const onSay = vi.fn()
    const view = (it: Item[]) => <Talk on onChange={() => {}} items={it} streaming={false} onSay={onSay} />
    const r = render(view([]))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await flush()
    act(() => fake.last().say('we have no engineers'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledWith('we have no engineers', true)
    r.rerender(view([{ kind: 'user', text: 'we have no engineers' }, { kind: 'floor', question: 'Who pays for it?' }]))
    await flush()
    await flush()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(audio())))
    const before = lines().length
    fireEvent.click(screen.getByRole('button', { name: 'Tap to hear' }))
    await flush()
    await flush()
    expect(lines()).toHaveLength(before + 1)
    expect(analytics.keyAction.mock.calls.filter((c) => c[0] === 'voice_turn')).toEqual([])
  })
})
