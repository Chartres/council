import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_EVENING, EVENING_STORAGE, eveningOf, isEvening, readEvening, writeEvening } from './evening'

describe('evening hour', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 17:30, including for anyone who never set it', () => {
    expect(DEFAULT_EVENING).toBe('17:30')
    expect(readEvening()).toBe('17:30')
  })

  it('keeps what was set, and falls back on anything unreadable', () => {
    writeEvening('20:15')
    expect(localStorage.getItem(EVENING_STORAGE)).toBe('20:15')
    expect(readEvening()).toBe('20:15')
    for (const bad of ['', '7:30', '24:00', '17:60', 'evening']) expect(eveningOf(bad)).toBe('17:30')
  })

  it('opens from that minute on', () => {
    const at = (h: number, m: number) => new Date(2026, 9, 30, h, m)
    expect(isEvening(at(17, 29), '17:30')).toBe(false)
    expect(isEvening(at(17, 30), '17:30')).toBe(true)
    expect(isEvening(at(23, 59), '17:30')).toBe(true)
    expect(isEvening(at(20, 0), '21:00')).toBe(false)
    expect(isEvening(at(6, 0), '05:45')).toBe(true)
  })
})

describe('evening hour storage', () => {
  it('does not store a half-typed value, and survives storage that throws', () => {
    localStorage.clear()
    expect(writeEvening('1')).toBe(false)
    expect(localStorage.getItem(EVENING_STORAGE)).toBeNull()
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage
    expect(readEvening(broken)).toBe('17:30')
    expect(writeEvening('19:00', broken)).toBe(true)
  })
})
