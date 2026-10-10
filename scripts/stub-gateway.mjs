#!/usr/bin/env node
// Dev/CI stand-in for the council gateway Worker (flywheel/gateway/, llm.dravec.org).
// Speaks the contract in flywheel/docs/expansion/council-build.md and nothing else:
// no model, no key, canned turns. Playwright points VITE_GATEWAY_URL at it.
//
//   node scripts/stub-gateway.mjs            # :8787
//   PORT=9000 node scripts/stub-gateway.mjs
//
// Deterministic controls for tests:
//   POST /__reset              forget the anonymous allowance and the ROTATE trigger below
//   GET  /v1/council/key       204 if the header matches (or the gateway is ungated), else 401
//   idea containing "QUOTA"    → 429 {reason:"quota"}
//   idea containing "CAP"      → 503 {reason:"cap"}
//   idea containing "ROTATE"   → 401 {reason:"password"} once (simulates a rotated
//                                 password on an otherwise-right key), then normal
//   STUB_PASSWORD=x            require header `x-council-key: x`, else 401 {reason:"password"}
//   STUB_TIER=premium          default tier on the session event when no x-council-tier header
//   GET /v1/admin/usage        plausible running totals (admin-only on the real gateway)
//   header x-council-tier      echoed back as the session event's tier/model (admin only)
//
// v4 (flywheel/docs/expansion/council-v4.md "Flow"):
//   POST /v1/council/start     facilitator opener ("Last time…" when body.memory has
//                              anything, else an intake recap), 2 contributions, floor
//   POST /v1/council/turn      2–3 contributions + floor; the 3rd turn/control of a
//                              session also streams a proposal
//   POST /v1/council/control   pause | back_to:<id> | let:<a>,<b> | disagree | concrete |
//                              test | wrap_up — same stream shape, counts as a turn
//   POST /v1/council/capture   → { entry }  (canned, or the proposal named by proposal_id)
//   POST /v1/council/commit    → { commitment }  (echo, keeps the client's id)
//   GET  /v1/council/journal   → { entries, commitments } captured/committed this process
//
// v4.1 (flywheel/docs/expansion/council-v4.1.md "Gateway contract"):
//   POST /v1/intake/extract    JSON {text} → `key: value` lines for the seven keys, else a
//                              fixed sample; multipart {file} → the sample. Text or file
//                              containing QUOTA → 429, NO_CONVERTER → 503 {error:"no_converter"}
//   POST /v1/feedback          {text, page, session_id?} → 204; the 6th of a process (or
//                              text containing QUOTA) → 429. /__reset clears the count.
// ponytail: module-level state, single process. Fine for one Playwright worker;
// a shared fixture would need a per-test key in the request instead.

import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8787)
const TURN_DELAY_MS = Number(process.env.STUB_TURN_DELAY_MS ?? 60)
const PASSWORD = process.env.STUB_PASSWORD || null
const TIER = process.env.STUB_TIER ?? 'free'
const MONTH_CAP_CENTS = Number(process.env.STUB_MONTH_CAP_CENTS ?? 3000)
const MODEL_BY_TIER = { free: 'claude-haiku-5', premium: 'claude-sonnet-5-5' }

const SCRIPT = [
  { persona: 'socrates', text: 'Before we judge it, say plainly what you expect to be different in a year. You have described an activity, not an outcome.' },
  { persona: 'marcus-aurelius', text: 'Half of what you listed depends on other people choosing well. Separate the part that is yours and begin there.' },
  { persona: 'seneca', text: 'Price it in hours, not in money. A year of evenings is the real invoice, and you have not written it down.' },
  { persona: 'socrates', text: 'You answered the cost but not the question. If the outcome never arrived, would you still want to have done it?' },
  { persona: 'marcus-aurelius', text: 'Then do the smallest version while the rest is still uncertain. Nothing is lost that was never spent.' },
  { persona: 'seneca', text: 'Agreed, provided you set the date you stop. An experiment without an end is just a habit with better manners.' },
]

