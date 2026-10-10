// Council v4 — the facilitated, remembered, accountable flow
// (flywheel/docs/expansion/council-v4.md "Flow (gateway contract)"):
//   POST /v1/council/start   { roster, advisers[], intake?, memory? }  → SSE
//   POST /v1/council/turn    { session_id, message }                   → SSE
//   POST /v1/council/control { session_id, command }                   → SSE
//   POST /v1/council/capture { session_id, proposal_id? | text? }      → { entry }
//   POST /v1/council/commit  { session_id, entry_id, due_date, remind, id, what } → { commitment }
//   GET  /v1/council/journal                                           → { entries, commitments }
// SSE events (all three streams):
//   {type:"session", session_id, tier?, model?}
//   {type:"facilitator", text}
//   {type:"contribution", speaker, text, confidence?, grounding?}
//   {type:"floor", question}
//   {type:"proposal", id, decision, reasoning, assumptions[], next_action, owner, review_trigger, confidence, map}
//   {type:"done", usage?} · {type:"error", reason}
// Same headers, private-beta key and failure bodies as v3 (council.ts).

import { toMermaid } from './map'
import { stream, callJson, type StreamOptions, type Tier } from './council'
import type { RosterId } from '@/content/personas'

// ---------- types ----------

/** The council map (council-v4.2.md): ≤10 nodes, ≤14 edges, labels ≤60 chars (gateway `cleanMap`). */
export interface MapNode {
  id: string
  kind: 'question' | 'claim' | 'proposal' | 'action' | 'assumption'
  label: string
  speaker?: string
}
export interface MapEdge {
  from: string
  to: string
  kind: 'supports' | 'challenges' | 'leads_to' | 'rests_on'
}
export interface CouncilMap {
  nodes: MapNode[]
  edges: MapEdge[]
}

export interface JournalEntry {
  id: string
  session_id?: string | null
  decision: string
  reasoning: string
  assumptions: string[]
  next_action: string
  owner: string
  review_trigger: string
  /** 0–100, or null when the group gave none. */
  confidence: number | null
  /** Null when the group gave none; absent on entries saved before v4.2. */
  map: CouncilMap | null
  status: 'proposal' | 'accepted' | 'done' | 'dropped'
  created_at: string
}

export type Outcome = 'done' | 'later' | 'drop'

export interface Commitment {
  id: string
  journal_id: string
  what: string
  /** YYYY-MM-DD */
  due_date: string
  remind: boolean
  outcome: Outcome | null
  outcome_at?: string | null
}

export type Intake = Partial<Record<IntakeId, string>>

export interface Memory {
  entries: Pick<JournalEntry, 'decision' | 'next_action' | 'status' | 'created_at'>[]
  commitments: Pick<Commitment, 'id' | 'what' | 'due_date' | 'outcome'>[]
}

export type MastermindEvent =
  | { type: 'session'; session_id: string; tier?: Tier; model?: string }
  | { type: 'facilitator'; text: string }
  | { type: 'contribution'; speaker: string; text: string; confidence?: number; grounding?: unknown }
  | { type: 'floor'; question: string }
  | ({ type: 'proposal' } & Omit<JournalEntry, 'status' | 'created_at' | 'session_id'>)
  | { type: 'done'; usage?: { cost_cents?: number } }
  | { type: 'error'; reason: string }

// ---------- intake ----------

// Keys are the gateway's (`gateway/src/v4.ts` INTAKE_QUESTIONS); unknown keys are dropped there.
export const INTAKE_QUESTIONS = [
  { id: 'role', label: 'Role', q: 'Who are you professionally?', hint: 'Your role and relevant experience.' },
  {
    id: 'organization',
    label: 'Organization',
    q: 'Where do you work?',
    hint: "Your industry, who you serve, and your scope of responsibility. No company or people's names needed.",
  },
  { id: 'goal', label: 'Goal', q: 'What would you like the group to help you achieve?', hint: 'The question, opportunity or decision.' },
  { id: 'situation', label: 'Situation', q: 'What is happening today?', hint: 'Background, what you have tried, evidence.' },
  { id: 'success', label: 'Success', q: 'What would a successful outcome look like?', hint: 'The change you want and your time horizon.' },
  { id: 'constraints', label: 'Constraints', q: 'What constraints should the group understand?', hint: 'Authority, budget, dependencies, limits.' },
  {
    id: 'working_style',
    label: 'Working style',
    q: 'How would you like the group to work with you?',
    hint: 'Explore, challenge, shape a solution, design an experiment.',
  },
] as const

