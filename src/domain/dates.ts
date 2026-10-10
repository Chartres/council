/** "2026-10-17" (or a full timestamp) → "Saturday 17 October"; the year only when it is not this year. */
export function humanDate(iso: string, now = new Date()): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const text = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return y === now.getFullYear() ? text : `${text} ${y}`
}
