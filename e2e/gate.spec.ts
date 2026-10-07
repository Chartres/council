import { expect, test } from '@playwright/test'
import { STUB_PASSWORD } from '../playwright.config'

// The private-beta door. Pavol sends the password by hand; nothing else gets in.
// A first visit sees the panel, a wrong password comes back to it, the right one passes.

const STUB = 'http://localhost:8787'

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`)
})

test('a first visitor is asked for the password, wrong then right', async ({ page }) => {
  await page.goto('/')
  const panel = page.getByTestId('password-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('private beta')
  await expect(panel).toContainText('comes from Pavol')
  // The door is the whole app: no idea field and no tab bar behind it.
  await expect(page.getByLabel('What are you working on?')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/shots/password-gate.png' })

  // A wrong password gets as far as the gateway, which refuses it.
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Enter' }).click()
  await page.getByLabel('What are you working on?').fill('Leaving my job for the parish tool.')
  await page.getByRole('button', { name: 'Convene the council' }).click()

  await expect(page.getByTestId('password-rejected')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('password-panel')).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/password-rejected.png' })

  // The right one, and the council sits.
  await page.getByLabel('Password', { exact: true }).fill(STUB_PASSWORD)
  await page.getByRole('button', { name: 'Enter' }).click()
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
