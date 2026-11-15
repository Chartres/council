import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkKey, doorHeaders, gateState, KEY_STORAGE, loadKey, saveKey, setBearer } from './key'

describe('the council key', () => {
  it('round-trips through localStorage and treats an empty string as missing', () => {
    expect(loadKey()).toBeNull()
    saveKey('tallow-candle')
    expect(localStorage.getItem(KEY_STORAGE)).toBe('tallow-candle')
    expect(loadKey()).toBe('tallow-candle')
    localStorage.setItem(KEY_STORAGE, '')
    expect(loadKey()).toBeNull()
  })
})

describe('gateState', () => {
  it('asks on the first visit', () => {
    expect(gateState(null, null)).toBe('ask')
  })

  it('is ready once a key is stored', () => {
    expect(gateState('tallow-candle', null)).toBe('ready')
  })

  it('asks again when the gateway rejected the stored key', () => {
    expect(gateState('wrong', 'password')).toBe('ask')
  })

  // Eyal, 30 Oct: signed in on a new laptop, the door still asked for the password. The gateway
  // lets a verified Supabase JWT through without x-council-key.
  it('is ready for a signed-in user with no stored key', () => {
    expect(gateState(null, null, true)).toBe('ready')
  })

  it('asks a signed-in user when the gateway refused them (an expired token)', () => {
    expect(gateState(null, 'password', true)).toBe('ask')
  })

  it('leaves every other failure to the session screen', () => {
    for (const failure of ['sign_in', 'quota', 'cap', 'gateway'] as const) {
      expect(gateState('tallow-candle', failure)).toBe('ready')
    }
  })
})

describe('checkKey', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the typed key and reads ok off a 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(checkKey('tallow-candle', 'https://llm.example/')).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/council/key',
      expect.objectContaining({ headers: { 'x-council-key': 'tallow-candle' } }),
    )
  })

  it('reads wrong off a 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    await expect(checkKey('nope', 'https://llm.example')).resolves.toBe('wrong')
  })

  it('reads gateway off any other status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    await expect(checkKey('x', 'https://llm.example')).resolves.toBe('gateway')
  })

  it('reads gateway off a network failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(checkKey('x', 'https://llm.example')).resolves.toBe('gateway')
  })
})

describe('doorHeaders (tts and stt)', () => {
  afterEach(() => {
    setBearer(null)
    localStorage.clear()
  })

  it('sends the bearer when signed in, and no key when none is stored', () => {
    setBearer('jwt')
    expect(doorHeaders()).toEqual({ authorization: 'Bearer jwt' })
  })

  it('sends the stored key, and both when both are there', () => {
    saveKey('tallow-candle')
    expect(doorHeaders()).toEqual({ 'x-council-key': 'tallow-candle' })
    setBearer('jwt')
    expect(doorHeaders()).toEqual({ 'x-council-key': 'tallow-candle', authorization: 'Bearer jwt' })
  })
})
