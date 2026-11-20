import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAppleMobile, markBrowserEngineBroken, resetAudioInput, resetEars, serverEars, SttError, transcribe, unlockAudioInput } from './stt'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const PIXEL = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'

beforeEach(() => {
  vi.stubEnv('VITE_GATEWAY_URL', 'https://gw.test')
  localStorage.clear()
  resetEars()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isAppleMobile', () => {
  it('is an iPhone, or an iPad that says it is a Mac but has touch', () => {
    expect(isAppleMobile({ userAgent: IPHONE, maxTouchPoints: 5, platform: 'iPhone' })).toBe(true)
    expect(isAppleMobile({ userAgent: MAC, maxTouchPoints: 5, platform: 'MacIntel' })).toBe(true)
    expect(isAppleMobile({ userAgent: MAC, maxTouchPoints: 0, platform: 'MacIntel' })).toBe(false)
    expect(isAppleMobile({ userAgent: PIXEL, maxTouchPoints: 5, platform: 'Linux armv8l' })).toBe(false)
  })
})

describe('serverEars: which ears a mic tap uses', () => {
  const canRecord = () => {
    vi.stubGlobal('MediaRecorder', class {})
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn() } })
  }

  it('records for the gateway on an iPhone, whose own recogniser hears nothing (Eyal, 11 and 29 Oct)', () => {
    canRecord()
    expect(serverEars(true, { userAgent: IPHONE, maxTouchPoints: 5, platform: 'iPhone' })).toBe(true)
  })

  it('keeps the browser recogniser on a desktop, where it shares the mic with the meter, until it fails once this visit', () => {
    canRecord()
    const desk = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/142.0 Safari/537.36', maxTouchPoints: 0, platform: 'MacIntel' }
    expect(serverEars(true, desk)).toBe(false)
    markBrowserEngineBroken()
    expect(serverEars(true, desk)).toBe(true)
  })

  it('records for the gateway on Android, whose recogniser takes the mic away from the meter', () => {
    canRecord()
    expect(serverEars(true, { userAgent: PIXEL, maxTouchPoints: 5, platform: 'Linux' })).toBe(true)
  })

  it('records where there is no recogniser at all, and has no ears without MediaRecorder', () => {
    canRecord()
    expect(serverEars(false, { userAgent: PIXEL, maxTouchPoints: 0, platform: 'Linux' })).toBe(true)
    vi.stubGlobal('MediaRecorder', undefined)
    expect(serverEars(false, { userAgent: IPHONE, maxTouchPoints: 5, platform: 'iPhone' })).toBe(false)
  })
})

// Pavol, 20 Nov (Firefox on his phone): after switching apps and back, the mic "doesn't work
// anymore. I then have to refresh the page."
describe('unlockAudioInput: every tap gets audio that is running', () => {
  class Ctx {
    static made: Ctx[] = []
    state = 'running'
    resume = vi.fn(() => Promise.resolve())
    close = vi.fn(() => Promise.resolve())
    constructor() {
      Ctx.made.push(this)
    }
  }
  it('keeps one context while it runs, and makes a new one in the tap when it was suspended, interrupted or closed', () => {
    Ctx.made = []
    resetAudioInput()
    vi.stubGlobal('AudioContext', Ctx)
    const first = unlockAudioInput()
    expect(unlockAudioInput()).toBe(first)
    expect(Ctx.made).toHaveLength(1)
    for (const state of ['suspended', 'interrupted', 'closed']) {
      const old = Ctx.made.at(-1)!
      old.state = state
      const next = unlockAudioInput() as unknown as Ctx
      expect(next).not.toBe(old)
      expect(next.state).toBe('running')
      if (state !== 'closed') expect(old.close).toHaveBeenCalled()
      expect(next.resume).toHaveBeenCalled()
    }
    expect(Ctx.made).toHaveLength(4)
    vi.unstubAllGlobals()
    resetAudioInput()
  })

  // Review of PR #40: a context made outside a real tap stays suspended on WebKit, and closing
  // the old one first leaves nothing that could come back.
  it('outside a tap it keeps the suspended context and asks it to resume; in a tap the old one is closed only once the new one runs', () => {
    Ctx.made = []
    resetAudioInput()
    vi.stubGlobal('AudioContext', Ctx)
    const activation = { isActive: false }
    vi.stubGlobal('navigator', { ...navigator, userActivation: activation })
    const first = unlockAudioInput() as unknown as Ctx
    first.state = 'suspended'
    first.resume.mockClear()
    expect(unlockAudioInput()).toBe(first) // Talk opening the mic without a tap
    expect(first.resume).toHaveBeenCalled()
    expect(first.close).not.toHaveBeenCalled()

    activation.isActive = true
    class Slow extends Ctx {
      state = 'suspended'
      listeners: (() => void)[] = []
      addEventListener = (_: string, f: () => void) => void this.listeners.push(f)
      removeEventListener = () => {}
    }
    vi.stubGlobal('AudioContext', Slow)
    const next = unlockAudioInput() as unknown as Slow
    expect(next).not.toBe(first)
    expect(first.close).not.toHaveBeenCalled() // the new one is not confirmed running yet
    next.state = 'running'
    next.listeners.forEach((f) => f())
    expect(first.close).toHaveBeenCalled()
    vi.unstubAllGlobals()
    resetAudioInput()
  })
})

describe('transcribe', () => {
  it('posts the clip as it is, with the beta key, and returns the words', async () => {
    localStorage.setItem('council:key', 'tallow-candle')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: ' the constraint is time ' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const clip = new Blob(['aac'], { type: 'audio/mp4' })
    expect(await transcribe(clip)).toBe('the constraint is time')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://gw.test/v1/stt')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(clip)
    expect((init.headers as Record<string, string>)['content-type']).toBe('audio/mp4')
    expect((init.headers as Record<string, string>)['x-council-key']).toBe('tallow-candle')
    expect(init.credentials).toBe('include')
  })

  it('signed in with no key, sends the bearer and no key', async () => {
    const { setBearer } = await import('./key')
    setBearer('jwt')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: 'hi' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await transcribe(new Blob(['aac'], { type: 'audio/mp4' }))
    const headers = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer jwt')
    expect(headers['x-council-key']).toBeUndefined()
    setBearer(null)
  })

  it('names why it failed, so the mic can say what to do instead', async () => {
    const cases: [Response | Error, string][] = [
      [new Response(JSON.stringify({ reason: 'password' }), { status: 401 }), 'password'],
      [new Response(JSON.stringify({ reason: 'stt' }), { status: 429 }), 'quota'],
      [new Response(JSON.stringify({ reason: 'cap' }), { status: 503 }), 'cap'],
      [new Response(JSON.stringify({ error: 'too_large' }), { status: 413 }), 'too_large'],
      [new Response('not found', { status: 404 }), 'unavailable'],
      [new TypeError('Failed to fetch'), 'network'],
    ]
    for (const [answer, reason] of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => (answer instanceof Error ? Promise.reject(answer) : answer)))
      const err = await transcribe(new Blob(['x'], { type: 'audio/webm' })).catch((e) => e)
      expect(err).toBeInstanceOf(SttError)
      expect((err as SttError).reason).toBe(reason)
    }
  })
})
