import { describe, expect, it } from 'vitest'
import { loadTier, saveTier, TIER_STORAGE } from './tier'

describe('the admin tier switch', () => {
  it('defaults to free and round-trips through localStorage', () => {
    expect(loadTier()).toBe('free')
    saveTier('premium')
    expect(localStorage.getItem(TIER_STORAGE)).toBe('premium')
    expect(loadTier()).toBe('premium')
    saveTier('free')
    expect(loadTier()).toBe('free')
  })

  it('treats any stored value other than "premium" as free', () => {
    localStorage.setItem(TIER_STORAGE, 'garbage')
    expect(loadTier()).toBe('free')
  })
})
