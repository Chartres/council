import { expect, test } from '@playwright/test'

// v4.1 trust controls and feedback (flywheel/docs/expansion/council-v4.1.md).

const STUB = 'http://localhost:8787'
const SHOTS = process.env.SHOTS_DIR ?? 'e2e/shots'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`)
})

test.describe('privacy page, before the beta door', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('/privacy is public and states the facts', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'What we store' })).toBeVisible()
    await expect(page.getByTestId('password-panel')).toHaveCount(0)
    for (const fact of ['AWS London', 'Up to 30 days', 'The subject is generic', 'Not confirmed', 'Pavol Dravecký', 'council@dravec.org', 'to be added']) {
      await expect(page.getByText(fact).first()).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Your content' })).toBeVisible()
    await expect(page.getByText('Using this for work?')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/v41-privacy-phone.png`, fullPage: true })
  })
})

test('the roster says the advisers are AI and links to What we store', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/The advisers are AI\./)).toBeVisible()
  await page.getByRole('link', { name: 'What we store' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
})

test('feedback from any screen: sent with the page, then thanks; over the cap, a polite stop', async ({ page }) => {
  await page.goto('/journal')
  await page.getByRole('button', { name: 'Feedback' }).click()
  await page.getByLabel('What worked, what didn’t?').fill('The journal export is hard to find.')
  const req = page.waitForRequest((r) => r.url().endsWith('/v1/feedback'))
  await page.getByRole('button', { name: 'Send' }).click()
  expect((await req).postDataJSON()).toEqual({ text: 'The journal export is hard to find.', page: '/journal' })
  await expect(page.getByTestId('feedback-done')).toHaveText('Thanks. Pavol reads these.')

  // In a session too (the header stays when the tab bar hides), and the cap answers kindly.
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByRole('button', { name: 'Feedback' }).click()
  await page.getByLabel('What worked, what didn’t?').fill('QUOTA')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByTestId('feedback-done')).toHaveText('Enough for today, thank you.')
})
