import { expect, test } from '@playwright/test'

// Voice in and voice out are browser features, so the journey is: present and working
// where the Web Speech API exists, gone without a trace where it does not.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  // The stub holds the one anonymous allowance in memory; each journey starts fresh.
  await request.post('http://localhost:8787/__reset')
})

const FAKE_SPEECH = `
  class FakeRecognition {
    start() {
      setTimeout(() => {
        this.onresult?.({
          results: [Object.assign([{ transcript: 'leaving my job for the parish tool' }], { isFinal: true })],
        })
        this.onend?.()
      }, 10)
    }
    stop() { this.onend?.() }
    abort() {}
  }
  // Chromium ships the standard global too, and the app prefers it — stub both.
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition })
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognition })
  // The fake engine owns its utterance type too — a real one rejects a fake voice object.
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: class { constructor(text) { this.text = text } },
  })
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      spoken: [],
      speak(u) { this.spoken.push(u.text) },
      cancel() {},
      getVoices() { return [{ lang: 'en-GB' }] },
    },
  })
`

const NO_SPEECH = `
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis']) {
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

  await mic.click()
  await expect(page.getByLabel('What are you working on?')).toHaveValue(
    'leaving my job for the parish tool',
  )
  await page.screenshot({ path: 'e2e/shots/voice-dictation.png' })

  await page.getByRole('button', { name: 'Convene the council' }).click()
  const listen = page.getByTestId('listen')
  await expect(listen).toBeVisible()
  await expect(listen).toHaveAttribute('aria-pressed', 'false')
  await listen.click()
  await expect(listen).toHaveAttribute('aria-pressed', 'true')

  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })
  // Each turn spoken as it arrived, the verdict last.
  const spoken: string[] = await page.evaluate(
    () => (window.speechSynthesis as unknown as { spoken: string[] }).spoken,
  )
  expect(spoken.length).toBeGreaterThan(1)
  expect(spoken[spoken.length - 1]).toContain('The verdict.')
  await page.getByTestId('verdict').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/shots/voice-listening.png' })

  // The toggle is remembered.
  await page.reload()
  await expect(page.getByLabel('What are you working on?')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('council:listen'))).toBe('1')
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
