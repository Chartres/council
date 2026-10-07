import { describe, expect, it } from 'vitest'
import { DAILY_QUESTIONS } from '@/content/dailyQuestions'
import { dailyQuestion, dailyShareText, dayIndex, todayKey } from './daily'

describe('dailyQuestion', () => {
  it('is the same for everyone on the same date and changes the next day', () => {
    expect(dailyQuestion('2026-10-07')).toBe(dailyQuestion('2026-10-07'))
    expect(dailyQuestion('2026-10-07')).not.toBe(dailyQuestion('2026-10-08'))
  })

  it('walks the whole list over 30 consecutive days', () => {
    const seen = new Set(
      Array.from({ length: DAILY_QUESTIONS.length }, (_, i) =>
        dailyQuestion(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)),
      ),
    )
    expect(seen.size).toBe(DAILY_QUESTIONS.length)
  })

  it('indexes by calendar day, not by clock time', () => {
    expect(dayIndex('1970-01-01')).toBe(0)
    expect(dayIndex('1970-01-02')).toBe(1)
    expect(todayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('dailyShareText', () => {
  const verdict = {
    summary: 'The council leans yes, with a cheap test first.',
    next_action: 'Write the one page and show it to three people.',
    votes: { socrates: 'mixed', seneca: 'for', 'marcus-aurelius': 'against' } as const,
  }

  it('carries the date, the question and the split', () => {
    const text = dailyShareText('2026-10-07', 'Should I quit?', verdict)
    expect(text).toContain('2026-10-07')
    expect(text).toContain('Should I quit?')
    expect(text).toContain('1 for · 1 mixed · 1 against')
    expect(text).toContain('council.dravec.org')
  })

  it('never leaks the verdict prose or the next action', () => {
    const text = dailyShareText('2026-10-07', 'Should I quit?', verdict)
    expect(text).not.toContain(verdict.summary)
    expect(text).not.toContain(verdict.next_action)
  })
})
