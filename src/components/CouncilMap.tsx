import { personaMonogram, personaName } from '@/content/personas'
import { wrapLabel } from '@/domain/map'
import type { CouncilMap as CMap, MapEdge, MapNode } from '@/domain/mastermind'

// The council map (flywheel/docs/expansion/council-v4.2.md): question on top, the claims
// stacked under it, the proposal, its assumptions, the action last. Sizes are viewBox
// units on a 360-wide canvas; the card is ~318 px wide at 390, so 15 units ≈ 13 px —
// nothing here is set smaller.
//
// ponytail: claims stack one per row, not side by side: four claims in a row leave ~6
// characters per line at 13 px. Edges run in lanes beside the nodes so no line crosses text.

const W = 360
const GAP = 24
const ROW = 8
const SANS_LH = 20
const CH = 8.2 // average Inter advance at 15 units, rounded up
const LANE = 14

type Box = { node: MapNode; x: number; y: number; w: number; h: number; lines: string[] }

const fits = (width: number, perChar: number) => Math.floor(width / perChar)

function layout(map: CMap) {
  const of = (k: MapNode['kind']) => map.nodes.filter((n) => n.kind === k)
  const [questions, claims, proposals, assumptions, actions] = (
    ['question', 'claim', 'proposal', 'assumption', 'action'] as const
  ).map(of)
  const qEdges = map.edges.some((e) => [e.from, e.to].some((id) => questions.some((n) => n.id === id)))
  const left = qEdges ? 18 : 0 // gutter for the question's spine
  const lanes = claims.length * LANE + 8 // right-hand lanes, claim → proposal
  const boxes: Box[] = []
  let y = 0

  for (const node of questions) {
    const lines = wrapLabel(node.label, fits(W, 10.8))
    boxes.push({ node, x: 0, y, w: W, h: lines.length * 28 + 4, lines })
    y += lines.length * 28 + 4 + GAP
  }
  for (const node of claims) {
    const w = W - left - lanes
    const disc = node.speaker ? 42 : 0
    const lines = wrapLabel(node.label, fits(w - 24 - disc, CH))
    const h = Math.max(52, lines.length * SANS_LH + 20)
    boxes.push({ node, x: left, y, w, h, lines })
    y += h + ROW
  }
  if (claims.length) y += GAP - ROW
  for (const node of proposals) {
    const lines = wrapLabel(node.label, fits(W - 28, 9.4))
    const h = lines.length * 24 + 26
    boxes.push({ node, x: 0, y, w: W, h, lines })
    y += h + GAP
  }
  for (const node of assumptions) {
    const lines = wrapLabel(node.label, fits(W - 48 - 28, CH))
    const h = lines.length * SANS_LH + 12
    boxes.push({ node, x: 24, y, w: W - 48, h, lines })
    y += h + ROW
  }
  if (assumptions.length) y += GAP - ROW
  for (const node of actions) {
    const lines = wrapLabel(node.label, fits(W - 32, 9.4))
    const h = lines.length * 24 + 24
    boxes.push({ node, x: 0, y, w: W, h, lines })
    y += h + GAP
  }
  return { boxes, height: y, claims, assumptions }
}

/** One path per edge, routed by what it connects so it never runs through a label. */
function route(e: MapEdge, at: (id: string) => Box | undefined, claims: MapNode[], assumptions: MapNode[]): string {
  const a = at(e.from)!
  const b = at(e.to)!
  const [top, low] = a.y <= b.y ? [a, b] : [b, a]
  const kinds = [top.node.kind, low.node.kind].join('>')
  const r = 6
  if (kinds === 'claim>proposal') {
    // Top claim takes the outermost lane, so lanes never cross.
    const x = W - 6 - claims.findIndex((n) => n.id === top.node.id) * LANE
    const y = top.y + top.h / 2
    return `M${top.x + top.w} ${y} H${x - r} Q${x} ${y} ${x} ${y + r} V${low.y}`
  }
  if (kinds === 'question>claim') {
    const y = low.y + low.h / 2
    return `M8 ${top.y + top.h} V${y - r} Q8 ${y} ${8 + r} ${y} H${low.x}`
  }
  if (kinds === 'proposal>assumption') {
    const x = W - 10
    const y = low.y + low.h / 2
    return `M${x} ${top.y + top.h} V${y - r} Q${x} ${y} ${x - r} ${y} H${low.x + low.w}`
  }
  if (kinds === 'proposal>action') {
    const x = assumptions.length ? 10 : W / 2
    return `M${x} ${top.y + top.h} V${low.y}`
  }
  // ponytail: anything off-pattern (claim → claim, …) is a gentle curve between centres; it
  // may cross a label. Route it properly if the model starts emitting such edges.
  const x1 = top.x + top.w / 2
  const x2 = low.x + low.w / 2
  const y1 = top.y + top.h
  const m = (y1 + low.y) / 2
  return `M${x1} ${y1} C${x1} ${m} ${x2} ${m} ${x2} ${low.y}`
}

