import type { Item, JournalEntry } from './mastermind'

// The decision record read as a scholastic quaestio (docs/SIGNATURE.md): the question, the
// objections an adviser actually raised (the map's `challenges` edges), one verified line on
// the contrary, the answer, and what still has to hold.

export interface Quaestio {
  question: string | null
  /** Null when the entry has no map (saved before v4.2): unknown, not "none". */
  objections: { speaker?: string; text: string }[] | null
  answer: string
  mustHold: string[]
}

export function quaestio(e: JournalEntry): Quaestio {
  const nodes = new Map((e.map?.nodes ?? []).map((n) => [n.id, n]))
  const challenges = (e.map?.edges ?? []).filter((edge) => edge.kind === 'challenges')
  // A claim that challenges a challenger is a rebuttal, on the decision's side.
  const challengers = new Set(challenges.map((edge) => edge.from))
  const seen = new Set<string>()
  const objections = challenges.flatMap((edge) => {
    const n = nodes.get(edge.from)
    if (!n || n.kind !== 'claim' || challengers.has(edge.to) || seen.has(n.id)) return []
    seen.add(n.id)
    return [n.speaker ? { speaker: n.speaker, text: n.label } : { text: n.label }]
  })
  return {
    question: e.map?.nodes.find((n) => n.kind === 'question')?.label ?? null,
    objections: e.map ? objections : null,
    answer: e.reasoning,
    mustHold: e.assumptions,
  }
}

// Same shape the gateway checks (flywheel gateway/src/verify.ts QUOTE_RE): curly or straight
// double quotes around at least 25 characters.
const QUOTE_RE = /[“]([^“”]{25,}?)[”]|"([^"]{25,}?)"/g

/**
 * "On the contrary": the latest quote said before the proposal, by an adviser who did not object,
 * that the gateway verified against the thinker's text. Only a contribution with exactly one quote, verified, and a named source is
 * used, so the line and its source cannot be mismatched.
 */
export function verifiedLine(
  items: Item[],
  { before = items.length, exclude = [] }: { before?: number; exclude?: string[] } = {},
): { speaker: string; text: string; source: string } | null {
  for (let i = Math.min(before, items.length) - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind !== 'contribution' || exclude.includes(it.speaker)) continue
    const g = it.grounding as { quotes?: number; verified?: number; sources?: string[] } | undefined
    if (!g || g.quotes !== 1 || g.verified !== 1 || !g.sources?.length) continue
    const spans = [...it.text.matchAll(QUOTE_RE)].map((m) => m[1] ?? m[2] ?? '')
    if (spans.length !== 1) continue
    return { speaker: it.speaker, text: spans[0].trim(), source: g.sources[0] }
  }
  return null
}
