import { expect, test, type Page } from '@playwright/test'

// v4.1 intake, one screen (flywheel/docs/expansion/council-v4.1.md). Marta is a product
// manager; she pastes what her AI wrote about her, drops her LinkedIn PDF, or talks it
// through, checks the seven fields and brings it to the group.

const STUB = 'http://localhost:8787'
const SHOTS = process.env.SHOTS_DIR ?? 'e2e/shots'

test.use({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] })

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`)
})

function extractCalls(page: Page) {
  const calls: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/intake/extract')) calls.push(r.headers()['content-type'] ?? '')
  })
  return calls
}

const openIntake = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
}

test('trust note on first visit, dismissed for good; its link opens What we store', async ({ page }) => {
  await openIntake(page)
  const note = page.getByTestId('trust-note')
  await expect(note).toContainText('The advisers are AI.')
  await expect(note).toContainText('deletes them within 30 days')
  await page.screenshot({ path: `${SHOTS}/v41-intake-phone.png`, fullPage: true })
  await note.getByRole('link', { name: 'What we store' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { name: 'What we store' })).toBeVisible()

  await openIntake(page)
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(note).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByLabel('Who are you professionally?')).toBeVisible()
  await expect(page.getByTestId('trust-note')).toHaveCount(0)
})

test('a reply in our headings fills the fields with no request, then goes to the group', async ({ page }) => {
  const calls = extractCalls(page)
  await openIntake(page)
  await page.getByLabel('Bring what you have').fill(
    'ROLE: Product manager\nORGANIZATION: Logistics software, owns pricing\nGOAL: decide on a premium tier\nSITUATION: UNKNOWN',
  )
  await page.getByRole('button', { name: 'Read it' }).click()
  await expect(page.getByTestId('intake-note')).toHaveText('Filled 3 of 7. Check them below.')
  await expect(page.getByLabel('Who are you professionally?')).toHaveValue('Product manager')
  await expect(page.getByLabel('What is happening today?')).toHaveValue('')
  expect(calls).toEqual([])
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('facilitator').first()).toContainText('decide on a premium tier')
})

test('plain text and a dropped file go to the gateway; URLs and wrong files get a hint', async ({ page }) => {
  const calls = extractCalls(page)
  await openIntake(page)
  const box = page.getByLabel('Bring what you have')

  await box.fill('https://www.linkedin.com/in/marta')
  await page.getByRole('button', { name: 'Read it' }).click()
  await expect(page.getByTestId('intake-note')).toContainText('More → Save to PDF')
  await box.fill('https://example.com/about')
  await page.getByRole('button', { name: 'Read it' }).click()
  await expect(page.getByTestId('intake-note')).toHaveText('Paste the text of the page, or drop a file.')
  expect(calls).toEqual([])

  await box.fill('I manage pricing for a software company and want to decide on a premium tier.')
  await page.getByRole('button', { name: 'Read it' }).click()
  await expect(page.getByLabel('Where do you work?')).toHaveValue(/logistics firms/)
  expect(calls[0]).toContain('application/json')

  await page.getByLabel('Who are you professionally?').fill('')
  await page.getByTestId('file-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('x') })
  await expect(page.getByTestId('intake-note')).toHaveText('Drop a PDF, DOCX or TXT file.')
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'Profile.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') })
  await expect(page.getByLabel('Who are you professionally?')).toHaveValue(/Product manager/)
  expect(calls[1]).toContain('multipart/form-data')
})

test('ask your AI: the prompt is one tap from the clipboard', async ({ page }) => {
  await openIntake(page)
  await page.getByRole('button', { name: 'Ask your AI' }).click()
  await expect(page.getByTestId('ai-prompt')).toContainText('Write UNKNOWN rather than guessing.')
  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('WORKING_STYLE:')
})

test('talk it through: the facilitator asks each empty field aloud and the answers fill in', async ({ page }) => {
  await page.addInitScript(`
    class FakeRecognition {
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [Object.assign([{ transcript: 'spoken answer' }], { isFinal: true })] })
          this.onend?.()
        }, 20)
      }
      stop() { this.onend?.() }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition })
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognition })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(t) { this.text = t } } })
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        spoken: [],
        speak(u) { this.spoken.push(u.text); setTimeout(() => u.onend?.(), 10) },
        cancel() {},
        getVoices() { return [{ lang: 'en-GB' }] },
      },
    })
  `)
  await openIntake(page)
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide on a premium tier')
  await page.getByRole('button', { name: 'Talk it through' }).click()
  await expect(page.getByLabel('How would you like the group to work with you?')).toHaveValue('spoken answer')
  await expect(page.getByTestId('voice-bar')).toHaveCount(0)
  await expect(page.getByLabel('Who are you professionally?')).toHaveValue('spoken answer')
  // The filled field was not asked again.
  await expect(page.getByLabel('What would you like the group to help you achieve?')).toHaveValue('decide on a premium tier')
  const spoken = await page.evaluate(() => (window.speechSynthesis as unknown as { spoken: string[] }).spoken)
  expect(spoken).toHaveLength(6)
  expect(spoken[0]).toBe('Who are you professionally?')
})

test('talk it through without voice support focuses each empty field in turn', async ({ page }) => {
  await page.addInitScript(`
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis']) {
      Object.defineProperty(window, name, { value: undefined, configurable: true })
    }
  `)
  await openIntake(page)
  await page.getByRole('button', { name: 'Talk it through' }).click()
  await expect(page.getByLabel('Who are you professionally?')).toBeFocused()
  await page.keyboard.type('Product manager')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Where do you work?')).toBeFocused()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByLabel('What would you like the group to help you achieve?')).toBeFocused()
  await page.getByRole('button', { name: 'Stop talking' }).click()
  await expect(page.getByTestId('voice-bar')).toHaveCount(0)
})
