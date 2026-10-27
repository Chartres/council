import type { Item, JournalEntry } from './mastermind'

// The decision record read as a scholastic quaestio (docs/SIGNATURE.md): the question, the
// objections an adviser actually raised (the map's `challenges` edges), one verified line on
// the contrary, the answer, and what still has to hold.

export interface Quaestio {
  question: string | null
  objections: { speaker?: string; text: string }[]
  answer: string
  mustHold: string[]
}

export function quaestio(e: JournalEntry): Quaestio {
  const nodes = new Map((e.map?.nodes ?? []).map((n) => [n.id, n]))
  const seen = new Set<string>()
  const objections = (e.map?.edges ?? []).flatMap((edge) => {
    const n = nodes.get(edge.from)
    if (edge.kind !== 'challenges' || !n || seen.has(n.id)) return []
    seen.add(n.id)
    return [n.speaker ? { speaker: n.speaker, text: n.label } : { text: n.label }]
  })
  return {
    question: e.map?.nodes.find((n) => n.kind === 'question')?.label ?? null,
    objections,
    answer: e.reasoning,
    mustHold: e.assumptions,
  }
}

// Same shape the gateway checks (flywheel gateway/src/verify.ts QUOTE_RE): curly or straight
// double quotes around at least 25 characters.
const QUOTE_RE = /[“]([^“”]{25,}?)[”]|"([^"]{25,}?)"/g

/**
 * "On the contrary": the latest quote from the session that the gateway verified against the
 * thinker's text. Only a contribution with exactly one quote, verified, and a named source is
 * used, so the line and its source cannot be mismatched.
 */
export function verifiedLine(items: Item[]): { speaker: string; text: string; source: string } | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind !== 'contribution') continue
    const g = it.grounding as { quotes?: number; verified?: number; sources?: string[] } | undefined
    if (!g || g.quotes !== 1 || g.verified !== 1 || !g.sources?.length) continue
    const spans = [...it.text.matchAll(QUOTE_RE)].map((m) => m[1] ?? m[2] ?? '')
    if (spans.length !== 1) continue
    return { speaker: it.speaker, text: spans[0].trim(), source: g.sources[0] }
  }
  return null
}