const STROKE: Record<MapEdge['kind'], { className: string; width: number; dash?: string }> = {
  supports: { className: 'stroke-marble-500', width: 1.5 },
  challenges: { className: 'stroke-clay-400', width: 1.5, dash: '6 4' },
  leads_to: { className: 'stroke-candle-400', width: 2 },
  rests_on: { className: 'stroke-marble-500', width: 1.5, dash: '1 4' },
}
const VERB: Record<MapEdge['kind'], string> = {
  supports: 'supports',
  challenges: 'challenges',
  leads_to: 'leads to',
  rests_on: 'rests on',
}

const who = (n: MapNode) =>
  n.kind === 'claim' ? (n.speaker ? personaName(n.speaker) : `“${n.label}”`) : n.kind === 'assumption' ? `the assumption “${n.label}”` : `the ${n.kind}`

/** The whole map as sentences, for screen readers. */
function describe(map: CMap): string {
  const node = (k: MapNode['kind'], lead: string) =>
    map.nodes.filter((n) => n.kind === k).map((n) => `${lead}${n.speaker ? `${personaName(n.speaker)}: ` : ''}${n.label}.`)
  const ids = new Map(map.nodes.map((n) => [n.id, n]))
  return [
    'Council map.',
    ...node('question', 'Question: '),
    ...node('claim', ''),
    ...node('proposal', 'Proposal: '),
    ...node('action', 'Action: '),
    ...map.edges.map((e) => {
      const s = `${who(ids.get(e.from)!)} ${VERB[e.kind]} ${who(ids.get(e.to)!)}.`
      return s.charAt(0).toUpperCase() + s.slice(1)
    }),
  ].join(' ')
}

function Lines({ lines, x, y, lh, className, anchor }: { lines: string[]; x: number; y: number; lh: number; className: string; anchor?: 'middle' }) {
  return (
    <text x={x} y={y} className={className} textAnchor={anchor}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i ? lh : 0}>
          {l}
        </tspan>
      ))}
    </text>
  )
}

function NodeView({ b }: { b: Box }) {
  const { node, x, y, w, h, lines } = b
  switch (node.kind) {
    case 'question':
      return <Lines lines={lines} x={x} y={y + 22} lh={28} className="fill-marble-50 font-display text-[24px] font-medium" />
    case 'claim': {
      const disc = node.speaker ? 42 : 0
      const cy = y + h / 2
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={4} className="fill-ink-850" />
          {node.speaker && (
            <>
              <circle cx={x + 28} cy={cy} r={17} className="fill-ink-800 stroke-marble-500" strokeWidth={1.5} />
              <text x={x + 28} y={cy + 5.5} textAnchor="middle" className="fill-marble-100 font-display text-[16px] font-medium">
                {personaMonogram(node.speaker)}
              </text>
            </>
          )}
          <Lines
            lines={lines}
            x={x + 12 + disc}
            y={cy - ((lines.length - 1) * SANS_LH) / 2 + 5}
            lh={SANS_LH}
            className="fill-marble-200 font-sans text-[15px]"
          />
        </>
      )
    }
    case 'proposal':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={4} className="fill-candle-400" fillOpacity={0.12} />
          <rect x={x} y={y} width={w} height={2} className="fill-candle-400" />
          <Lines lines={lines} x={x + 14} y={y + 30} lh={24} className="fill-marble-50 font-display text-[20px] font-medium" />
        </>
      )
    case 'assumption':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={Math.min(h / 2, 18)} className="fill-ink-850" />
          <Lines lines={lines} x={x + 14} y={y + 21} lh={SANS_LH} className="fill-marble-300 font-sans text-[15px] font-medium" />
        </>
      )
    case 'action':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={4} className="fill-candle-400" />
          <Lines lines={lines} x={x + 16} y={y + 29} lh={24} className="fill-ink-950 font-display text-[19px] font-semibold" />
        </>
      )
  }
}

export function CouncilMap({ map }: { map: CMap }) {
  const { boxes, height, claims, assumptions } = layout(map)
  const at = (id: string) => boxes.find((b) => b.node.id === id)
  const edges = map.edges.filter((e) => at(e.from) && at(e.to) && e.from !== e.to)
  const kinds = [...new Set(edges.map((e) => e.kind))]
  const rows = Math.ceil(kinds.length / 2)
  const H = rows ? height + rows * 24 - 4 : height - GAP

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={describe({ nodes: map.nodes, edges })}
      data-testid="council-map"
      className="block max-w-[400px]"
    >
      {edges.map((e, i) => {
        const s = STROKE[e.kind]
        return (
          <path
            key={i}
            d={route(e, at, claims, assumptions)}
            data-kind={e.kind}
            className={`map-edge ${s.className}`}
            strokeWidth={s.width}
            strokeDasharray={s.dash}
            strokeLinecap="round"
            fill="none"
          />
        )
      })}
      {boxes.map((b) => (
        <g key={b.node.id} className="map-node" data-kind={b.node.kind}>
          <NodeView b={b} />
        </g>
      ))}
      {kinds.map((k, i) => {
        const x = (i % 2) * 180
        const y = height + Math.floor(i / 2) * 24 + 10
        const s = STROKE[k]
        return (
          <g key={k} aria-hidden="true">
            <line x1={x} x2={x + 28} y1={y} y2={y} className={s.className} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" />
            <text x={x + 38} y={y + 5} className="fill-marble-400 font-sans text-[15px]">
              {VERB[k]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
