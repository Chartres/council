import { expect, test } from '@playwright/test'

// Persona journeys (taste.md "Testing"). Hana has an idea she has been circling for
// weeks; she arrives on a phone, with no account, and wants a verdict — not a chat.
// Screenshots at 390 px are committed to e2e/shots/ for a human to look at.

const STUB = 'http://localhost:8787'

test.use({
  viewport: { width: 390, height: 844 },
  permissions: ['clipboard-read', 'clipboard-write'],
})

test.beforeEach(async ({ request }) => {
  // The stub holds the one anonymous allowance in memory; each journey starts fresh.
  await request.post(`${STUB}/__reset`)
})

test('Hana convenes the council anonymously and reaches a verdict', async ({ page }) => {
  await page.goto('/quick')
  await expect(page.getByLabel('What are you working on?')).toBeVisible()
  await expect(
    page.getByText('A fictional interpretation of historical thinkers', { exact: false }).first(),
  ).toBeVisible()
  // Three thinkers are ticked before she touches anything.
  await expect(page.getByText('Socrates · Marcus Aurelius · Seneca')).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/home.png' })

  await page
    .getByLabel('What are you working on?')
    .fill('Leaving my job to build a tool for small parishes.')
  await page.getByRole('button', { name: 'Convene the council' }).click()

  // Turns arrive one by one, each attributed.
  await expect(page.getByText('Socrates').first()).toBeVisible()
  await expect(page.getByText('Before we judge it', { exact: false })).toBeVisible()
  await expect(page.getByText('Half of what you listed', { exact: false })).toBeVisible()
  await expect(page.getByTestId('streaming')).toBeVisible()
  // Let the 320 ms fade-up settle — a mid-animation shot is not evidence (taste.md).
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'e2e/shots/session-streaming.png' })

  const verdict = page.getByTestId('verdict')
  await expect(verdict).toBeVisible({ timeout: 20_000 })
  await expect(verdict).toContainText('smallest honest version')
  await expect(verdict.getByText('Next action')).toBeVisible()
  await expect(verdict.getByTestId('verdict-quotes')).toContainText('Letter 1')
  await expect(verdict.getByText('for', { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('streaming')).toHaveCount(0)
  // Viewport shot, not fullPage: a sticky header stitches into fullPage captures.
  await verdict.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/shots/verdict.png' })

  // And she can answer back.
  await expect(page.getByLabel('Answer the council')).toBeVisible()
})

test('the sign-in gate appears when she convenes a second time', async ({ page }) => {
  await page.goto('/quick')
  await page.getByLabel('What are you working on?').fill('First idea of the evening.')
  await page.getByRole('button', { name: 'Convene the council' }).click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: '← New idea' }).click()
  await page.getByLabel('What are you working on?').fill('A second, greedier idea.')
  await page.getByRole('button', { name: 'Convene the council' }).click()

  const panel = page.getByTestId('sign-in-panel')
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await expect(panel).toContainText('free session is used up')
  await page.screenshot({ path: 'e2e/shots/sign-in-gate.png' })
})

test('today’s question can be convened on and shared without leaking her text', async ({
  page,
}) => {
  await page.goto('/quick')
  const card = page.getByTestId('daily-card')
  await expect(card).toBeVisible()
  const today = new Date()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  await expect(card).toContainText(key)
  const question = (await card.getByRole('heading').textContent())!.trim()
  expect(question.length).toBeGreaterThan(10)
  await page.screenshot({ path: 'e2e/shots/daily-card.png' })

  await card.getByRole('button', { name: 'Convene on this' }).click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Share today’s split' }).click()
  await expect(page.getByText('Copied', { exact: false })).toBeVisible()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain(key)
  expect(clipboard).toContain(question)
  expect(clipboard).toMatch(/\d for · \d mixed · \d against/)
  // The verdict prose and the next action never travel with the card.
  expect(clipboard).not.toContain('smallest honest version')
  await page.getByTestId('verdict').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/shots/daily-share.png' })
})
