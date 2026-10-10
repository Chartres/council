import { useEffect, useRef, useState } from 'react'
import { personaMonogram, personaName } from '@/content/personas'
import { wrapLabel } from '@/domain/map'
import type { CouncilMap as CMap, MapEdge, MapNode } from '@/domain/mastermind'

// The council map (flywheel/docs/expansion/council-v4.2.md): question on top, the claims
// stacked under it, the proposal, its assumptions, the action last. Sizes are viewBox
// units on a canvas at least 360 wide (wider containers get a wider canvas, 1 unit = 1 px);
// the card is ~318 px wide at 390, so 15 units ≈ 13 px — nothing here is set smaller.
//
// ponytail: claims stack one per row, not side by side: four claims in a row leave ~6
// characters per line at 13 px. Edges live in a left gutter — one spine, a stub into each
// node — so no line ever crosses text.

const SPINE = 8
const X = 24 // nodes start after the gutter and run to the right edge
const GAP = 24
const ROW = 8
const SANS_LH = 20
const CH = 8.2 // average Inter advance at 15 units, rounded up
const TITLE_LH = 26

type Box = { node: MapNode; x: number; y: number; w: number; h: number; lines: string[] }

const fits = (width: number, perChar: number) => Math.floor(width / perChar)
const mid = (b: Box) => b.y + b.h / 2

function layout(map: CMap, W: number) {
  const NW = W - X
  const of = (k: MapNode['kind']) => map.nodes.filter((n) => n.kind === k)
  const [questions, claims, proposals, assumptions, actions] = (
    ['question', 'claim', 'proposal', 'assumption', 'action'] as const
  ).map(of)
  const boxes: Box[] = []
  let y = 0
  const place = (nodes: MapNode[], chars: (n: MapNode) => number, height: (lines: number) => number, gap: number) => {
    for (const node of nodes) {
      const lines = wrapLabel(node.label, chars(node))
      const h = height(lines.length)
      // An unlinked question is a heading: it sits flush left, not in the node column.
      const x = node.kind === 'question' && !map.edges.some((e) => e.from === node.id || e.to === node.id) ? 0 : X
      boxes.push({ node, x, y, w: W - x, h, lines })
      y += h + gap
    }
    if (nodes.length) y += GAP - gap
  }
  place(questions, () => fits(NW, 9.8), (n) => n * TITLE_LH, GAP)
  place(claims, (n) => fits(NW - 24 - (n.speaker ? 42 : 0), CH), (n) => Math.max(52, n * SANS_LH + 20), ROW)
  place(proposals, () => fits(NW - 28, 9.8), (n) => n * TITLE_LH + 24, GAP)
  place(assumptions, () => fits(NW - 28, CH), (n) => n * SANS_LH + 12, ROW)
  place(actions, () => fits(NW - 30, 9.8), (n) => n * TITLE_LH + 24, GAP)
  return { boxes, height: y - GAP }
}

/**
 * One path per edge: a stub from the spine into each end that is not the proposal (the
 * proposal is the hub the spine already reaches); `leads_to` also lights the spine between
 * its two ends.
 */
function route(e: MapEdge, at: (id: string) => Box | undefined): string {
  const ends = [at(e.from)!, at(e.to)!]
  const hub = ends.find((b) => b.node.kind === 'proposal')
  const stubs = ends.filter((b) => b !== hub).map((b) => `M${SPINE} ${mid(b)} H${b.x}`)
  if (e.kind === 'leads_to') stubs.unshift(`M${SPINE} ${mid(ends[0])} V${mid(ends[1])}`)
  return stubs.join(' ')
}

const STROKE: Record<MapEdge['kind'], { className: string; width: number; dash?: string }> = {
  supports: { className: 'stroke-marble-500', width: 1.5 },
  challenges: { className: 'stroke-clay-400', width: 1.5, dash: '4 3' },
  leads_to: { className: 'stroke-candle-400', width: 2 },
  rests_on: { className: 'stroke-marble-500', width: 1.5, dash: '0.1 4' },
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
      return <Lines lines={lines} x={x} y={y + 19} lh={TITLE_LH} className="fill-marble-200 font-display text-[22px] font-medium" />
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
          <Lines lines={lines} x={x + 14} y={y + 31} lh={TITLE_LH} className="fill-marble-50 font-display text-[22px] font-medium" />
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
          <rect x={x} y={y} width={w} height={h} rx={4} className="fill-ink-850" />
          <rect x={x} y={y} width={2} height={h} className="fill-candle-400" />
          <Lines lines={lines} x={x + 16} y={y + 31} lh={TITLE_LH} className="fill-marble-50 font-display text-[22px] font-medium" />
        </>
      )
  }
}

export function CouncilMap({ map }: { map: CMap }) {
  const ref = useRef<SVGSVGElement>(null)
  const [W, setW] = useState(360)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.max(360, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { boxes, height } = layout(map, W)
  const at = (id: string) => boxes.find((b) => b.node.id === id)
  const edges = map.edges.filter((e) => at(e.from) && at(e.to) && e.from !== e.to)
  const kinds = [...new Set(edges.map((e) => e.kind))]
  const linked = boxes.filter((b) => edges.some((e) => e.from === b.node.id || e.to === b.node.id))
  const hubs = linked.filter((b) => b.node.kind === 'proposal')
  const spine =
    linked.length > 1
      ? [`M${SPINE} ${mid(linked[0])} V${mid(linked[linked.length - 1])}`, ...hubs.map((b) => `M${SPINE} ${mid(b)} H${b.x}`)].join(' ')
      : ''

  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        role="img"
        aria-label={describe({ nodes: map.nodes, edges })}
        data-testid="council-map"
        className="block"
      >
        {spine && <path d={spine} className="stroke-ink-500" strokeWidth={1.5} fill="none" />}
        {edges.map((e, i) => {
          const s = STROKE[e.kind]
          return (
            <path
              key={i}
              d={route(e, at)}
              data-kind={e.kind}
              className={`map-edge ${s.className}`}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              strokeLinecap={e.kind === 'challenges' ? 'butt' : 'round'}
              fill="none"
            />
          )
        })}
        {boxes.map((b) => (
          <g key={b.node.id} className="map-node" data-kind={b.node.kind}>
            <NodeView b={b} />
          </g>
        ))}
      </svg>
      {kinds.length > 0 && (
        <p aria-hidden="true" className="t-label mt-2 flex flex-wrap gap-x-4 normal-case tracking-normal">
          {kinds.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="1" x2="17" y1="4" y2="4" className={STROKE[k].className} strokeWidth={STROKE[k].width} strokeDasharray={STROKE[k].dash} strokeLinecap={k === 'challenges' ? 'butt' : 'round'} />
              </svg>
              {VERB[k]}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
