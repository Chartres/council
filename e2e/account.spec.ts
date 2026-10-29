import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Signed-in journey for trust control 5 (flywheel charter row 20): export everything, then
// delete everything, end to end. Runs against the auth build on :4175, which talks to
// scripts/stub-supabase.mjs (:8788) — own-row reads and the council_delete_me() RPC with
// the semantics in docs/SUPABASE.md — and the stub gateway (:8787).

const APP = 'http://localhost:4175'
const SB = 'http://localhost:8788'
const SHOTS = process.env.SHOTS_DIR ?? 'e2e/shots'
const STORAGE_KEY = 'sb-localhost-auth-token'

const ME = { id: '11111111-1111-4111-8111-111111111111', email: 'pavla@test.dravec.org' }
const OTHER = { id: '22222222-2222-4222-8222-222222222222', email: 'other@test.dravec.org' }

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
/** The stub's own unsigned token: the stub reads `sub`, nothing checks the signature. */
const token = (u: { id: string; email: string }) =>
  `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.stub`

function rowsFor(u: { id: string }, tag: string) {
  const session = `${tag}-sess`.padEnd(8, '0')
  return {
    council_sessions: [{ id: `s-${tag}`, user_id: u.id, roster: 'classics', advisers: ['seneca'], intake: { goal: `${tag} goal` }, transcript: [], created_at: '2026-10-20T09:00:00Z' }],
    council_journal: [
      {
        id: `j-${tag}`,
        user_id: u.id,
        session_id: `s-${tag}`,
        decision: `Open a second ${tag} shop in spring`,
        reasoning: 'Demand is there on Saturdays.',
        assumptions: ['The lease is signed by March'],
        next_action: 'Call the landlord',
        owner: 'me',
        review_trigger: 'End of March',
        confidence: 60,
        map: null,
        status: 'accepted',
        created_at: '2026-10-20T09:30:00Z',
      },
    ],
    council_commitments: [{ id: `c-${tag}`, user_id: u.id, journal_id: `j-${tag}`, what: `Call the ${tag} landlord`, due_date: '2026-10-30', remind: true, outcome: null }],
    council_ideas: [{ id: `i-${tag}`, user_id: u.id, idea: `${tag} idea`, created_at: '2026-10-19T09:00:00Z', session: session }],
  }
}

async function signIn(page: Page, u: { id: string; email: string }) {
  page.on('pageerror', (e) => console.log('pageerror:', e.message))
  await page.goto(`${APP}/privacy`)
  await page.evaluate(
    ([key, session, journal]) => {
      localStorage.setItem(key, session)
      localStorage.setItem('council:journal', journal)
      localStorage.setItem('council:tier', 'free')
    },
    [
      STORAGE_KEY,
      JSON.stringify({
        access_token: token(u),
        refresh_token: 'stub-refresh',
        token_type: 'bearer',
        expires_in: 3600 * 24 * 365,
        expires_at: 4102444800,
        user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
      }),
      JSON.stringify({ entries: [{ ...rowsFor(u, 'local').council_journal[0], id: 'local-1', decision: 'A local leftover' }], commitments: [], lastIntake: null }),
    ] as const,
  )
}

const state = async (page: Page) =>
  (await (await page.request.get(`${SB}/__state`)).json()) as {
    users: { id: string }[]
    rows: Record<string, { user_id: string }[]>
    rpc_calls: { fn: string; sub: string | null }[]
  }

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
  await request.post(`${SB}/__reset`)
  await request.post(`${SB}/__seed`, {
    data: { users: [ME, OTHER], rows: Object.fromEntries(Object.keys(rowsFor(ME, 'x')).map((t) => [t, [...rowsFor(ME, 'bakery')[t as 'council_ideas'], ...rowsFor(OTHER, 'florist')[t as 'council_ideas']]])) },
  })
})