export type IntakeId = (typeof INTAKE_QUESTIONS)[number]['id']

/** The gateway rejects the whole intake when one field is longer (MAX_FIELD). */
export const MAX_FIELD = 1000

/** What goes on the wire: trimmed, capped, blanks dropped; undefined when nothing was answered. */
export function intakePayload(answers: Intake): Intake | undefined {
  const out: Intake = {}
  for (const { id } of INTAKE_QUESTIONS) {
    const v = answers[id]?.trim().slice(0, MAX_FIELD)
    if (v) out[id] = v
  }
  return Object.keys(out).length ? out : undefined
}

// v4 stored these under its own keys; old Supabase rows still carry them.
const LEGACY: Record<string, IntakeId> = { workplace: 'organization', mode: 'working_style' }
const STABLE: IntakeId[] = ['role', 'organization', 'working_style']

/** The fields that do not change between sessions, prefilled from the last intake. */
export function stableIntake(last: Record<string, string | undefined> | null): Intake {
  const out: Intake = {}
  for (const [k, v] of Object.entries(last ?? {})) {
    const id = (LEGACY[k] ?? k) as IntakeId
    if (STABLE.includes(id) && v) out[id] = v
  }
  return out
}

// ---------- controls ----------

export type Control =
  | { kind: 'pause' }
  | { kind: 'back_to'; speaker: string }
  | { kind: 'let'; a: string; b: string }
  | { kind: 'disagree' }
  | { kind: 'concrete' }
  | { kind: 'test' }
  | { kind: 'capture' }
  | { kind: 'wrap_up' }
  | { kind: 'export' }

export type ControlRoute =
  | { route: 'control'; command: string }
  | { route: 'capture' }
  | { route: 'export' }

/**
 * Chip → what the app does. `capture` has its own route (it returns a journal entry,
 * not a stream) and `export` never leaves the browser; every other chip is a
 * `/control` command string from the contract.
 */
export function controlRoute(control: Control): ControlRoute {
  switch (control.kind) {
    case 'capture':
      return { route: 'capture' }
    case 'export':
      return { route: 'export' }
    case 'back_to':
      return { route: 'control', command: `back_to:${control.speaker}` }
    case 'let':
      return { route: 'control', command: `let:${control.a},${control.b}` }
    default:
      return { route: 'control', command: control.kind }
  }
}

// ---------- journal ----------

export interface JournalState {
  entries: JournalEntry[]
  commitments: Commitment[]
}

export type JournalAction =
  | { type: 'load'; state: JournalState }
  | { type: 'accept'; entry: JournalEntry }
  | { type: 'commit'; commitment: Commitment }
  | { type: 'outcome'; id: string; outcome: Outcome; at: string }
  | { type: 'remind'; id: string; remind: boolean }

const ENTRY_STATUS: Record<Outcome, JournalEntry['status']> = {
  done: 'done',
  later: 'accepted',
  drop: 'dropped',
}

export function journalReducer(state: JournalState, action: JournalAction): JournalState {
  switch (action.type) {
    case 'load':
      return action.state
    case 'accept': {
      const entry = { ...action.entry, status: 'accepted' as const }
      return { ...state, entries: [entry, ...state.entries.filter((e) => e.id !== entry.id)] }
    }
    case 'commit':
      return {
        ...state,
        commitments: [action.commitment, ...state.commitments.filter((c) => c.id !== action.commitment.id)],
      }
    case 'remind':
      return {
        ...state,
        commitments: state.commitments.map((c) => (c.id === action.id ? { ...c, remind: action.remind } : c)),
      }
    case 'outcome': {
      const target = state.commitments.find((c) => c.id === action.id)
      if (!target) return state
      return {
        commitments: state.commitments.map((c) =>
          c.id === action.id ? { ...c, outcome: action.outcome, outcome_at: action.at } : c,
        ),
        entries: state.entries.map((e) =>
          e.id === target.journal_id ? { ...e, status: ENTRY_STATUS[action.outcome] } : e,
        ),
      }
    }
  }
}

