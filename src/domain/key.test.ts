import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkAccess, checkKey, doorHeaders, gateState, KEY_STORAGE, loadKey, saveKey, setBearer } from './key'

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

  // Review 15 Nov: a signed-in user with no stored key saw the door flash while auth loaded.
  it('waits, neither door nor screen, while the sign-in is still loading and no key is stored', () => {
    expect(gateState(null, null, false, true)).toBe('wait')
    expect(gateState('tallow-candle', null, false, true)).toBe('ready')
    expect(gateState(null, 'password', false, true)).toBe('ask')
    expect(gateState(null, null, false, false)).toBe('ask')
  })

  // Pavol, 17 Nov: new registrations wait for his approval.
  it('shows the approval door when the gateway says the account is waiting', () => {
    expect(gateState(null, 'approval', true)).toBe('approval')
    expect(gateState('rotated', 'approval', true)).toBe('approval')
  })

  it('keeps a signed-in user with no key on the blank ground while the access probe runs', () => {
    expect(gateState(null, null, true, false, 'checking')).toBe('wait')
    expect(gateState(null, null, true, false, 'ok')).toBe('ready')
    expect(gateState(null, null, true, false, 'approval')).toBe('approval')
    expect(gateState(null, null, true, false, 'password')).toBe('ask')
    // A stored password opens the door whatever the probe says.
    expect(gateState('tallow-candle', null, true, false, 'checking')).toBe('ready')
  })

  it('leaves every other failure to the session screen', () => {
    for (const failure of ['sign_in', 'quota', 'cap', 'gateway'] as const) {
      expect(gateState('tallow-candle', failure)).toBe('ready')
    }
  })
})

describe('checkAccess', () => {
  afterEach(() => vi.unstubAllGlobals())
  const answer = (status: number, body?: unknown) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body ? JSON.stringify(body) : null, { status })))

  it('asks /v1/council/access with the bearer and the stored key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(checkAccess('https://llm.example/', 'tok', 'k')).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/council/access',
      expect.objectContaining({ headers: { authorization: 'Bearer tok', 'x-council-key': 'k' } }),
    )
  })

  it('reads the 401 reason', async () => {
    answer(401, { reason: 'approval' })
    await expect(checkAccess('https://llm.example', 'tok', null)).resolves.toBe('approval')
    answer(401, { reason: 'password' })
    await expect(checkAccess('https://llm.example', 'tok', null)).resolves.toBe('password')
  })

  it('lets the user in on anything else, so an older gateway (404) or a blip does not lock them out', async () => {
    answer(404, { error: 'not_found' })
    await expect(checkAccess('https://llm.example', 'tok', null)).resolves.toBe('ok')
    answer(503, { reason: 'cap' })
    await expect(checkAccess('https://llm.example', 'tok', null)).resolves.toBe('ok')
    answer(500)
    await expect(checkAccess('https://llm.example', 'tok', null)).resolves.toBe('ok')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(checkAccess('https://llm.example', 'tok', null)).resolves.toBe('ok')
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
