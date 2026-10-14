import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancel, setFallback, setSession, speak, unlock } from './tts'

// The one shared player, driven by the test: nothing ends until the test says so.
class FakeAudio {
  static all: FakeAudio[] = []
  srcs: string[] = []
  playbackRate = 1
  defaultPlaybackRate = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeAudio.all.push(this)
  }
  set src(v: string) {
    this.srcs.push(v)
  }
  get src() {
    return this.srcs[this.srcs.length - 1] ?? ''
  }
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  end() {
    this.onended?.()
  }
}
// tts keeps its element for the page's life: the first instance is the player in every test.
const player = () => FakeAudio.all[0]!

const flush = () => new Promise((r) => setTimeout(r, 0))
const audioResponse = () =>
  Promise.resolve({ ok: true, headers: { get: () => 'audio/mpeg' }, blob: () => Promise.resolve(new Blob(['mp3'])) })
const lines = () => player().srcs.filter((s) => s.startsWith('blob:'))

let n = 0
beforeEach(() => {
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} })
  vi.stubEnv('VITE_GATEWAY_URL', 'https://gw.test')
  localStorage.setItem('council:key', 'pw')
  unlock() // creates the shared element on first use
  player().srcs = []
  player().play.mockClear()
  player().pause.mockClear()
})
afterEach(() => {
  cancel()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('speak through the gateway', () => {
  it('plays lines in order on one element, with the persona rate', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    const ended: string[] = []
    speak('first', { pitch: 1, rate: 0.95 }, () => ended.push('first'))
    speak('second', { pitch: 1, rate: 1.05 }, () => ended.push('second'))
    await flush()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers['x-council-key']).toBe('pw')
    expect(FakeAudio.all).toHaveLength(1)
    expect(lines()).toHaveLength(1)
    expect(player().playbackRate).toBe(0.95)
    player().end()
    await flush()
    expect(ended).toEqual(['first'])
    expect(lines()).toHaveLength(2)
    expect(player().playbackRate).toBe(1.05)
  })

  it('unlock plays the silent clip on the same element the lines use', () => {
    unlock()
    expect(player().src).toMatch(/^data:audio\/wav/)
    expect(player().play).toHaveBeenCalledTimes(1)
    expect(FakeAudio.all).toHaveLength(1)
  })

  it('names the speaker and the session so the gateway can pick their voice', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    setSession('s-1')
    speak('Start with the customer.', { pitch: 1, rate: 1 }, undefined, 'drucker')
    speak('Plain line.', { pitch: 1, rate: 1 })
    setSession(null)
    speak('No session.', { pitch: 1, rate: 1 }, undefined, 'drucker')
    await flush()
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0]).toBe('https://gw.test/v1/tts')
    expect(JSON.parse(calls[0][1].body)).toEqual({ text: 'Start with the customer.', speaker: 'drucker', session_id: 's-1' })
    expect(JSON.parse(calls[1][1].body)).toEqual({ text: 'Plain line.' })
    expect(JSON.parse(calls[2][1].body)).toEqual({ text: 'No session.' })
  })

  it('hands the line to the browser engine when the gateway cannot speak', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })))
    const spoken = vi.fn()
    setFallback(spoken)
    const onEnd = vi.fn()
    speak('hello', { pitch: 1, rate: 1 }, onEnd)
    await flush()
    expect(spoken).toHaveBeenCalledWith('hello', { pitch: 1, rate: 1 }, onEnd)
    expect(lines()).toHaveLength(0)
  })

  it('cancel stops the player and drops the queue', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    const onEnd = vi.fn()
    speak('a', { pitch: 1, rate: 1 }, onEnd)
    speak('b', { pitch: 1, rate: 1 }, onEnd)
    await flush()
    cancel()
    expect(player().pause).toHaveBeenCalled()
    await flush()
    expect(lines()).toHaveLength(1)
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('cancel aborts the line still downloading: it never plays or falls back, and one loop runs after', async () => {
    let release!: () => void
    const slow = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((resolve) => {
          release = () => resolve(audioResponse())
          void init
        }),
    )
    vi.stubGlobal('fetch', slow)
    const spoken = vi.fn()
    setFallback(spoken)
    speak('downloading', { pitch: 1, rate: 1 })
    await flush()
    cancel()
    expect((slow.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true)
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    const after = vi.fn()
    speak('after', { pitch: 1, rate: 1 }, after)
    release() // the old download lands anyway (a server that ignores the abort)
    await flush()
    await flush()
    expect(lines()).toHaveLength(1) // only "after"
    expect(spoken).not.toHaveBeenCalled()
    player().end()
    await flush()
    expect(after).toHaveBeenCalledTimes(1)
    expect(lines()).toHaveLength(1) // no second loop picking anything up
  })

  it('a line whose play() is refused because it was cancelled stays silent', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    const spoken = vi.fn()
    setFallback(spoken)
    let refuse!: (e: Error) => void
    player().play.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)))
    speak('a', { pitch: 1, rate: 1 })
    await flush()
    cancel()
    refuse(new Error('play() interrupted by pause()'))
    await flush()
    expect(spoken).not.toHaveBeenCalled()
  })
})
