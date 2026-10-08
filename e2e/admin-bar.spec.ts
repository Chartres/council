import { expect, test } from '@playwright/test'
import { STUB_PASSWORD } from '../playwright.config'

// The admin bar only exists in the build at :4174, where VITE_E2E_ADMIN=1 is baked
// in (see playwright.config.ts) — the plain build at :4173 never carries it, so
// every other journey (fold, gate, council…) stays exactly as if this bar did not
// exist. `isAdmin` itself is unit-tested in src/domain/admin.test.ts.
const ADMIN = 'http://localhost:4174'
const STUB = 'http://localhost:8787'

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`)
})

test.describe('admin build', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    storageState: {
      cookies: [],
      origins: [{ origin: ADMIN, localStorage: [{ name: 'council:key', value: STUB_PASSWORD }] }],
    },
  })

  test('the admin bar appears, shows usage, and the tier toggle is reflected after a session', async ({
    page,
  }) => {
    await page.goto(ADMIN + '/quick')
    const bar = page.getByTestId('admin-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('month:')
    await page.screenshot({ path: 'e2e/shots/admin-bar.png' })

    // Default tier is free; convening reports it back next to the toggle.
    await page.getByLabel('What are you working on?').fill('Leaving my job for the parish tool.')
    await page.getByRole('button', { name: 'Convene the council' }).click()
    await expect(page.getByTestId('tier-ran')).toContainText('ran: free', { timeout: 20_000 })
    await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })

    // The usage line refreshes after `done` without a reload.
    await expect(bar).toContainText('(1)', { timeout: 20_000 })

    // Tapping the usage line expands the per-model breakdown.
    await page.getByLabel('Usage detail').click()
    await expect(page.getByTestId('admin-bar-models')).toBeVisible()
    await page.screenshot({ path: 'e2e/shots/admin-bar-expanded.png' })
  })

  test('the free/premium toggle changes the tier and model a session reports', async ({ page }) => {
    await page.goto(ADMIN + '/quick')
    await page.getByTestId('tier-toggle').click()
    await expect(page.getByTestId('tier-toggle')).toHaveText('premium')

    await page.getByLabel('What are you working on?').fill('Leaving my job for the parish tool.')
    await page.getByRole('button', { name: 'Convene the council' }).click()
    await expect(page.getByTestId('tier-ran')).toContainText('ran: premium', { timeout: 20_000 })
    await expect(page.getByTestId('tier-ran')).toContainText('claude-sonnet-5-5')
  })
})

test('a non-admin session never sees the bar', async ({ page }) => {
  // The default (non-admin) build and storage state, from playwright.config.ts.
  await page.goto('/quick')
  await expect(page.getByLabel('What are you working on?')).toBeVisible()
  await expect(page.getByTestId('admin-bar')).toHaveCount(0)
})
