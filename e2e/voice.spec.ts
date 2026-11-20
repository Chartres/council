import { expect, test } from '@playwright/test'
import { FAKE_EARS, FAKE_VOICE, fakeSynth, hear, speakInto } from './fakeVoice'

// Voice in and voice out are browser features, so the journey is: present and working
// where the Web Speech API exists, gone without a trace where it does not.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  // The stub holds the one anonymous allowance in memory; each journey starts fresh.
  await request.post('http://localhost:8787/__reset')
})

// A desktop Chrome: live words from the recogniser, a browser voice that ends each line soon after.
const FAKE_SPEECH = FAKE_VOICE + fakeSynth(50)

const NO_SPEECH = `
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis', 'MediaRecorder']) {
    Object.defineProperty(window, name, { value: undefined, configurable: true })
  }
`

test('she dictates her idea and listens to the debate', async ({ page }) => {
  await page.addInitScript(FAKE_SPEECH)
  await page.goto('/quick')

  const mic = page.getByTestId('mic')
  await expect(mic).toBeVisible()
  const box = await mic.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.width).toBeGreaterThanOrEqual(44)

  // A word button, not a bare icon; one tap and she talks.
  await expect(mic).toHaveText('Tap and talk')
  await mic.click()
  await expect(page.getByTestId('capture-status')).toContainText('Recording.')
  await hear(page, 'leaving my job for the parish tool')
  await expect(page.getByLabel('What are you working on?')).toHaveValue('leaving my job for the parish tool')
  await page.screenshot({ path: 'e2e/shots/voice-dictation.png' })
  await expect(mic).toHaveText('Finish')
  await mic.click()
  await expect(mic).toHaveText('Tap and talk')

  await page.getByRole('button', { name: 'Convene the council' }).click()
  // Listen is off until she asks for it (Eyal, 29 Oct); one tap and the room reads aloud.
  const listen = page.getByTestId('listen')
  await expect(listen).toBeVisible()
  await expect(listen).toHaveAttribute('aria-pressed', 'false')
  await listen.click()
  await expect(listen).toHaveAttribute('aria-pressed', 'true')

  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })
  // Each turn spoken as it arrived, the verdict last.
  // The browser voice gets each line as the one before it ends.
  const read = () => page.evaluate(() => (window.speechSynthesis as unknown as { spoken: string[] }).spoken)
  await expect.poll(async () => (await read()).at(-1) ?? '', { timeout: 20_000 }).toContain('The verdict.')
  const spoken = await read()
  expect(spoken.length).toBeGreaterThan(1)
  expect(spoken[spoken.length - 1]).toContain('The verdict.')
  await page.getByTestId('verdict').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/shots/voice-listening.png' })

  // Switching it off is remembered.
  await listen.click()
  await expect(listen).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.getByLabel('What are you working on?')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('council:listen'))).toBe('0')
})

test('no mic and no Listen toggle where the API is missing', async ({ page }) => {
  await page.addInitScript(NO_SPEECH)
  await page.goto('/quick')
  await expect(page.getByLabel('What are you working on?')).toBeVisible()
  await expect(page.getByTestId('mic')).toHaveCount(0)

  await page.getByLabel('What are you working on?').fill('A quiet council, read not heard.')
  await page.getByRole('button', { name: 'Convene the council' }).click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('listen')).toHaveCount(0)
  await expect(page.getByTestId('mic')).toHaveCount(0)
})

test('without a working recogniser the mic records, and the gateway writes it down', async ({ page }) => {
  await page.addInitScript(FAKE_EARS)
  await page.goto('/quick')
  const field = page.getByLabel('What are you working on?')
  await field.fill('Pilot the premium tier.')

  const mic = page.getByTestId('mic')
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await speakInto(page, 'the constraint is engineering time')
  // The words arrive after what she typed, while it is still recording: a pause sends the part
  // to be written down and ends nothing.
  await expect(field).toHaveValue('Pilot the premium tier. the constraint is engineering time', { timeout: 10_000 })
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'false')

  // A refusal from the gateway is said in words, not swallowed.
  await mic.click()
  await speakInto(page, 'QUOTA')
  await expect(page.getByTestId('mic-problem')).toContainText('today’s limit', { timeout: 10_000 })
  await mic.click()
  await page.screenshot({ path: 'e2e/shots/voice-mic-problem.png' })
})
