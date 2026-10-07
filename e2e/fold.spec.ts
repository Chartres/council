import { expect, test } from '@playwright/test'

// Fold discipline (Flywheel Standard, mobile-ux.md): no chrome row spent on a single
// control. The landing screen's first primary control must sit in the top 120 css px
// on a phone. Here that control is the idea field, not a button — the "Convene"
// button is deliberately below it, where the thumb lands after typing.
test('phone fold: the idea field starts near the top', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const first = page.locator('main :is(textarea, button, input)').first()
  await expect(first).toBeVisible()
  const box = await first.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeLessThan(120)
  await page.screenshot({ path: 'e2e/shots/fold-phone.png' })
})

test('no horizontal page overflow at 320, 375 and 430 px', async ({ page }) => {
  await page.goto('/')
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 844 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1)
  }
})

test('bottom nav targets clear 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button')
  const count = await tabs.count()
  expect(count).toBeGreaterThan(1)
  for (let i = 0; i < count; i++) {
    const box = await tabs.nth(i).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})
