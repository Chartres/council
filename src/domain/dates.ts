/**
 * "2026-10-17" (or a full timestamp) → "Saturday 17 October"; the year only when it is not this year.
 * `weekday: false` → "17 October", for a metadata line.
 */
export function humanDate(iso: string, { weekday = true, now = new Date() } = {}): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const text = new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: weekday ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
  })
  return y === now.getFullYear() ? text : `${text} ${y}`
}
