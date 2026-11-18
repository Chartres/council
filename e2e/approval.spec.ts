import { expect, test } from '@playwright/test'

// Pavol, 17 Nov: "Also let me approve new registrations now that password is gone." A new
// account signs in at the door and waits there until he approves it; nothing typed is lost.
// Runs against the auth build (:4175), the stub Supabase (:8788) and the stub gateway, which
// keeps a bearer whose `sub` starts with "pending-" at 401 {reason:"approval"} until
// POST /__approve.

const APP = 'http://localhost:4175'
const SB = 'http://localhost:8788'
const GW = 'http://localhost:8787'
const SHOTS = process.env.SHOTS_DIR ?? 'e2e/shots'
const NEW = { id: 'pending-44444444-4444-4444-8444-444444444444', email: 'new@test.dravec.org' }

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const session = (u: typeof NEW) => ({
  access_token: `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.stub`,
  refresh_token: 'stub-refresh',
  token_type: 'bearer',
  expires_in: 3600 * 24 * 365,
  expires_at: 4102444800,
  user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-17T00:00:00Z' },
})

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ request }) => {
  await request.post(`${GW}/__reset`)
  await request.post(`${SB}/__reset`)
  await request.post(`${SB}/__seed`, { data: { users: [NEW], rows: {} } })
})

test('a new person signs in at the door, waits for approval, and gets in after Check again', async ({ page, request }) => {
  await page.goto(APP)
  const door = page.getByTestId('password-panel')
  await door.getByRole('button', { name: 'Have an account? Sign in' }).click()
  await door.getByLabel('Email').fill(NEW.email)
  await door.getByRole('button', { name: 'Send link' }).click()
  const { code } = (await (await request.get(`${SB}/__otp?email=${NEW.email}`)).json()) as { code: string }
  await door.getByLabel('Code from the email').fill(code)
  await door.getByRole('button', { name: 'Use code' }).click()

  await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('approval-waiting')).toContainText(`Pavol has been told that ${NEW.email} would like to join.`)
  await expect(door.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(door.getByRole('button', { name: 'Have an account? Sign in' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  for (const name of ['Check again', 'Sign out']) {
    const box = await door.getByRole('button', { name }).boundingBox()
    expect(box!.height, name).toBeGreaterThanOrEqual(44)
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: `${SHOTS}/approval-door-phone.png`, fullPage: true })

  // Not yet.
  await door.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByTestId('approval-still-waiting')).toHaveText('Not approved yet.')

  // Pavol approves; Check again lets her in.
  await request.post(`${GW}/__approve`, { data: { sub: NEW.id } })
  await door.getByRole('button', { name: 'Check again' }).click()
  await expect(door).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible()
})

test('an idea typed before the gateway says "approval" survives the door and runs after Check again', async ({ page, request }) => {
  await request.post(`${GW}/__approve`, { data: { sub: NEW.id } })
  await page.goto(`${APP}/privacy`)
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['sb-localhost-auth-token', JSON.stringify(session(NEW))] as const)
  await page.goto(`${APP}/quick`)
  const field = page.getByLabel('What are you working on?')
  await expect(field).toBeVisible({ timeout: 20_000 })

  // Approval withdrawn while she types (or a probe that passed earlier): the convene is refused.
  await request.post(`${GW}/__approve`, { data: { sub: NEW.id, revoke: true } })
  const idea = 'Opening a bakery on the square.'
  await field.fill(idea)
  await page.getByRole('button', { name: 'Convene the council' }).click()
  await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible({ timeout: 20_000 })

  await request.post(`${GW}/__approve`, { data: { sub: NEW.id } })
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByText(idea, { exact: false })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })
})
