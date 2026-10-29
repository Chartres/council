import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAppleMobile, markBrowserEngineBroken, resetEars, serverEars, SttError, transcribe } from './stt'

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

  it('keeps the browser recogniser where it works, until it fails once this visit', () => {
    canRecord()
    const pixel = { userAgent: PIXEL, maxTouchPoints: 5, platform: 'Linux' }
    expect(serverEars(true, pixel)).toBe(false)
    markBrowserEngineBroken()
    expect(serverEars(true, pixel)).toBe(true)
  })

  it('records where there is no recogniser at all, and has no ears without MediaRecorder', () => {
    canRecord()
    expect(serverEars(false, { userAgent: PIXEL, maxTouchPoints: 0, platform: 'Linux' })).toBe(true)
    vi.stubGlobal('MediaRecorder', undefined)
    expect(serverEars(false, { userAgent: IPHONE, maxTouchPoints: 5, platform: 'iPhone' })).toBe(false)
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
