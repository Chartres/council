import { expect, test } from '@playwright/test'
import { FAKE_EARS, FAKE_VOICE, speakInto } from './fakeVoice'

// Talk on an iPhone (Eyal, 11 and 29 Oct: "it doesn't catch my voice"): Safari's recogniser
// hears nothing there, so the mic records and the gateway writes it down. The room and she take
// turns: the mic is open while the room is quiet and shut while an adviser speaks.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
})

type W = { __mics: number }
const mics = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as W).__mics)
/** Her turn on the phone: speak, see the words, finish, send. */
const say = async (page: import('@playwright/test').Page, text: string) => {
  await speakInto(page, text)
  await expect(page.getByTestId('voice-draft')).toHaveValue(text, { timeout: 10_000 })
  await page.getByTestId('voice-finish').click()
  await page.getByTestId('voice-send').click()
}

test('she talks with the group through the gateway, turn by turn', async ({ page }) => {
  // FAKE_VOICE brings the speaker the stub cannot be (each line "plays" 2 s); FAKE_EARS then
  // takes the recogniser away and gives the phone a recorder and a loudness meter.
  await page.addInitScript(FAKE_VOICE)
  await page.addInitScript(FAKE_EARS)
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to pilot a premium tier')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })

  const talk = page.getByTestId('talk')
  await talk.click()
  await expect(page.getByTestId('talk-status')).toContainText('Recording.')
  await expect.poll(() => mics(page)).toBe(1)

  // She speaks, then pauses: that part comes back from the gateway as text while the mic is
  // still open. She finishes and sends it herself.
  await say(page, 'the constraint is engineering time')
  await expect(page.getByTestId('user')).toContainText('the constraint is engineering time', { timeout: 10_000 })

  // The adviser answers aloud; the mic stays shut and Cut in is offered.
  await expect(page.getByTestId('talk-status')).toHaveText(/is talking…$/, { timeout: 10_000 })
  await expect(page.getByTestId('cut-in')).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/talk-iphone.png' })
  expect(await mics(page)).toBe(1)

  // When the room is done (the floor question read), her turn opens again by itself.
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.getByTestId('talk-status')).toContainText('Recording.', { timeout: 20_000 })
  await expect.poll(() => mics(page)).toBe(2)
})

// Eyal, 30 Oct: the read-aloud voice on his iPhone was robotic. That is the browser's voice,
// which used to read any line the gateway could not. On an iPhone the line now stays as text,
// the room moves on, and the bar offers the gateway voice again on a tap.
const IPHONE = `
  Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' })
  Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' })
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 })
`

test('a line the gateway cannot voice is not read by the browser voice; Tap to hear tries again', async ({ page, request }) => {
  await request.post('http://localhost:8787/__tts', { data: { mode: 'fail' } })
  await page.addInitScript(FAKE_VOICE)
  await page.addInitScript(FAKE_EARS)
  await page.addInitScript(IPHONE)
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to pilot a premium tier')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })

  await page.getByTestId('talk').click()
  await expect.poll(() => mics(page)).toBe(1)
  await say(page, 'the constraint is engineering time')

  // The answer arrives; nothing is spoken by the browser, and her turn comes back by itself.
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })
  const missed = page.getByTestId('voice-missed')
  await expect(missed).toHaveText(/Voice did not load\. The text is above\./, { timeout: 20_000 })
  await expect(page.getByTestId('talk-status')).toContainText('Recording.', { timeout: 20_000 })
  const spoken = await page.evaluate(() => (window.speechSynthesis as unknown as { spoken: string[] }).spoken)
  expect(spoken.filter((t) => t.trim())).toEqual([])
  await page.screenshot({ path: 'e2e/shots/voice-bar-missed-phone.png' })

  // One tap asks the gateway again for the last line it missed (the floor question).
  const asked = async () => ((await (await request.get('http://localhost:8787/__tts')).json()) as { text: string }[]).length
  const before = await asked()
  await request.post('http://localhost:8787/__tts', { data: { mode: 'on' } })
  const retry = page.getByRole('button', { name: 'Tap to hear' })
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await retry.click()
  await expect.poll(asked).toBe(before + 1)
  await expect(missed).toHaveCount(0)
})
