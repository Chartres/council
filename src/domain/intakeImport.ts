// "Bring what you have": pasted text, a dropped file, or a URL, turned into intake fields.
// A reply that uses our headings parses here with no network call; other text and files go
// to the gateway (POST /v1/intake/extract, JSON {text} or multipart {file}). URLs are never
// fetched (SSRF surface on the gateway, and LinkedIn blocks it anyway).

import { gatewayHeaders, type StreamOptions } from './council'
import { INTAKE_QUESTIONS, MAX_FIELD, type Intake, type IntakeId } from './mastermind'

export const LINKEDIN_HINT =
  'LinkedIn blocks apps from reading profiles. On your profile: More → Save to PDF, then drop the file here.'
export const URL_HINT = 'Paste the text of the page, or drop a file.'

const heading = (id: string) => id.toUpperCase()

export const AI_PROMPT = [
  'From what you know about me, fill in these seven headings for an advisory session.',
  'Write UNKNOWN rather than guessing. Keep each under 1,000 characters. Describe companies and people in general terms, no names.',
  '',
  ...INTAKE_QUESTIONS.map((q) => `${heading(q.id)}: ${q.q}`),
].join('\n')

// `**Goal:**`, `## ROLE:`, `- working style:` all count as a heading line.
const KEY = INTAKE_QUESTIONS.map((q) => q.id.replace('_', '[_ ]')).join('|')
const HEADING = new RegExp(`^[\\s#>*-]*(${KEY})[\\s*]*:[\\s*]*(.*)$`, 'i')

const clean = (v: string) => {
  const t = v.trim()
  return /^unknown\.?$/i.test(t) ? '' : t.slice(0, MAX_FIELD)
}

/** Text that follows our headings (two or more) → fields; anything else → null. */
export function parseHeadings(text: string): Intake | null {
  const found: Partial<Record<IntakeId, string[]>> = {}
  let current: IntakeId | null = null
  let count = 0
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(HEADING)
    if (m) {
      current = m[1].toLowerCase().replace(' ', '_') as IntakeId
      found[current] = [m[2]]
      count++
    } else if (current) found[current]!.push(line)
  }
  if (count < 2) return null
  const out: Intake = {}
  for (const [id, lines] of Object.entries(found)) {
    const v = clean(lines!.join('\n'))
    if (v) out[id as IntakeId] = v
  }
  return out
}

export type Classified =
  | { kind: 'empty' }
  | { kind: 'hint'; message: string }
  | { kind: 'parsed'; intake: Intake }
  | { kind: 'extract'; text: string }

const BARE_URL = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i

export function classifyInput(raw: string): Classified {
  const text = raw.trim()
  if (!text) return { kind: 'empty' }
  if (BARE_URL.test(text)) {
    const host = text.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()
    return { kind: 'hint', message: host === 'linkedin.com' || host.endsWith('.linkedin.com') ? LINKEDIN_HINT : URL_HINT }
  }
  const intake = parseHeadings(text)
  return intake ? { kind: 'parsed', intake } : { kind: 'extract', text }
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Null when the gateway can take it; otherwise what to tell the user. */
export function fileProblem(file: { name: string; size: number }): string | null {
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) return 'Drop a PDF, DOCX or TXT file.'
  if (file.size > MAX_FILE_BYTES) return 'That file is over 5 MB. Try a shorter one, or paste the text.'
  return null
}

export type ExtractCode = 'quota' | 'no_converter' | 'password' | 'gateway'

export class ExtractError extends Error {
  constructor(readonly code: ExtractCode) {
    super(code)
    this.name = 'ExtractError'
  }
}

export const EXTRACT_COPY: Record<ExtractCode, string> = {
  quota: 'That is enough reading for today. Fill the fields below, or try again tomorrow.',
  no_converter: 'This file cannot be read yet. Paste the text instead.',
  password: 'The beta password was not accepted.',
  gateway: 'Could not read that just now. Try again, or fill the fields below.',
}

/** Gateway output is untrusted shape: known keys, non-empty strings, capped. */
function sanitize(raw: unknown): Intake {
  const out: Intake = {}
  if (!raw || typeof raw !== 'object') return out
  for (const { id } of INTAKE_QUESTIONS) {
    const v = (raw as Record<string, unknown>)[id]
    if (typeof v !== 'string') continue
    const c = clean(v)
    if (c) out[id] = c
  }
  return out
}

export async function extractIntake(input: string | File, opts: StreamOptions): Promise<Intake> {
  const { 'content-type': json, ...rest } = gatewayHeaders(opts)
  let body: BodyInit
  let headers: Record<string, string> = { ...rest, accept: 'application/json' }
  if (typeof input === 'string') {
    body = JSON.stringify({ text: input })
    headers = { ...headers, 'content-type': json }
  } else {
    body = new FormData()
    body.append('file', input)
  }
  let res: Response
  try {
    res = await fetch(`${opts.gatewayUrl.replace(/\/$/, '')}/v1/intake/extract`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body,
      signal: opts.signal,
    })
  } catch {
    throw new ExtractError('gateway')
  }
  const payload = (await res.json().catch(() => null)) as { intake?: unknown; reason?: string; error?: string } | null
  if (!res.ok) {
    if (res.status === 429) throw new ExtractError('quota')
    if (payload?.error === 'no_converter') throw new ExtractError('no_converter')
    if (payload?.reason === 'password') throw new ExtractError('password')
    throw new ExtractError('gateway')
  }
  return sanitize(payload?.intake)
}
