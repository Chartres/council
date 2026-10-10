import { personaName } from '@/content/personas'
import type { CouncilMap } from './mastermind'

/** Word-wraps a map label: at most `maxChars` (≤ 28) per line, 3 lines, "…" when it overflows. */
export function wrapLabel(text: string, maxChars = 28): string[] {
  const max = Math.max(4, Math.min(28, maxChars))
  const lines: string[] = []
  let line = ''
  for (let word of text.trim().split(/\s+/).filter(Boolean)) {
    while (word.length > max) {
      // ponytail: hard-cut words longer than a line (URLs); hyphenation if it ever matters.
      if (line) lines.push(line), (line = '')
      lines.push(word.slice(0, max))
      word = word.slice(max)
    }
    if (!line) line = word
    else if (line.length + 1 + word.length <= max) line += ` ${word}`
    else lines.push(line), (line = word)
  }
  if (line) lines.push(line)
  if (lines.length <= 3) return lines
  const last = lines[2].length + 1 <= max ? lines[2] : lines[2].slice(0, max - 1).trimEnd()
  return [lines[0], lines[1], `${last}…`]
}

const q = (s: string) => `"${s.replace(/"/g, '#quot;')}"`
const ARROW = { supports: '-->', leads_to: '==>', challenges: '-. challenges .->', rests_on: '-. rests on .->' }

/** The map as a mermaid flowchart, for the export text (Claude and GitHub render it). */
export function toMermaid(map: CouncilMap): string {
  return [
    'flowchart TB',
    ...map.nodes.map((n) => `  ${n.id}[${q(n.speaker ? `${personaName(n.speaker)}: ${n.label}` : n.label)}]`),
    ...map.edges.map((e) => `  ${e.from} ${ARROW[e.kind]} ${e.to}`),
  ].join('\n')
}
