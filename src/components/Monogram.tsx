import { personaMonogram, personaName } from '@/content/personas'

/**
 * A persona's mark: engraved initials in a thin ring. Deliberately not a portrait —
 * no likenesses, no AI faces (guardrails in the build spec; Montessori especially).
 */
export function Monogram({
  id,
  size = 44,
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
      style={{ width: size, height: size, borderWidth: lit ? 2 : 1.5 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-medium leading-none ${
        lit
          ? 'border-candle-400 bg-[color-mix(in_srgb,var(--color-candle-400)_10%,var(--color-ink-950))] text-candle-200'
          : 'border-marble-500 bg-ink-800 text-marble-100'
      }`}
    >
      <span style={{ fontSize: size * 0.42 }} className="tracking-tight">
        {personaMonogram(id)}
      </span>
    </span>
  )
}
