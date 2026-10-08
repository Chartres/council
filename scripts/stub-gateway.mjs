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

  const body = await readBody(req)
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

  if (req.url === '/v1/council/reply') {
    if (!body.session_id) return fail(res, 400, 'bad_request')
    return streamCouncil(res, body.session_id, body.personas, tier)
  }

  res.writeHead(404).end()
}).listen(PORT, () => console.log(`stub gateway on http://localhost:${PORT}`))
