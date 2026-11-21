import { expect, test } from '@playwright/test'

// Fold discipline (Flywheel Standard, mobile-ux.md): no chrome row spent on a single
// control. The landing screen's first primary control must sit in the top 120 css px
// on a phone. On `/` (v4) that is today's question card; on `/quick` (v3) the idea field.
test('phone fold: the first control starts near the top', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/quick', '/']) {
    await page.goto(path)
    const first = page.locator('main :is(textarea, button, input, select)').first()
    await expect(first).toBeVisible()
    const box = await first.boundingBox()
    expect(box, path).not.toBeNull()
    expect(box!.y, path).toBeLessThan(120)
  }
  await page.screenshot({ path: 'e2e/shots/fold-phone.png' })
})

// The intake's question is the screen: its field near the top and the primary button
// above the fold on a phone, once the first-visit trust note is dismissed.
test('phone fold: the intake question and its button fit the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('council:trust-seen', '1'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  const goal = await page.getByLabel('What would you like the group to help you achieve?').boundingBox()
  const go = await page.getByRole('button', { name: 'Bring it to the group' }).boundingBox()
  expect(goal!.y).toBeLessThanOrEqual(160)
  expect(go!.y + go!.height).toBeLessThanOrEqual(844)
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

// Pavol's iPhone, 21 Nov 2026: with the account mark shown the running head read "MASTERMIND COUN…".
test('phone header: the title fits whole beside Feedback and the account mark', async ({ page }) => {
  for (const width of [360, 393]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    // The e2e build has no auth configured; a 44 px stand-in takes the account mark's place.
    const [scroll, client] = await page.evaluate(() => {
      const group = document.querySelector('header .flex.items-center.gap-1')!
      const mark = document.createElement('span')
      mark.style.cssText = 'display:inline-block;width:44px;height:44px'
      group.appendChild(mark)
      const head = document.querySelector('[data-testid=running-head]') as HTMLElement
      return [head.scrollWidth, head.clientWidth]
    })
    expect(scroll, `width ${width}`).toBeLessThanOrEqual(client)
  }
})