export const isOpen = (c: Commitment) => c.outcome === null || c.outcome === 'later'

/**
 * The "Last time…" memory sent with /start: the 3 newest non-proposal entries and every
 * open commitment, trimmed to what the facilitator needs. Null when there is nothing.
 */
export function assembleMemory(journal: JournalState): Memory | null {
  const entries = journal.entries
    .filter((e) => e.status !== 'proposal')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3)
    .map(({ decision, next_action, status, created_at }) => ({ decision, next_action, status, created_at }))
  const commitments = journal.commitments
    .filter(isOpen)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map(({ id, what, due_date, outcome }) => ({ id, what, due_date, outcome }))
  return entries.length || commitments.length ? { entries, commitments } : null
}

/** "Export the journal": a compact paste-able text with enough context to resume. */
export function exportJournal(journal: JournalState): string {
  const lines = ['Mastermind Council — journal']
  for (const e of journal.entries.filter((x) => x.status !== 'proposal')) {
    lines.push(
      '',
      `${e.created_at.slice(0, 10)} · ${e.status} · ${e.decision}`,
      `  Why: ${e.reasoning}`,
      ...(e.assumptions.length ? [`  Assumptions: ${e.assumptions.join('; ')}`] : []),
      `  Next: ${e.next_action} (owner: ${e.owner}; review: ${e.review_trigger})`,
      ...(e.confidence !== null ? [`  Confidence: ${e.confidence}/100`] : []),
    )
    for (const c of journal.commitments.filter((x) => x.journal_id === e.id)) {
      lines.push(`  Commitment: ${c.what} by ${c.due_date}${c.outcome ? ` — ${c.outcome}` : ''}`)
    }
    if (e.map) lines.push('```mermaid', toMermaid(e.map), '```')
  }
  return lines.join('\n')
}

/** Gateway output is untrusted shape: coerce what the UI joins, formats or compares. */
export function normalizeEntry<T extends Partial<JournalEntry>>(raw: T): T & Pick<JournalEntry, 'assumptions' | 'confidence' | 'map'> {
  const a = raw.assumptions as unknown
  const c = Number(raw.confidence)
  return {
    ...raw,
    assumptions: Array.isArray(a) ? a.map(String) : a ? [String(a)] : [],
    confidence: raw.confidence === null || raw.confidence === undefined || Number.isNaN(c) ? null : Math.round(c),
    map: Array.isArray(raw.map?.nodes) && Array.isArray(raw.map?.edges) ? raw.map : null,
  }
}

// ---------- deep link (reminder emails) ----------

/** `/c/:commitmentId?outcome=done|later|drop` → what to record; null for anything else. */
export function parseDeepLink(pathname: string, search: string): { id: string; outcome: Outcome | null } | null {
  const m = pathname.match(/^\/c\/([A-Za-z0-9-]{1,64})\/?$/)
  if (!m) return null
  const raw = new URLSearchParams(search).get('outcome')
  const outcome = raw === 'done' || raw === 'later' || raw === 'drop' ? raw : null
  return { id: m[1], outcome }
}

// ---------- gateway ----------

const s = (path: string, body: unknown, opts: StreamOptions) =>
  stream(path, body, opts) as unknown as AsyncGenerator<MastermindEvent>

export const startCouncil = (
  body: { roster: RosterId; advisers: string[]; intake?: Intake; memory?: Memory },
  opts: StreamOptions,
) => s('/v1/council/start', body, opts)

export const sendTurn = (body: { session_id: string; message: string }, opts: StreamOptions) =>
  s('/v1/council/turn', body, opts)

export const sendControl = (body: { session_id: string; command: string }, opts: StreamOptions) =>
  s('/v1/council/control', body, opts)

export const capture = (
  body: { session_id: string; proposal_id?: string; text?: string },
  opts: StreamOptions,
) => callJson<{ entry: Omit<JournalEntry, 'status' | 'created_at'> & { date?: string } }>('/v1/council/capture', body, opts)

export const commit = (
  body: { session_id: string; entry_id: string; due_date: string; remind: boolean; id: string; what: string },
  opts: StreamOptions,
) => callJson<{ commitment: Commitment }>('/v1/council/commit', body, opts)