const VERDICT = {
  type: 'verdict',
  summary:
    'The council leans yes, on one condition: run the smallest honest version first and name the date you decide.',
  next_action: 'This week, build the one-page version and show it to three people who are not your friends.',
  votes: { socrates: 'mixed', 'marcus-aurelius': 'for', seneca: 'for' },
  quotes: [
    { persona: 'seneca', text: 'While we are postponing, life speeds by.', locator: 'Letter 1' },
    { persona: 'marcus-aurelius', text: 'Do every act of your life as if it were the last.', locator: 'Book II' },
  ],
}

// ---- v4 canned content ----
const LINES = {
  drucker: [
    'Start with the customer. Whose circumstances improve if this works, and how would they notice in the first month?',
    'You are describing an activity. What contribution deserves the investment — what result would you defend to your board?',
    'Then measure the one change that customer would recognise, not the volume of work you produce.',
  ],
  jobs: [
    'Show me what someone actually sees on day one. If it takes a paragraph to explain, it is not ready.',
    'Cut it to the one thing people would miss if it vanished tomorrow. Everything else is noise for now.',
    'Make a version you can put in someone’s hands this week. Their face will tell you more than a survey.',
  ],
  grove: [
    'Who owns this, by name, and what is the one dependency that can stall it? Write both down before anything else.',
    'Pick an output metric and a leading indicator. If the indicator does not move in four weeks, you change course.',
    'Run it as a two-week experiment with one owner. Decide now what evidence would make you stop.',
  ],
  socrates: [
    'When you say "success", do you mean more customers or better ones? Those lead to different plans.',
    'You assume they want this. What have you seen them do — not say — that supports it?',
    'If the experiment fails, what will you have learned that you do not know today?',
  ],
}
const GENERIC = [
  'Name the part of this that is yours to decide, and begin there.',
  'Count the cost in hours before you count the upside.',
  'Do the smallest honest version first and set the date you will judge it.',
]
const FLOORS = [
  'Which of these is closest to the real constraint for you?',
  'What would you put in front of a customer first?',
  'Does that experiment fit the time and authority you have?',
  'What would make you stop?',
]
const CONFIDENCE = { 1: 70, 2: 65 } // by turn index: the 2nd and 3rd turns carry a pill
const PROPOSAL = {
  decision: 'Run a two-week pilot with five existing customers before building anything new.',
  reasoning: 'The group agreed the open question is demand, not capability; a pilot answers it cheaply.',
  assumptions: ['Five customers will give two weeks of honest use', 'The pilot can run without engineering time'],
  next_action: 'Email five customers and book the pilot kickoff',
  owner: 'You',
  review_trigger: 'End of week two, or sooner if fewer than three say yes',
  confidence: 65,
}
const v4 = new Map() // session_id → { advisers, turns }
const INTAKE_KEYS = ['role', 'organization', 'goal', 'situation', 'success', 'constraints', 'working_style']
const SAMPLE_INTAKE = {
  role: 'Product manager, 10 years in B2B software.',
  organization: 'A mid-size software company serving logistics firms; owns the pricing roadmap.',
  goal: 'Decide whether to launch a premium tier this year.',
}
let feedbackCount = 0
const captured = { entries: [], commitments: [] }

const cap = (id) => id.charAt(0).toUpperCase() + id.slice(1)
const line = (id, n) => (LINES[id] ?? GENERIC)[n % 3]

async function streamV4(res, sessionId, events, tier) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-session-id': sessionId,
  })
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  send({ type: 'session', session_id: sessionId, tier, model: MODEL_BY_TIER[tier] ?? MODEL_BY_TIER.free })
  for (const ev of events) {
    await sleep(TURN_DELAY_MS)
    send(ev)
  }
  const costCents = tier === 'premium' ? 9 : 3
  recordUsage(MODEL_BY_TIER[tier] ?? MODEL_BY_TIER.free, costCents)
  send({ type: 'done', usage: { cost_cents: costCents } })
  res.end()
}

