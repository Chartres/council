import { personaMonogram, personaName } from '@/content/personas'

/**
 * A persona's mark: engraved initials in a thin ring. Deliberately not a portrait —
 * no likenesses, no AI faces (guardrails in the build spec; Montessori especially).
 */
export function Monogram({
  id,
  size = 40,
  lit = false,
}: {
  id: string
  size?: number
  lit?: boolean
}) {
  return (
    <span
      role="img"
      aria-label={personaName(id)}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border font-display leading-none ${
        lit
          ? 'border-candle-400/70 bg-candle-400/10 text-candle-200'
          : 'border-ink-600 bg-ink-850 text-marble-300'
      }`}
    >
      <span style={{ fontSize: size * 0.4 }} className="tracking-tight">
        {personaMonogram(id)}
      </span>
    </span>
  )
}
