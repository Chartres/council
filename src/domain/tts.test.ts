import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancel, setFallback, speak } from './tts'

// A player the test drives: nothing ends until the test says so.
class FakeAudio {
  static all: FakeAudio[] = []
  playbackRate = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused = false
  constructor(public src: string) {
    FakeAudio.all.push(this)
  }
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn(() => {
    this.paused = true
  })
  end() {
    this.onended?.()
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const audioResponse = () =>
  Promise.resolve({ ok: true, headers: { get: () => 'audio/mpeg' }, blob: () => Promise.resolve(new Blob(['mp3'])) })

beforeEach(() => {
  FakeAudio.all = []
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
  vi.stubEnv('VITE_GATEWAY_URL', 'https://gw.test')
  localStorage.setItem('council:key', 'pw')
})
afterEach(() => {
  cancel()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('speak through the gateway', () => {
  it('plays lines in order, one at a time, with the persona rate', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    const ended: string[] = []
    speak('first', { pitch: 1, rate: 0.95 }, () => ended.push('first'))
    speak('second', { pitch: 1, rate: 1.05 }, () => ended.push('second'))
    await flush()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers['x-council-key']).toBe('pw')
    expect(FakeAudio.all).toHaveLength(1)
    expect(FakeAudio.all[0].playbackRate).toBe(0.95)
    FakeAudio.all[0].end()
    await flush()
    expect(ended).toEqual(['first'])
    expect(FakeAudio.all).toHaveLength(2)
    expect(FakeAudio.all[1].playbackRate).toBe(1.05)
  })

  it('hands the line to the browser engine when the gateway cannot speak', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })))
    const spoken = vi.fn()
    setFallback(spoken)
    const onEnd = vi.fn()
    speak('hello', { pitch: 1, rate: 1 }, onEnd)
    await flush()
    expect(spoken).toHaveBeenCalledWith('hello', { pitch: 1, rate: 1 }, onEnd)
    expect(FakeAudio.all).toHaveLength(0)
  })

  it('cancel stops the player and drops the queue', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    const onEnd = vi.fn()
    speak('a', { pitch: 1, rate: 1 }, onEnd)
    speak('b', { pitch: 1, rate: 1 }, onEnd)
    await flush()
    cancel()
    expect(FakeAudio.all[0].pause).toHaveBeenCalled()
    await flush()
    expect(FakeAudio.all).toHaveLength(1)
    expect(onEnd).not.toHaveBeenCalled()
  })
})
