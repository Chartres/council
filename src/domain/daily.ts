import { DAILY_QUESTIONS } from '@/content/dailyQuestions'
import { voteSplit, type Verdict } from './council'

// The daily question is a pure function of the calendar date, so every visitor on
// 2026-10-07 gets the same one with no server and no storage.

/** `YYYY-MM-DD` in the visitor's own timezone (the date on their wall). */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Days since the Unix epoch for a `YYYY-MM-DD` key — no DST drift, no clock time. */
export function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

export function dailyQuestion(key: string = todayKey()): string {
  const i = ((dayIndex(key) % DAILY_QUESTIONS.length) + DAILY_QUESTIONS.length) %
    DAILY_QUESTIONS.length
  return DAILY_QUESTIONS[i]
}

/**
 * The shareable card. Carries the date, the question and the council's split —
 * never the user's own text, never the verdict prose.
 */
export function dailyShareText(key: string, question: string, verdict: Verdict): string {
  const split = voteSplit(verdict.votes)
  const bars =
    '◆'.repeat(split.for) + '◈'.repeat(split.mixed) + '◇'.repeat(split.against)
  return [
    `Mastermind Council · ${key}`,
    question,
    '',
    `${bars}  ${split.for} for · ${split.mixed} mixed · ${split.against} against`,
    '',
    'council.dravec.org',
  ].join('\n')
}

/** navigator.share where it exists, clipboard otherwise. Returns how it went. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch {
      // Cancelled or unsupported payload — fall through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
