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

  it('says when a line starts playing, and in whose voice (Talk measures the wait with it)', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    const started = vi.fn()
    speak('gateway line', { pitch: 1, rate: 1 }, undefined, undefined, started)
    await flush()
    expect(started).toHaveBeenCalledWith('gateway')
    player().end()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })))
    setFallback(() => {})
    const fell = vi.fn()
    speak('browser line', { pitch: 1, rate: 1 }, undefined, undefined, fell)
    await flush()
    expect(fell).toHaveBeenCalledWith('browser')
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

  it('signed in with no key and outside a session (Listen on /quick), sends the bearer', async () => {
    const { setBearer } = await import('./key')
    localStorage.removeItem('council:key')
    setBearer('jwt')
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    speak('hello', { pitch: 1, rate: 1 })
    await flush()
    const headers = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers
    expect(headers.authorization).toBe('Bearer jwt')
    expect(headers['x-council-key']).toBeUndefined()
    setBearer(null)
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

  // On iPhone/iPad the browser voice is the robotic one (Eyal, 30 Oct): a line the gateway cannot
  // speak stays as text, the queue moves on, and the caller hears of it to offer "Tap to hear".
  describe('on iPhone and iPad', () => {
    const iphone = () =>
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1', maxTouchPoints: 5, platform: 'iPhone' })

    it('a failed line is not given to the browser voice; it ends, says it missed, and the next line plays', async () => {
      iphone()
      let call = 0
      vi.stubGlobal(
        'fetch',
        vi.fn(() => (++call === 1 ? Promise.resolve({ ok: false, headers: { get: () => 'application/json' } }) : audioResponse())),
      )
      const spoken = vi.fn()
      setFallback(spoken)
      const onEnd = vi.fn()
      const onMiss = vi.fn()
      const onStart = vi.fn()
      speak('lost', { pitch: 1, rate: 1 }, onEnd, 'seneca', onStart, onMiss)
      speak('arrives', { pitch: 1, rate: 1 })
      await flush()
      await flush()
      expect(spoken).not.toHaveBeenCalled()
      expect(onMiss).toHaveBeenCalledTimes(1)
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(onStart).not.toHaveBeenCalled()
      expect(lines()).toHaveLength(1)
    })

    it('a refused play() misses the same way', async () => {
      iphone()
      vi.stubGlobal('fetch', vi.fn(audioResponse))
      player().play.mockImplementationOnce(() => Promise.reject(new Error('NotAllowedError')))
      const spoken = vi.fn()
      setFallback(spoken)
      const onEnd = vi.fn()
      const onMiss = vi.fn()
      speak('refused', { pitch: 1, rate: 1 }, onEnd, undefined, undefined, onMiss)
      await flush()
      await flush()
      expect(spoken).not.toHaveBeenCalled()
      expect(onMiss).toHaveBeenCalledTimes(1)
      expect(onEnd).toHaveBeenCalledTimes(1)
    })

    it('an iPad that reports itself as a Mac counts', async () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5, platform: 'MacIntel' })
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })))
      const spoken = vi.fn()
      setFallback(spoken)
      const onMiss = vi.fn()
      speak('lost', { pitch: 1, rate: 1 }, undefined, undefined, undefined, onMiss)
      await flush()
      expect(spoken).not.toHaveBeenCalled()
      expect(onMiss).toHaveBeenCalledTimes(1)
    })

    // Review 15 Nov: Listen and the intake walk pass no onMiss and show no retry; on an iPhone
    // they keep the browser voice rather than go silent with no notice.
    it('a caller that cannot offer a retry (no onMiss) still gets the browser voice', async () => {
      iphone()
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })))
      const spoken = vi.fn()
      setFallback(spoken)
      speak('hello', { pitch: 1, rate: 1 })
      await flush()
      expect(spoken).toHaveBeenCalledTimes(1)
    })

    it('elsewhere the browser voice still speaks it and nothing is reported missed', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })))
      const spoken = vi.fn()
      setFallback(spoken)
      const onMiss = vi.fn()
      speak('hello', { pitch: 1, rate: 1 }, undefined, undefined, undefined, onMiss)
      await flush()
      expect(spoken).toHaveBeenCalledTimes(1)
      expect(onMiss).not.toHaveBeenCalled()
    })

    describe('with a gateway that hangs (iPhone)', () => {
      beforeEach(() => vi.useFakeTimers())
      afterEach(() => vi.useRealTimers())
      it('a timed-out line misses after the timeout and the browser voice stays quiet', async () => {
        iphone()
        vi.stubGlobal(
          'fetch',
          vi.fn(
            (_url: string, init: RequestInit) =>
              new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
          ),
        )
        const spoken = vi.fn()
        setFallback(spoken)
        const onEnd = vi.fn()
        const onMiss = vi.fn()
        speak('slow', { pitch: 1, rate: 1 }, onEnd, undefined, undefined, onMiss)
        await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS - 1)
        expect(onMiss).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(onMiss).toHaveBeenCalledTimes(1)
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(spoken).not.toHaveBeenCalled()
      })
    })
  })

  // Pavol, 20 Nov (Firefox on Android): a sentence that took over 6 s came in the phone's own
  // voice, between two in the adviser's. One message is read in one voice.
  describe('one voice per message', () => {
    const fail = () => Promise.resolve({ ok: false, headers: { get: () => 'application/json' } })
    const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)).text as string

    it('a message the gateway began keeps its voice: a failed line is fetched once more, then offered again', async () => {
      const tries: string[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn((_u: string, init: RequestInit) => {
          tries.push(bodyOf(init))
          return bodyOf(init) === 'Two.' ? fail() : audioResponse()
        }),
      )
      const spoken = vi.fn()
      setFallback(spoken)
      const onEnd = vi.fn()
      const onMiss = vi.fn()
      speak('One.', { pitch: 1, rate: 1 }, undefined, 'franklin', undefined, undefined, 'm1')
      speak('Two.', { pitch: 1, rate: 1 }, onEnd, 'franklin', undefined, onMiss, 'm1')
      await flush()
      player().end()
      await flush()
      await flush()
      expect(tries.filter((t) => t === 'Two.')).toHaveLength(2)
      expect(spoken).not.toHaveBeenCalled()
      expect(onMiss).toHaveBeenCalledTimes(1)
      expect(onEnd).toHaveBeenCalledTimes(1)
    })

    it('a line fetched once more that arrives is played in the gateway voice', async () => {
      let twos = 0
      vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => (bodyOf(init) === 'Two.' && ++twos === 1 ? fail() : audioResponse())))
      const spoken = vi.fn()
      setFallback(spoken)
      speak('One.', { pitch: 1, rate: 1 }, undefined, 'franklin', undefined, undefined, 'm1')
      speak('Two.', { pitch: 1, rate: 1 }, undefined, 'franklin', undefined, vi.fn(), 'm1')
      await flush()
      player().end()
      await flush()
      await flush()
      expect(lines()).toHaveLength(2)
      expect(spoken).not.toHaveBeenCalled()
    })

    it('a message that began in the browser voice ends in it, even when the gateway answers later lines', async () => {
      let call = 0
      vi.stubGlobal('fetch', vi.fn(() => (++call === 1 ? fail() : audioResponse())))
      const spoken = vi.fn((_t: string, _v: unknown, onEnd?: () => void) => onEnd?.())
      setFallback(spoken)
      speak('One.', { pitch: 1, rate: 1 }, undefined, 'seneca', undefined, undefined, 'm2')
      speak('Two.', { pitch: 1, rate: 1 }, undefined, 'seneca', undefined, undefined, 'm2')
      speak('Next message.', { pitch: 1, rate: 1 }, undefined, 'socrates', undefined, undefined, 'm3')
      await flush()
      await flush()
      expect(spoken.mock.calls.map((c) => c[0])).toEqual(['One.', 'Two.'])
      expect(lines()).toHaveLength(1) // the next message is the gateway's again
    })

    it('a missed line whose owner stops the room there does not move the queue on', async () => {
      vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => (bodyOf(init) === 'Two.' ? fail() : audioResponse())))
      setFallback(vi.fn())
      const onEnd = vi.fn()
      speak('One.', { pitch: 1, rate: 1 }, undefined, 'franklin', undefined, undefined, 'm4')
      speak('Two.', { pitch: 1, rate: 1 }, onEnd, 'franklin', undefined, () => cancel(), 'm4')
      speak('Three.', { pitch: 1, rate: 1 }, undefined, 'franklin', undefined, undefined, 'm4')
      await flush()
      player().end()
      await flush()
      await flush()
      expect(onEnd).not.toHaveBeenCalled()
      expect(lines()).toHaveLength(1)
    })
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
      expect(spoken.mock.calls.map((c) => c[0])).toEqual(['first'])
      // The second line's seconds start when it is due, after the first.
      await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS)
      expect(spoken.mock.calls.map((c) => c[0])).toEqual(['first', 'second'])
      expect(lines()).toHaveLength(0)
    })

    it('a line that hangs mid-message misses within its seconds once due, not twice that (review of #43)', async () => {
      let call = 0
      vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => (++call === 1 ? audioResponse() : hanging()(url, init))))
      const spoken = vi.fn()
      setFallback(spoken)
      speak('one', { pitch: 1, rate: 1 }, undefined, 'drucker', undefined, undefined, 'm2')
      speak('two', { pitch: 1, rate: 1 }, undefined, 'drucker', undefined, undefined, 'm2')
      await vi.advanceTimersByTimeAsync(0)
      player().end() // the first line played; the second is due now
      await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS)
      expect(spoken).toHaveBeenCalledWith('two', expect.anything(), expect.any(Function))
    })

    it('a later line that is slow while the first still plays is not cut (walkthrough, 21 Nov)', async () => {
      // Both requested at once; the first arrives in 1 s and plays 4 s, the second takes 7 s.
      const after = (ms: number, signal?: AbortSignal | null) =>
        new Promise((resolve, reject) => {
          setTimeout(resolve, ms)
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }).then(audioResponse)
      let call = 0
      vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => after(++call === 1 ? 1_000 : 7_000, init.signal)))
      const spoken = vi.fn()
      setFallback(spoken)
      speak('one', { pitch: 1, rate: 1 }, undefined, 'drucker', undefined, undefined, 'm1')
      speak('two', { pitch: 1, rate: 1 }, undefined, 'drucker', undefined, undefined, 'm1')
      await vi.advanceTimersByTimeAsync(1_000)
      expect(lines()).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(3_000)
      player().end() // the first line ends at 4 s
      await vi.advanceTimersByTimeAsync(3_000) // the second arrives at 7 s, 3 s after it was due
      expect(lines()).toHaveLength(2)
      expect(spoken).not.toHaveBeenCalled()
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

describe('the shared element while a line plays', () => {
  it('unlock (a later tap) does not swap out the line that is playing', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    speak('playing', { pitch: 1, rate: 1 })
    await flush()
    await flush()
    const src = player().src
    expect(src).toMatch(/^blob:/)
    unlock()
    expect(player().src).toBe(src)
  })

  it('a line whose element errors and whose play() is refused ends once', async () => {
    vi.stubGlobal('fetch', vi.fn(audioResponse))
    setFallback((_t, _v, onEnd) => onEnd?.())
    player().play.mockImplementationOnce(function (this: FakeAudio) {
      player().onerror?.()
      return Promise.reject(new Error('decode'))
    })
    const onEnd = vi.fn()
    speak('broken', { pitch: 1, rate: 1 }, onEnd)
    await flush()
    await flush()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
