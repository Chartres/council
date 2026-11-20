import { expect, test } from '@playwright/test'
import { FAKE_VOICE, hear } from './fakeVoice'

// Talk mode (flywheel/docs/expansion/council-v4.3.md). Lenka talks with the group: she speaks,
// her words are set as text she can correct, she sends them, the adviser answers aloud sentence
// by sentence, and she cuts in. Nothing is sent by a pause (Pavol, 20 Nov).
// The recogniser and the speech engine are fakes the test drives; the stub cannot speak,
// so every line goes through the browser-engine fallback, which is what the fake records.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
})

type Synth = { spoken: string[]; cancels: number }
const synth = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.speechSynthesis as unknown as Synth)

test('she talks with the group, turn by turn, and cuts in', async ({ page }) => {
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
  await expect(page.getByTestId('talk-status')).toContainText('Recording.')
  expect(await page.evaluate(() => (window as unknown as { __mics: number }).__mics)).toBe(1)

  // She speaks: her words are on screen at once. A pause sends nothing; Finish, then Send does.
  const before = (await synth(page)).spoken.length
  await hear(page, 'the constraint is engineering time')
  await expect(page.getByTestId('voice-draft')).toHaveValue('the constraint is engineering time')
  await page.waitForTimeout(4500) // longer than the old 4 s pause that used to send it
  await expect(page.getByTestId('user')).toHaveCount(0)
  await page.getByTestId('voice-finish').click()
  await page.getByTestId('voice-send').click()
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
  // The browser voice gets each line as the one before it ends (2 s each in the fake).
  await expect.poll(async () => (await synth(page)).spoken.slice(before), { timeout: 20_000 }).toContain(floor)
  const said = (await synth(page)).spoken.slice(before)
  const answer = (await page.getByTestId('contribution').last().locator('.t-body').textContent())!
  expect(said).toEqual([...answer.match(/[^.!?]+[.!?]+/g)!.map((s) => s.trim()), floor])

  // Cut in: one tap stops the audio and opens the mic.
  const cancels = (await synth(page)).cancels
  await page.getByTestId('cut-in').click()
  await expect.poll(async () => (await synth(page)).cancels).toBeGreaterThan(cancels)
  await expect(page.getByTestId('talk-status')).toContainText('Recording.')
  await hear(page, 'wait no')
  await page.getByTestId('voice-finish').click()
  await page.getByTestId('voice-send').click()
  await expect(page.getByTestId('user')).toHaveCount(2, { timeout: 10_000 })
  await expect(page.getByTestId('user').last()).toContainText('wait no')

  // Off: remembered on this device.
  await expect(page.getByTestId('floor')).toHaveCount(3, { timeout: 20_000 })
  await talk.click()
  await expect(page.getByTestId('talk-status')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('council:talk'))).toBe('0')
})
