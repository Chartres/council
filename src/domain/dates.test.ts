import { describe, expect, it } from 'vitest'
import { humanDate } from './dates'

const now = new Date(2026, 9, 10)

describe('humanDate', () => {
  it('writes a date like a person: weekday, day, month', () => {
    expect(humanDate('2026-10-17', now)).toBe('Saturday 17 October')
  })

  it('reads a full timestamp by its calendar day', () => {
    expect(humanDate('2026-10-01T09:00:00.000Z', now)).toBe('Thursday 1 October')
  })

  it('adds the year only when it is not this year', () => {
    expect(humanDate('2027-01-04', now)).toBe('Monday 4 January 2027')
  })
})
