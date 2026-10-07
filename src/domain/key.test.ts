import { describe, expect, it } from 'vitest'
import { gateState, KEY_STORAGE, loadKey, saveKey } from './key'

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

  it('leaves every other failure to the session screen', () => {
    for (const failure of ['sign_in', 'quota', 'cap', 'gateway'] as const) {
      expect(gateState('tallow-candle', failure)).toBe('ready')
    }
  })
})
