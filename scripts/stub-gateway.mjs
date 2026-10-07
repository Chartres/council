#!/usr/bin/env node
// Dev/CI stand-in for the council gateway Worker (flywheel/gateway/, llm.dravec.org).
// Speaks the contract in flywheel/docs/expansion/council-build.md and nothing else:
// no model, no key, canned turns. Playwright points VITE_GATEWAY_URL at it.
//
//   node scripts/stub-gateway.mjs            # :8787
//   PORT=9000 node scripts/stub-gateway.mjs
//
// Deterministic controls for tests:
//   POST /__reset              forget the anonymous allowance
//   idea containing "QUOTA"    → 429 {reason:"quota"}
//   idea containing "CAP"      → 503 {reason:"cap"}
// ponytail: module-level state, single process. Fine for one Playwright worker;
// a shared fixture would need a per-test key in the request instead.

import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8787)
const TURN_DELAY_MS = Number(process.env.STUB_TURN_DELAY_MS ?? 60)

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
}

let anonUsed = false

const cors = (req, res) => {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-credentials', 'true')
  }
  res.setHeader('access-control-allow-headers', 'content-type, authorization, accept')
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
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

async function streamCouncil(res, sessionId, personas) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-session-id': sessionId,
  })
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  send({ type: 'session', session_id: sessionId })
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
  send({ type: 'done', usage: { cost_cents: 3 } })
  res.end()
}

createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  if (req.url === '/health') return res.writeHead(200).end('ok')
  if (req.url === '/__reset') {
    anonUsed = false
    return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
  }

  const body = await readBody(req)
  const signedIn = (req.headers.authorization ?? '').startsWith('Bearer ')
  const idea = String(body.idea ?? '')

  if (idea.includes('QUOTA')) return fail(res, 429, 'quota')
  if (idea.includes('CAP')) return fail(res, 503, 'cap')

  if (req.url === '/v1/council/session') {
    if (!signedIn) {
      // Contract: anonymous allowed exactly once, then 401 {reason:"sign_in"}.
      if (anonUsed) return fail(res, 401, 'sign_in')
      anonUsed = true
    }
    return streamCouncil(res, `stub-${Date.now()}`, body.personas)
  }

  if (req.url === '/v1/council/reply') {
    if (!body.session_id) return fail(res, 400, 'bad_request')
    return streamCouncil(res, body.session_id, body.personas)
  }

  res.writeHead(404).end()
}).listen(PORT, () => console.log(`stub gateway on http://localhost:${PORT}`))
