import { expect, test } from '@playwright/test'

// Seen on an iPhone 17 Simulator (review 15 Nov): the reply field's placeholder wrapped to a
// second line that the one-line field clipped. At 390 px it has to fit on one line. Since 21 Nov
// the field is the floor's draft, opened by Type instead.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
})

test('the reply field’s placeholder fits on one line at phone width', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to pilot a premium tier')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })
  await page.getByTestId('type-instead').click()
  const reply = page.locator('#voice-draft')
  await reply.scrollIntoViewIfNeeded()
  // Safari sizes the field to its value, not its placeholder: measure the text against the line.
  const { text, room } = await reply.evaluate((el: HTMLTextAreaElement) => {
    const cs = getComputedStyle(el)
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    return {
      text: ctx.measureText(el.placeholder).width,
      room: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    }
  })
  expect(text).toBeLessThanOrEqual(room)
  await page.screenshot({ path: 'e2e/shots/composer-phone.png' })
})
