import { expect, test, type Page } from '@playwright/test'
import { FAKE_EARS, FAKE_VOICE, hear, speakInto, tone, readAloud, readingAloud } from './fakeVoice'

// The floor (Pavol, 20 Nov 2026, option A of lab/one-voice): one bar at the bottom of the
// conversation with the candle, one status line and one main button. His words are a dashed
// message in the conversation; a tap corrects them. Read aloud marks the sentence being read.
// A swipe or Reply answers one adviser (Eyal, feedback 533a9ad9).
// FLOOR_REVIEW=1 writes each state at 390 px to docs/review/2026-11-21-floor/.

test.use({ viewport: { width: 390, height: 844 } })
test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
})

const DIR = 'docs/review/2026-11-21-floor'
const shot = async (page: Page, name: string) => {
  if (!process.env.FLOOR_REVIEW) return
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${DIR}/${name}.png` })
}
const status = (page: Page) => page.getByTestId('talk-status')
type Synth = { spoken: string[]; cancels: number }
const synth = (page: Page) => page.evaluate(() => window.speechSynthesis as unknown as Synth)

async function open(page: Page, init: string) {
  await page.addInitScript(init)
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to keep the shop open on Sundays')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })
}

test('one place to speak: talk, correct, send, hear it read, cut in', async ({ page }) => {
  await open(page, FAKE_VOICE)
  const bar = page.getByTestId('voice-bar')
  // One bar, one field at most: no reply box under the conversation.
  await expect(page.locator('#reply')).toHaveCount(0)
  await expect(bar.getByTestId('candle')).toBeVisible()
  await expect(status(page)).toHaveText('Your turn. Take your time.')
  await expect(bar.getByTestId('voice-talk')).toHaveText('Talk')
  await expect(page.locator('textarea')).toHaveCount(0)
  // The candle is the bar's centre (about 100 px tall); the bar stays under 35 % of the screen.
  expect((await bar.getByTestId('candle').boundingBox())!.height).toBeGreaterThanOrEqual(90)
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(844 * 0.35)
  // At most two quiet words under the buttons.
  await expect(bar.locator('.text-btn:visible')).toHaveCount(2)
  await shot(page, '01-your-turn')

  // He talks: the words are a dashed message in the conversation, the candle follows his voice.
  await bar.getByTestId('voice-talk').click()
  await tone(page, true)
  await hear(page, 'the regulars come on Sunday')
  await expect(page.getByTestId('draft')).toContainText('the regulars come on Sunday')
  await expect(status(page)).toContainText('Recording.')
  await expect(page.getByTestId('lamp')).toHaveAttribute('data-mode', 'voice')
  await shot(page, '02-recording')
  await tone(page, false)

  // Finish, then a tap on his words corrects them: the only text field, only while he edits.
  await bar.getByTestId('voice-finish').click()
  await expect(status(page)).toHaveText('Read it over. Tap your words to correct them.')
  await page.getByTestId('draft-text').click()
  const field = page.getByTestId('voice-draft')
  await expect(field).toBeFocused()
  await field.fill('The regulars come on Sunday, but I am tired.')
  await expect(page.locator('textarea')).toHaveCount(1)
  await shot(page, '04-correcting')
  await bar.getByTestId('voice-send').click()
  await expect(page.getByTestId('user').last()).toContainText('The regulars come on Sunday, but I am tired.')
  await expect(page.getByTestId('draft')).toHaveCount(0)
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })

  // Read aloud: the room reads each answer sentence by sentence, marked, with dots.
  await readAloud(page) // Read aloud on (under More): the mic opens at once, his turn
  expect(await readingAloud(page)).toBe(true)
  await hear(page, 'what about the numbers')
  await bar.getByTestId('voice-finish').click()
  await bar.getByTestId('voice-send').click()
  await expect(status(page)).toHaveText(/is answering\. Tap to speak instead\.$/, { timeout: 10_000 })
  await shot(page, '05-answering')
  await expect(status(page)).toHaveText(/, sentence \d of \d$/, { timeout: 20_000 })
  const reading = page.locator('[data-testid="contribution"]').filter({ has: page.getByTestId('now-speaking') })
  await expect(reading.getByTestId('sentence-dots')).toBeVisible()
  await expect(page.getByTestId('lamp')).toHaveAttribute('data-mode', 'breath')
  await shot(page, '06-reading')

  // What is read is what is shown, in order.
  await expect(page.getByTestId('floor')).toHaveCount(3, { timeout: 20_000 })
  const answer = (await page.getByTestId('contribution').last().locator('.t-body').textContent())!.trim()
  await expect
    .poll(async () => (await synth(page)).spoken.join(' '), { timeout: 20_000 })
    .toContain(answer.replace(/\s+/g, ' '))

  // Cut in: the voice stops, the mic opens, the sentences not read stay grey.
  await expect(bar.getByTestId('cut-in')).toBeVisible({ timeout: 20_000 })
  await bar.getByTestId('cut-in').click()
  await expect(status(page)).toContainText('Recording.')
  await hear(page, 'wait')
  await shot(page, '07-cut-in')
  await bar.getByTestId('voice-finish').click()
  await readAloud(page) // Read aloud off; his words stay on the floor
  await expect(page.getByTestId('draft')).toContainText('wait')
})

test('answering one adviser: Reply (or a swipe) addresses the next words to that message', async ({ page }) => {
  await open(page, FAKE_VOICE)
  const first = page.getByTestId('contribution').first()
  const name = (await first.getByTestId('speaker').textContent())!
  await first.getByRole('button', { name: `Answer or mark ${name}` }).click()
  await first.getByRole('button', { name: 'Agree' }).click()
  await expect(page.getByTestId('notes-tray')).toHaveText(/Your mark goes with your next message/)
  // Review of #41: Next question goes as it is; the mark waits for his own words.
  await page.getByTestId('floor-more').click()
  await page.getByRole('button', { name: 'Next question' }).click()
  await expect(page.getByTestId('user').last()).toContainText("Let's move on to the next question.")
  await expect(page.getByTestId('user').last()).not.toContainText('Agree')
  await expect(page.getByTestId('notes-tray')).toBeVisible()
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })
  await first.getByRole('button', { name: `Answer or mark ${name}` }).click()
  await first.getByRole('button', { name: `Answer ${name}` }).click()
  await expect(page.getByTestId('replying')).toContainText(name)
  await page.getByTestId('type-instead').click()
  await page.getByTestId('voice-draft').fill('Which numbers would you look at first?')
  await shot(page, '08-replying')
  await page.getByTestId('voice-send').click()
  const mine = page.getByTestId('user').last()
  await expect(mine).toContainText(`To ${name} (`)
  await expect(mine).toContainText('): Which numbers would you look at first?')
  await expect(mine).toContainText('Agree.')
  await expect(page.getByTestId('replying')).toHaveCount(0)
})

test('a swipe right on a message answers it; a vertical drag scrolls', async ({ page }) => {
  await open(page, FAKE_VOICE)
  const first = page.getByTestId('contribution').first()
  const name = (await first.getByTestId('speaker').textContent())!
  const box = (await first.boundingBox())!
  const swipe = async (dx: number, dy: number) => {
    const x = box.x + 60
    const y = box.y + box.height / 2
    await first.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, isPrimary: true })
    for (let i = 1; i <= 5; i++)
      await first.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 7, clientX: x + (dx * i) / 5, clientY: y + (dy * i) / 5 })
    await first.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, clientX: x + dx, clientY: y + dy })
  }
  await swipe(0, 90)
  await expect(page.getByTestId('replying')).toHaveCount(0)
  await swipe(90, 6)
  await expect(page.getByTestId('replying')).toContainText(name)
})

test('on a phone the words are written down by the gateway, and the status counts the parts', async ({ page }) => {
  await open(page, FAKE_EARS)
  // A slow gateway, as on his phone: each part takes 3 s to be written down.
  await page.route('**/v1/stt', async (route) => {
    await new Promise((r) => setTimeout(r, 3000))
    await route.continue()
  })
  const bar = page.getByTestId('voice-bar')
  await bar.getByTestId('voice-talk').click()
  await expect(status(page)).toContainText('Recording.')
  await speakInto(page, 'the numbers are thin', 800)
  await expect(status(page)).toHaveText(/Writing it down: 1 part left/, { timeout: 5_000 })
  await shot(page, '03-writing')
  await expect(page.getByTestId('draft')).toContainText('the numbers are thin', { timeout: 10_000 })
  await bar.getByTestId('voice-finish').click()
  await expect(bar.getByTestId('voice-send')).toBeEnabled({ timeout: 10_000 })
})

test('typing uses the same draft', async ({ page }) => {
  await open(page, FAKE_VOICE)
  await page.getByTestId('type-instead').click()
  await page.getByTestId('voice-draft').fill('Typed, not said.')
  await shot(page, '09-typing')
  await page.getByTestId('voice-send').click()
  await expect(page.getByTestId('user').last()).toContainText('Typed, not said.')
})

// Review of #41: the rough edge tore the 1.6 px outlines. Shot at DPR 2 and 3 to look at.
for (const dpr of [2, 3]) {
  test(`outlines stay whole at DPR ${dpr}`, async ({ browser }) => {
    test.skip(!process.env.FLOOR_REVIEW, 'a picture to look at, not a check')
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, storageState: test.info().project.use.storageState as never })
    const page = await ctx.newPage()
    await open(page, FAKE_VOICE)
    await page.getByTestId('type-instead').click()
    await page.getByTestId('voice-draft').fill('An outline to look at.')
    await page.getByTestId('voice-bar').screenshot({ path: `${DIR}/10-outlines-dpr${dpr}.png` })
    await ctx.close()
  })
}
