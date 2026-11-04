import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TTS_TIMEOUT_MS, cancel, setFallback, setSession, speak, unlock } from './tts'

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

  it('unlock also primes the browser voice with a silent line, so the fallback can speak later (iOS)', () => {
    const spoken: { text: string; volume: number }[] = []
    vi.stubGlobal('SpeechSynthesisUtterance', class { volume = 1; constructor(public text: string) {} })
    vi.stubGlobal('speechSynthesis', { speak: (u: { text: string; volume: number }) => spoken.push({ text: u.text, volume: u.volume }) })
    unlock()
    expect(spoken).toEqual([{ text: ' ', volume: 0 }])
  })

  it('unlock without a browser voice is harmless', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    expect(() => unlock()).not.toThrow()
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
    expect(spoken).toHaveBeenCalledWith('hello', { pitch: 1, rate: 1 }, expect.any(Function))
    spoken.mock.calls[0][2]() // the browser voice ends the line: her callback runs once
    spoken.mock.calls[0][2]()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(lines()).toHaveLength(0)
  })

  // A gateway that accepts the request and never answers used to leave the line, and every line
  // queued behind it, silent until the conversation was left (voice status, 3 Nov).
  describe('a gateway that hangs', () => {
    const hanging = () =>
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      )
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('gives each line a few seconds, then the browser voice speaks it, and the lines after it', async () => {
      expect(TTS_TIMEOUT_MS).toBeGreaterThanOrEqual(3_000)
      expect(TTS_TIMEOUT_MS).toBeLessThanOrEqual(10_000)
      vi.stubGlobal('fetch', hanging())
      // The browser voice says each line and reports its end straight away.
      const spoken = vi.fn((_t: string, _v: unknown, onEnd?: () => void) => onEnd?.())
      setFallback(spoken)
      speak('first', { pitch: 1, rate: 1 })
      speak('second', { pitch: 1, rate: 1 })
      await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS - 1)
      expect(spoken).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(spoken.mock.calls.map((c) => c[0])).toEqual(['first', 'second'])
      expect(lines()).toHaveLength(0)
    })

    it('a body that stalls after the headers falls back the same way', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) =>
          Promise.resolve({
            ok: true,
            headers: { get: () => 'audio/mpeg' },
            blob: () =>
              new Promise((_r, reject) =>
                init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
              ),
          }),
        ),
      )
      const spoken = vi.fn()
      setFallback(spoken)
      speak('slow body', { pitch: 1, rate: 1 })
      await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS)
      expect(spoken).toHaveBeenCalledWith('slow body', { pitch: 1, rate: 1 }, expect.any(Function))
    })

    it('the next gateway line waits for the browser voice to finish the fallen-back one', async () => {
      let call = 0
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init: RequestInit) => (++call === 1 ? hanging()(url, init) : audioResponse())),
      )
      let finish: (() => void) | undefined
      setFallback((_t, _v, onEnd) => {
        finish = onEnd
      })
      speak('hangs', { pitch: 1, rate: 1 })
      speak('arrives', { pitch: 1, rate: 1 })
      await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS)
      expect(finish).toBeDefined()
      expect(lines()).toHaveLength(0) // not on top of the browser voice
      finish!()
      await vi.advanceTimersByTimeAsync(0)
      expect(lines()).toHaveLength(1)
    })

    it('a browser voice that never reports its end (iOS) does not stall the queue', async () => {
      let call = 0
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init: RequestInit) => (++call === 1 ? hanging()(url, init) : audioResponse())),
      )
      setFallback(() => {}) // onEnd never called
      speak('short line', { pitch: 1, rate: 1 })
      speak('arrives', { pitch: 1, rate: 1 })
      await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS + 30_000)
      expect(lines()).toHaveLength(1)
    })

    it('a line cancelled while it hangs stays silent: no fallback after the timeout', async () => {
      vi.stubGlobal('fetch', hanging())
      const spoken = vi.fn()
      setFallback(spoken)
      speak('left behind', { pitch: 1, rate: 1 })
      await vi.advanceTimersByTimeAsync(10)
      cancel()
      await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS * 2)
      expect(spoken).not.toHaveBeenCalled()
    })
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