function opener(body) {
  const names = { business: 'Drucker, Jobs, Grove and Socrates', classics: 'the classics' }
  const memory = body.memory
  if (memory && (memory.entries?.length || memory.commitments?.length)) {
    const c = memory.commitments?.[0]
    const e = memory.entries?.[0]
    return (
      `Last time we talked about ${e ? e.decision.replace(/\.$/, '') : 'your plan'}` +
      (c ? `; you said you'd ${c.what} by ${c.due_date} — how did it go?` : '. Where does it stand?')
    )
  }
  const intake = body.intake ?? {}
  if (intake.goal) return `Here is what I understood: you want to ${intake.goal.replace(/\.$/, '')}. Correct me as we go. Let us hear from the group.`
  return `Welcome. The group today: ${names[body.roster] ?? 'your advisers'} — simulations, not the real people. Tell us what you are working on as we go.`
}

/** 2–3 contributions + floor (+ proposal on the 3rd), shaped by the control command. */
function turnEvents(session, command) {
  const n = session.turns++
  const [a, b, c] = [0, 1, 2].map((i) => session.advisers[(n * 2 + i) % session.advisers.length])
  const said = (id, k = n) => ({ type: 'contribution', speaker: id, text: line(id, k), ...(CONFIDENCE[k] ? { confidence: CONFIDENCE[k] } : {}) })
  let events
  const [verb, arg = ''] = (command ?? '').split(':')
  switch (verb) {
    case 'pause':
      events = [{ type: 'facilitator', text: 'Paused. Take your time — say when you want to pick it up, or steer us somewhere else.' }]
      break
    case 'back_to':
      events = [{ type: 'facilitator', text: `Back to ${cap(arg)}'s point.` }, said(arg, n + 1)]
      break
    case 'let': {
      const [x, y] = arg.split(',')
      events = [{ type: 'facilitator', text: `${cap(x)} and ${cap(y)}, take it between you.` }, said(x), said(y), said(x, n + 1)]
      break
    }
    case 'disagree':
      events = [{ type: 'facilitator', text: 'Good — say where it breaks for you and the group will follow.' }, said(a, 1)]
      break
    case 'concrete':
      events = [said(session.advisers.includes('jobs') ? 'jobs' : a, 2), said(b, 2)]
      break
    case 'test':
      events = [said(session.advisers.includes('grove') ? 'grove' : a, 2), said(b, 1)]
      break
    case 'wrap_up':
      return [
        { type: 'facilitator', text: 'Let us close. One decision stands out; it is below as a proposal for your journal.' },
        { type: 'proposal', id: `p-${session.id}-wrap`, ...PROPOSAL },
      ]
    default:
      events = n % 2 ? [said(a), said(b), said(c)] : [said(a), said(b)]
  }
  if (session.turns === 3) events.push({ type: 'proposal', id: `p-${session.id}-3`, ...PROPOSAL })
  events.push({ type: 'floor', question: FLOORS[n % FLOORS.length] })
  return events
}

let anonUsed = false
let rotateConsumed = false
let usage = {
  day_cents: 0,
  week_cents: 0,
  month_cents: 0,
  sessions_day: 0,
  sessions_week: 0,
  sessions_month: 0,
  by_model: {},
}

function recordUsage(model, cents) {
  usage.day_cents += cents
  usage.week_cents += cents
  usage.month_cents += cents
  usage.sessions_day += 1
  usage.sessions_week += 1
  usage.sessions_month += 1
  usage.by_model[model] = (usage.by_model[model] ?? 0) + cents
}

const cors = (req, res) => {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-credentials', 'true')
  }
  res.setHeader(
    'access-control-allow-headers',
    'content-type, authorization, accept, x-council-key, x-council-tier',
  )
  res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS')
  res.setHeader('access-control-expose-headers', 'x-session-id')
}

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        resolve({})
      }
    })
  })

