import { expect, test } from '@playwright/test'

// Pavol, 30 Oct, on today's question: "give it a little on-hover or onclick explanation that
// this comes from Plato." On a phone it opens on tap.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test('today’s question says where it comes from, on tap, in one or two lines', async ({ page }) => {
  await page.goto('/')
  const why = page.getByTestId('today').getByRole('button', { name: 'Why?' })
  await expect(why).toHaveAttribute('aria-expanded', 'false')
  const box = await why.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.width).toBeGreaterThanOrEqual(44)

  await why.tap()
  await expect(why).toHaveAttribute('aria-expanded', 'true')
  const note = page.locator('#today-root')
  await expect(note).toBeVisible()
  await expect(note).toContainText('Plato’s Apology 38a')
  await expect(note).toContainText('“the unexamined life is not worth living.”')
  // One or two lines at 13 px.
  const lines = await note.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))
  expect(lines).toBeLessThanOrEqual(2)
  await page.screenshot({ path: 'e2e/shots/v4-today-root.png' })

  // Tapping the note's button did not open a council; tapping again closes it.
  await expect(page.getByTestId('today')).toBeVisible()
  await why.tap()
  await expect(note).toBeHidden()
})
