import { expect, test } from '@playwright/test'
import { FAKE_VOICE } from './fakeVoice'

// Talk mode (flywheel/docs/expansion/council-v4.3.md). Lenka puts the phone down and talks:
// she speaks, the adviser answers aloud sentence by sentence, she cuts in, and nothing is typed.
// The recogniser and the speech engine are fakes the test drives; the stub cannot speak,
// so every line goes through the browser-engine fallback, which is what the fake records.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
})

type Synth = { spoken: string[]; cancels: number }
const synth = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.speechSynthesis as unknown as Synth)

test('she talks with the group hands-free and cuts in', async ({ page }) => {
  await page.addInitScript(FAKE_VOICE)
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to pilot a premium tier')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })

  // Listen and Talk are both off until she taps one; Listen is a chip beside Talk.
  const talk = page.getByTestId('talk')
  await expect(page.getByTestId('listen')).toHaveAttribute('aria-pressed', 'false')
  await expect(talk).toHaveAttribute('aria-pressed', 'false')
  await talk.click()
  await expect(talk).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('talk-status')).toHaveText('Listening…')
  expect(await page.evaluate(() => (window as unknown as { __started: number }).__started)).toBe(1)

  // She speaks; after the pause it goes as her message, and an adviser answers as it streams.
  const before = (await synth(page)).spoken.length
  await page.evaluate(() => (window as unknown as { __hear: (t: string) => void }).__hear('the constraint is engineering time'))
  await expect(page.getByTestId('user')).toContainText('the constraint is engineering time')
  const growing = page.locator('[data-testid="contribution"][data-streaming]')
  await expect(growing).toBeVisible({ timeout: 10_000 })
  await expect(growing.locator('.t-body')).not.toBeEmpty()
  await expect(page.getByTestId('talk-status')).toHaveText(/is talking…$/)
  await growing.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/shots/talk-mode.png' })

  // Sentence by sentence in the adviser's voice, then the question in the facilitator's.
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })
  await expect(growing).toHaveCount(0)
  const floor = await page.getByTestId('floor').last().textContent()
  await expect.poll(async () => (await synth(page)).spoken.slice(before)).toContain(floor)
  const said = (await synth(page)).spoken.slice(before)
  const answer = (await page.getByTestId('contribution').last().locator('.t-body').textContent())!
  expect(said).toEqual([...answer.match(/[^.!?]+[.!?]+/g)!.map((s) => s.trim()), floor])

  // Barge-in: two words over the audio stop it.
  const cancels = (await synth(page)).cancels
  await page.evaluate(() => (window as unknown as { __hear: (t: string) => void }).__hear('wait no'))
  await expect.poll(async () => (await synth(page)).cancels).toBeGreaterThan(cancels)
  await expect(page.getByTestId('user')).toHaveCount(2, { timeout: 10_000 })
  await expect(page.getByTestId('user').last()).toContainText('wait no')

  // Off: remembered on this device.
  await expect(page.getByTestId('floor')).toHaveCount(3, { timeout: 20_000 })
  await talk.click()
  await expect(page.getByTestId('talk-status')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('council:talk'))).toBe('0')
})