const readRaw = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.setEncoding('latin1')
    req.on('data', (c) => (raw += c))
    req.on('end', () => resolve(raw))
  })

const fail = (res, status, reason) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ reason }))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function streamCouncil(res, sessionId, personas, tier) {
  const model = MODEL_BY_TIER[tier] ?? MODEL_BY_TIER.free
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-session-id': sessionId,
  })
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  send({ type: 'session', session_id: sessionId, tier, model })
  for (const turn of SCRIPT) {
    await sleep(TURN_DELAY_MS)
    send({ type: 'turn', ...turn })
  }
  await sleep(TURN_DELAY_MS)
  // Vote only for personas that actually sat (the canned script covers the 3 defaults).
  const votes = Object.fromEntries(
    Object.entries(VERDICT.votes).filter(([id]) => !personas?.length || personas.includes(id)),
  )
  send({ ...VERDICT, votes: Object.keys(votes).length ? votes : VERDICT.votes })
  await sleep(TURN_DELAY_MS)
  const costCents = tier === 'premium' ? 9 : 3
  recordUsage(model, costCents)
  send({ type: 'done', usage: { cost_cents: costCents } })
  res.end()
}

createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  if (req.url === '/health') return res.writeHead(200).end('ok')
  if (req.url === '/__reset') {
    anonUsed = false
    rotateConsumed = false
    feedbackCount = 0
    v4.clear()
    captured.entries = []
    captured.commitments = []
    usage = {
      day_cents: 0,
      week_cents: 0,
      month_cents: 0,
      sessions_day: 0,
      sessions_week: 0,
      sessions_month: 0,
      by_model: {},
    }
    return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
  }

  // The private-beta door, ahead of everything else the gateway knows.
  if (PASSWORD && req.headers['x-council-key'] !== PASSWORD) return fail(res, 401, 'password')

  // The panel checks the password here before it ever closes. The delay mirrors a
  // real round trip, long enough for a test (or a person) to see the "Checking…" state.
  if (req.url === '/v1/council/key' && req.method === 'GET') {
    await sleep(TURN_DELAY_MS)
    return res.writeHead(204).end()
  }

  // Admin-only on the real gateway (Supabase JWT + beta password checked above).
  if (req.url === '/v1/admin/usage' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ...usage, month_cap_cents: MONTH_CAP_CENTS }))
  }

  if (req.url === '/v1/council/journal' && req.method === 'GET') {
    if (!(req.headers.authorization ?? '').startsWith('Bearer ')) return fail(res, 401, 'sign_in')
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(captured))
  }

  if (req.url === '/v1/intake/extract' && req.method === 'POST') {
    const multipart = (req.headers['content-type'] ?? '').startsWith('multipart/form-data')
    const raw = multipart ? await readRaw(req) : String((await readBody(req)).text ?? '')
    await sleep(TURN_DELAY_MS)
    if (raw.includes('QUOTA')) return fail(res, 429, 'quota')
    if (raw.includes('NO_CONVERTER')) {
      res.writeHead(503, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'no_converter' }))
    }
    const intake = {}
    if (!multipart) {
      for (const m of raw.matchAll(/^\s*([a-z_ ]+)\s*:\s*(.+)$/gim)) {
        const key = m[1].trim().toLowerCase().replace(' ', '_')
        if (INTAKE_KEYS.includes(key)) intake[key] = m[2].trim()
      }
    }
    const out = Object.keys(intake).length ? intake : SAMPLE_INTAKE
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ intake: out, unknown: INTAKE_KEYS.filter((k) => !out[k]) }))
  }

  const body = await readBody(req)

  if (req.url === '/v1/feedback' && req.method === 'POST') {
    const text = String(body.text ?? '').trim()
    if (!text || text.length > 2000 || !body.page) return fail(res, 400, 'bad_request')
    if (text.includes('QUOTA') || ++feedbackCount > 5) return fail(res, 429, 'quota')
    return res.writeHead(204).end()
  }

  const signedIn = (req.headers.authorization ?? '').startsWith('Bearer ')
  const idea = String(body.idea ?? '')
  // Admin-only free/premium switch; a header with neither value falls back to STUB_TIER.
  const headerTier = req.headers['x-council-tier']
  const tier = headerTier === 'premium' || headerTier === 'free' ? headerTier : TIER

  if (idea.includes('QUOTA')) return fail(res, 429, 'quota')
  if (idea.includes('CAP')) return fail(res, 503, 'cap')
  // A right key that the gateway now treats as wrong — one shot, then it behaves.
  if (idea.includes('ROTATE') && !rotateConsumed) {
    rotateConsumed = true
    return fail(res, 401, 'password')
  }

  if (req.url === '/v1/council/session') {
    if (!signedIn) {
      // Contract: anonymous allowed exactly once, then 401 {reason:"sign_in"}.
      if (anonUsed) return fail(res, 401, 'sign_in')
      anonUsed = true
    }
    return streamCouncil(res, `stub-${Date.now()}`, body.personas, tier)
  }

  if (req.url === '/v1/council/start') {
    if (!signedIn) {
      if (anonUsed) return fail(res, 401, 'sign_in')
      anonUsed = true
    }
    if (!Array.isArray(body.advisers) || !body.advisers.length) return fail(res, 400, 'bad_request')
    const id = `stub-${Date.now()}`
    const session = { id, advisers: body.advisers.slice(0, 4), turns: 0 }
    v4.set(id, session)
    const [a, b] = [session.advisers[0], session.advisers[1] ?? session.advisers[0]]
    session.turns = 1
    return streamV4(
      res,
      id,
      [
        { type: 'facilitator', text: opener(body) },
        { type: 'contribution', speaker: a, text: line(a, 0) },
        { type: 'contribution', speaker: b, text: line(b, 0) },
        { type: 'floor', question: FLOORS[0] },
      ],
      tier,
    )
  }

  if (['/v1/council/turn', '/v1/council/control', '/v1/council/capture', '/v1/council/commit'].includes(req.url)) {
    const session = v4.get(body.session_id)
    if (!session) return fail(res, 404, 'no_session')
    if (req.url === '/v1/council/turn') {
      if (!String(body.message ?? '').trim()) return fail(res, 400, 'bad_request')
      return streamV4(res, session.id, turnEvents(session), tier)
    }
    if (req.url === '/v1/council/control') {
      if (!body.command) return fail(res, 400, 'bad_request')
      return streamV4(res, session.id, turnEvents(session, String(body.command)), tier)
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    if (req.url === '/v1/council/capture') {
      const entry = {
        id: body.proposal_id ?? `cap-${Date.now()}`,
        session_id: session.id,
        date: new Date().toISOString().slice(0, 10),
        ...(body.proposal_id
          ? PROPOSAL
          : { ...PROPOSAL, decision: body.text || 'Talk to Sven before committing budget to the pilot.', next_action: 'Talk to Sven about the pilot budget', confidence: 55 }),
      }
      captured.entries.push(entry)
      return res.end(JSON.stringify({ entry }))
    }
    const commitment = {
      id: body.id ?? `c-${Date.now()}`,
      journal_id: body.entry_id,
      what: body.what ?? PROPOSAL.next_action,
      due_date: body.due_date,
      remind: Boolean(body.remind),
      outcome: null,
    }
    captured.commitments.push(commitment)
    return res.end(JSON.stringify({ commitment }))
  }

  if (req.url === '/v1/council/reply') {
    if (!body.session_id) return fail(res, 400, 'bad_request')
    return streamCouncil(res, body.session_id, body.personas, tier)
  }

  res.writeHead(404).end()
}).listen(PORT, () => console.log(`stub gateway on http://localhost:${PORT}`))
