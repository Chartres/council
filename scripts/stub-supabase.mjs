#!/usr/bin/env node
// Dev/CI stand-in for the Supabase project, just enough for the signed-in journeys
// (e2e/account.spec.ts): auth user lookup and sign-out, PostgREST reads/writes on the
// council tables with own-row filtering by the bearer token's `sub`, and the
// `council_delete_me()` RPC with the semantics in docs/SUPABASE.md (the caller's rows in
// every council table, then the auth user). No signature checks: the token is the stub's
// own (see `token()` in the spec), never a real Supabase JWT.
//
//   node scripts/stub-supabase.mjs            # :8788
//
// Test controls:
//   POST /__reset               empty every table and user, clear the failure switch
//   POST /__seed  {users:[{id,email}], rows:{table:[row…]}}
//   GET  /__state               {users, rows, rpc_calls}
//   POST /__fail_delete         the next council_delete_me answers 500 and deletes nothing

import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8788)
const TABLES = ['council_sessions', 'council_journal', 'council_commitments', 'council_ideas', 'progress']

let users = new Map()
let rows = Object.fromEntries(TABLES.map((t) => [t, []]))
let rpcCalls = []
let failDelete = false

const reset = () => {
  users = new Map()
  rows = Object.fromEntries(TABLES.map((t) => [t, []]))
  rpcCalls = []
  failDelete = false
}

const cors = (req) => ({
  'access-control-allow-origin': req.headers.origin ?? '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range',
})

const send = (req, res, status, body) => {
  res.writeHead(status, { ...cors(req), 'content-type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((resolve) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      try {
        resolve(b ? JSON.parse(b) : null)
      } catch {
        resolve(null)
      }
    })
  })

/** The `sub` of the bearer token, if that user still exists. */
function caller(req) {
  const m = (req.headers.authorization ?? '').match(/^Bearer ([^.]+)\.([^.]+)\./)
  if (!m) return null
  try {
    const sub = JSON.parse(Buffer.from(m[2], 'base64url').toString()).sub
    return users.has(sub) ? sub : null
  } catch {
    return null
  }
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(req))
    return res.end()
  }
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  if (path === '/health') return send(req, res, 200, { ok: true })
  if (path === '/__reset') return reset(), send(req, res, 204)
  if (path === '/__fail_delete') return (failDelete = true), send(req, res, 204)
  if (path === '/__state') {
    return send(req, res, 200, { users: [...users.values()], rows, rpc_calls: rpcCalls })
  }
  if (path === '/__seed') {
    const body = (await readBody(req)) ?? {}
    for (const u of body.users ?? []) users.set(u.id, u)
    for (const [t, list] of Object.entries(body.rows ?? {})) rows[t] = [...(rows[t] ?? []), ...list]
    return send(req, res, 204)
  }

  // --- auth ---
  if (path === '/auth/v1/user') {
    const sub = caller(req)
    return sub ? send(req, res, 200, { id: sub, email: users.get(sub).email, aud: 'authenticated', role: 'authenticated' }) : send(req, res, 403, { code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' })
  }
  if (path === '/auth/v1/logout') return send(req, res, 204)
  if (path.startsWith('/auth/v1/')) return send(req, res, 400, { msg: 'not stubbed' })

  // --- rpc ---
  if (path === '/rest/v1/rpc/council_delete_me' && req.method === 'POST') {
    const sub = caller(req)
    rpcCalls.push({ fn: 'council_delete_me', sub })
    if (!sub) return send(req, res, 401, { code: 'P0001', message: 'not signed in' })
    if (failDelete) {
      failDelete = false
      return send(req, res, 500, { code: 'XX000', message: 'stub failure' })
    }
    for (const t of TABLES) {
      rows[t] = rows[t].filter((r) => r.user_id !== sub || (t === 'progress' && r.app !== 'council'))
    }
    users.delete(sub)
    return send(req, res, 204)
  }

  // --- PostgREST tables: own rows only, like RLS ---
  const table = path.match(/^\/rest\/v1\/(\w+)$/)?.[1]
  if (table && TABLES.includes(table)) {
    const sub = caller(req)
    if (req.method === 'GET') {
      return send(req, res, 200, sub ? rows[table].filter((r) => r.user_id === sub) : [])
    }
    if (!sub) return send(req, res, 401, { message: 'permission denied' })
    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = await readBody(req)
      for (const r of Array.isArray(body) ? body : [body]) {
        if (!r || r.user_id !== sub) continue
        rows[table] = [...rows[table].filter((x) => !(x.id && x.id === r.id)), r]
      }
      return send(req, res, 201, [])
    }
    if (req.method === 'DELETE') return send(req, res, 204)
  }
  return send(req, res, 404, { message: 'not stubbed' })
}).listen(PORT, () => console.log(`stub supabase on :${PORT}`))
