import { expect, test } from '@playwright/test'

// Pavol, 30 Oct: the evening examination hour is "User-set", "Default 17:30". Lenka keeps her
// journal in this browser; one commitment is due today. Phone width, a fixed clock.

const STUB = 'http://localhost:8787'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' })

test.beforeEach(async ({ page, request }) => {
  await request.post(`${STUB}/__reset`)
  await page.clock.setFixedTime(new Date('2026-10-30T18:00:00Z'))
  await page.addInitScript(() => {
    if (localStorage.getItem('council:journal')) return // only seed the first load
    localStorage.setItem(
      'council:journal',
      JSON.stringify({
        entries: [
          {
            id: 'e1',
            decision: 'Pilot the premium tier with five customers.',
            reasoning: 'Demand is the open question.',
            assumptions: [],
            next_action: 'talk to Sven',
            owner: 'Lenka',
            review_trigger: 'Thursday',
            confidence: 60,
            status: 'accepted',
            created_at: '2026-10-20T09:00:00.000Z',
          },
        ],
        commitments: [{ id: 'c1', journal_id: 'e1', what: 'talk to Sven', due_date: '2026-10-30', remind: false, outcome: null }],
        lastIntake: null,
      }),
    )
  })
})

test('the evening hour is hers to set: 17:30 by default, and the examination follows it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Journal/ }).click()

  // Nobody set an hour yet: 17:30, so at 18:00 the examination is open.
  const hour = page.getByLabel('Evening examination from')
  await expect(hour).toHaveValue('17:30')
  await expect(page.getByTestId('examination')).toBeVisible()

  // She moves it to 19:00: at 18:00 it is not evening yet.
  await hour.fill('19:00')
  await expect(page.getByTestId('examination')).toHaveCount(0)
  const box = await page.getByTestId('evening-hour').boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await page.getByTestId('evening-hour').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/shots/v4-evening-hour.png' })

  // Earlier again, and it stays set on this device.
  await hour.fill('17:45')
  await expect(page.getByTestId('examination')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: /^Journal/ }).click()
  await expect(page.getByLabel('Evening examination from')).toHaveValue('17:45')
  await expect(page.getByTestId('examination')).toContainText('You said you’d talk to Sven.')
  expect(await page.evaluate(() => localStorage.getItem('council:evening'))).toBe('17:45')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})
