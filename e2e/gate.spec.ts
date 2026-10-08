import { expect, test } from '@playwright/test'
import { STUB_PASSWORD } from '../playwright.config'

// The private-beta door. Pavol sends the password by hand; nothing else gets in.
// The panel checks the typed value against the gateway (`GET /v1/council/key`)
// before it ever closes: a wrong guess never costs an idea the user has not even
// typed yet, and a password that rotates mid-session never costs one they have.

const STUB = 'http://localhost:8787'

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`)
})

test('a first visitor is asked for the password, wrong then right', async ({ page }) => {
  await page.goto('/quick')
  const panel = page.getByTestId('password-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('private beta')
  await expect(panel).toContainText('comes from Pavol')
  // The door is the whole app: no idea field and no tab bar behind it.
  await expect(page.getByLabel('What are you working on?')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/shots/password-gate.png' })

  // A wrong password is checked and refused before the panel ever closes — no idea
  // typed yet, so there is nothing for the rejection to cost.
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByTestId('password-rejected')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('password-panel')).toBeVisible()
  await expect(page.getByLabel('What are you working on?')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/shots/password-rejected.png' })

  // The right one shows the brief checking state, then opens straight onto home.
  await page.getByLabel('Password', { exact: true }).fill(STUB_PASSWORD)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('button', { name: 'Checking…' })).toBeVisible()
  await expect(page.getByLabel('What are you working on?')).toBeVisible({ timeout: 20_000 })

  await page.getByLabel('What are you working on?').fill('Leaving my job for the parish tool.')
  await page.getByRole('button', { name: 'Convene the council' }).click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })

  // The tier line, with no model name anywhere on the screen.
  await expect(page.getByTestId('tier')).toHaveText('Free council')
  await expect(page.locator('body')).not.toContainText('stub')

  // And the password survives a reload.
  await page.reload()
  await expect(page.getByLabel('What are you working on?')).toBeVisible()
})

test('a password rotated mid-session reopens the door without losing the idea', async ({
  page,
}) => {
  await page.goto('/quick')
  await page.getByLabel('Password', { exact: true }).fill(STUB_PASSWORD)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByLabel('What are you working on?')).toBeVisible({ timeout: 20_000 })

  // ROTATE tells the stub to answer this one convene with a stale-password 401,
  // even though the key is actually still right — simulating Pavol rotating it.
  const idea = 'ROTATE: leaving my job for the parish tool.'
  await page.getByLabel('What are you working on?').fill(idea)
  await page.getByRole('button', { name: 'Convene the council' }).click()

  // The door reopens; the idea is gone from the screen but not from the app's state.
  await expect(page.getByTestId('password-panel')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('password-rejected')).toHaveCount(0)
  await expect(page.getByLabel('What are you working on?')).toHaveCount(0)

  // The same password, re-entered, checks out — and the convene resumes on its own.
  await page.getByLabel('Password', { exact: true }).fill(STUB_PASSWORD)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByText(idea, { exact: false })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })
})
