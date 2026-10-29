import { expect, test } from '@playwright/test'
import { FAKE_EARS, FAKE_VOICE } from './fakeVoice'

// Talk on an iPhone (Eyal, 11 and 29 Oct: "it doesn't catch my voice"): Safari's recogniser
// hears nothing there, so the mic records and the gateway writes it down. The room and she take
// turns: the mic is open while the room is quiet and shut while an adviser speaks.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
})

type W = { __speak: (t: string, ms?: number) => void; __clips: number }

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
  await expect(page.getByTestId('talk-status')).toHaveText('Listening…')
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__clips)).toBe(1)

  // She speaks, then pauses: the clip goes to the gateway and comes back as her message.
  await page.evaluate(() => (window as unknown as W).__speak('the constraint is engineering time'))
  await expect(page.getByTestId('user')).toContainText('the constraint is engineering time', { timeout: 10_000 })

  // The adviser answers aloud; the mic stays shut and Cut in is offered.
  await expect(page.getByTestId('talk-status')).toHaveText(/is talking…$/, { timeout: 10_000 })
  await expect(page.getByTestId('cut-in')).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/talk-iphone.png' })
  const clipsWhileTalking = await page.evaluate(() => (window as unknown as W).__clips)
  expect(clipsWhileTalking).toBe(1)

  // When the room is done (the floor question read), her turn opens again by itself.
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.getByTestId('talk-status')).toHaveText('Listening…', { timeout: 20_000 })
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__clips)).toBe(2)
})