test('signed in: the journal comes from the account, export holds it, delete everything removes it and signs out', async ({ page }) => {
  await signIn(page, ME)

  // Signed in: the header shows the account, and the journal shows this user's rows only.
  await page.goto(`${APP}/journal`)
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible()
  await expect(page.getByTestId('journal')).toContainText('Open a second bakery shop in spring')
  await expect(page.getByText('florist')).toHaveCount(0)

  await page.getByRole('button', { name: 'Account' }).click()
  const panel = page.getByTestId('account-panel')
  await expect(panel).toContainText(ME.email)

  // Export everything: one JSON file with this user's rows in every table.
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Export everything' }).click()])
  expect(download.suggestedFilename()).toMatch(/^council-export-\d{4}-\d{2}-\d{2}\.json$/)
  const doc = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(doc.email).toBe(ME.email)
  expect(doc.journal.map((e: { decision: string }) => e.decision)).toEqual(['Open a second bakery shop in spring'])
  expect([doc.sessions.length, doc.commitments.length, doc.ideas.length]).toEqual([1, 1, 1])
  expect(JSON.stringify(doc)).not.toContain('florist')

  // Delete everything: needs the typed word, then signs out and clears this browser.
  await panel.getByRole('button', { name: 'Delete everything' }).click()
  const confirm = page.getByTestId('delete-confirm')
  const go = confirm.getByRole('button', { name: 'Delete everything' })
  await expect(go).toBeDisabled()
  await confirm.getByRole('textbox').fill('delete')
  await expect(go).toBeDisabled()
  await confirm.getByRole('textbox').fill('DELETE')
  await page.screenshot({ path: `${SHOTS}/account-delete-confirm-phone.png` })
  await go.click()

  await expect(page).toHaveURL(`${APP}/`)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  const left = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
  expect(left[STORAGE_KEY]).toBeUndefined()
  expect(left['council:key']).toBeTruthy() // the beta password stays
  expect(JSON.stringify(left)).not.toContain('A local leftover')
  expect(JSON.stringify(left)).not.toContain('bakery')

  // Server side: the RPC ran once as this user; their rows and auth user are gone, the other
  // user's are untouched.
  const s = await state(page)
  expect(s.rpc_calls).toEqual([{ fn: 'council_delete_me', sub: ME.id }])
  expect(s.users.map((u) => u.id)).toEqual([OTHER.id])
  for (const [table, list] of Object.entries(s.rows)) {
    expect(list.filter((r) => r.user_id === ME.id), table).toEqual([])
  }
  expect(s.rows.council_journal.filter((r) => r.user_id === OTHER.id)).toHaveLength(1)

  // A reload stays signed out with an empty journal.
  await page.goto(`${APP}/journal`)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('Open a second bakery shop in spring')).toHaveCount(0)
})

test('signed in: when the delete fails, nothing is deleted and the user stays signed in', async ({ page, request }) => {
  await signIn(page, ME)
  await request.post(`${SB}/__fail_delete`)
  await page.goto(`${APP}/`)
  await page.getByRole('button', { name: 'Account' }).click()
  const panel = page.getByTestId('account-panel')
  await panel.getByRole('button', { name: 'Delete everything' }).click()
  await page.getByTestId('delete-confirm').getByRole('textbox').fill('DELETE')
  await page.getByTestId('delete-confirm').getByRole('button', { name: 'Delete everything' }).click()

  await expect(panel).toContainText('Nothing was deleted. Try again, or write to council@dravec.org.')
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible()
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeTruthy()
  const s = await state(page)
  expect(s.users.map((u) => u.id).sort()).toEqual([ME.id, OTHER.id])
  expect(s.rows.council_journal.filter((r) => r.user_id === ME.id)).toHaveLength(1)
})

test('signed in: the Discussions sheet lists her account’s discussions with their decisions, and only hers', async ({ page }) => {
  await signIn(page, ME)
  await page.goto(`${APP}/`)
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible()
  await page.getByTestId('open-discussions').click()
  const sheet = page.getByTestId('discussions')
  const row = sheet.getByRole('button', { name: /bakery goal/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Open a second bakery shop in spring')
  await expect(sheet).toContainText('Kept on your account.')
  await expect(sheet.getByText('florist goal')).toHaveCount(0)
  // Opening it shows it as it was, ready to continue.
  await row.click()
  await expect(page.getByTestId('past')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'bakery goal' })).toBeVisible()
})
