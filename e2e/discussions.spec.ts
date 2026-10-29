import { expect, test } from '@playwright/test'

// Past discussions (Eyal, 29 Oct: "I can only see the first one … something a bit more like
// the ChatGPT experience"). Lenka has a discussion, starts another, finds the first in the
// Discussions sheet from the header, reads it, and continues it with the same advisers.

const STUB = 'http://localhost:8787'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`)
})

test('every discussion is one tap away, readable, and can be continued', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to pilot a premium tier')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })
  await page.getByLabel('Your turn').fill('The constraint is engineering time.')
  await page.getByRole('button', { name: 'Say it' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })
  const lastQuestion = (await page.getByTestId('floor').last().textContent())!

  // The sheet lists it, marked as the one going on now; New discussion leaves for the start.
  await page.getByTestId('open-discussions').click()
  const sheet = page.getByTestId('discussions')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: /decide whether to pilot a premium tier/ })).toContainText('now')
  await page.screenshot({ path: 'e2e/shots/v4-discussions.png' })
  await sheet.getByRole('button', { name: 'New discussion' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible()

  // Kept across a reload (this browser, signed out).
  await page.reload()
  await page.getByTestId('open-discussions').click()
  await page.getByTestId('discussions').getByRole('button', { name: /decide whether to pilot a premium tier/ }).click()

  // Read-only: the transcript as it was, and one way on.
  await expect(page.getByTestId('past')).toBeVisible()
  await expect(page.getByTestId('user')).toContainText('The constraint is engineering time.')
  await expect(page.getByLabel('Your turn')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Agree' })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/shots/v4-discussion-past.png' })

  // Continue: a new session seeded with the record; the same discussion grows.
  await request.post(`${STUB}/__reset`) // the stub's one anonymous session was spent above
  await page.getByRole('button', { name: 'Continue this discussion' }).click()
  await expect(page.getByTestId('continued')).toBeVisible()
  await expect(page.getByTestId('facilitator').last()).toContainText('We are picking up your discussion from')
  await expect(page.getByTestId('facilitator').last()).toContainText(lastQuestion)
  await expect(page.getByTestId('floor')).toHaveCount(3, { timeout: 20_000 })
  await expect(page.getByLabel('Your turn')).toBeVisible()
  const sent = (await (await request.get(`${STUB}/__resume`)).json()) as { items: { who: string; text: string }[] }
  expect(sent.items).toContainEqual({ who: 'you', text: 'The constraint is engineering time.' })
  expect(sent.items.at(-1)).toEqual({ who: 'floor', text: lastQuestion })

  // Still one discussion in the list.
  await page.getByTestId('open-discussions').click()
  await expect(page.getByTestId('discussions').getByRole('button', { name: /decide whether to pilot a premium tier/ })).toHaveCount(1)
})
