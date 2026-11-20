import { expect, test, type Page } from '@playwright/test'
import { FAKE_VOICE, hear } from './fakeVoice'

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

// The six context fields and the import routes sit under one closed row.
const openAbout = (page: Page) => page.getByText(/^About you ·/).click()

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
  await expect(page.getByLabel('What would you like the group to help you achieve?')).toBeVisible()
  await expect(page.getByTestId('trust-note')).toHaveCount(0)
})

test('a reply in our headings fills the fields with no request, then goes to the group', async ({ page }) => {
  const calls = extractCalls(page)
  await openIntake(page)
  await openAbout(page)
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
  await openAbout(page)
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
  await page.getByRole('button', { name: 'Let your AI fill this in' }).click()
  await expect(page.getByTestId('ai-prompt')).toContainText('Write UNKNOWN rather than guessing.')
  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('WORKING_STYLE:')
})

test('tap and talk: one tap at the question, the words land as text, Next question moves on, nothing moves by itself', async ({ page }) => {
  await page.addInitScript(FAKE_VOICE)
  await openIntake(page)
  const goal = page.getByLabel('What would you like the group to help you achieve?')
  const mic = page.getByTestId('mic')
  await expect(mic).toHaveText('Tap and talk')
  await mic.click()
  await expect(page.getByTestId('capture-status')).toContainText('Recording.')
  await hear(page, 'decide on a premium tier')
  await expect(goal).toHaveValue('decide on a premium tier')
  // Nothing is read aloud, and a pause does not move to the next question.
  await page.waitForTimeout(3000)
  await expect(page.getByLabel('What is happening today?')).toBeHidden()
  expect((await page.evaluate(() => (window.speechSynthesis as unknown as { spoken: string[] }).spoken)).filter((t) => t.trim())).toEqual([])

  await page.getByRole('button', { name: 'Next question' }).click()
  await hear(page, 'churn is four percent')
  await expect(page.getByLabel('What is happening today?')).toHaveValue('churn is four percent')
  await expect(goal).toHaveValue('decide on a premium tier')
  expect(await page.evaluate(() => (window as unknown as { __mics: number }).__mics)).toBe(1) // one mic, one permission
  await page.getByTestId('mic').click() // Finish
  await expect(page.getByTestId('mic')).toHaveText('Tap and talk')
  await expect(page.getByTestId('capture')).toHaveCount(0)
})

test('without any mic there is no talk button, and typing is as plain as before', async ({ page }) => {
  await page.addInitScript(`
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis', 'MediaRecorder']) {
      Object.defineProperty(window, name, { value: undefined, configurable: true })
    }
  `)
  await openIntake(page)
  await expect(page.getByTestId('mic')).toHaveCount(0)
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide on a premium tier')
  await expect(page.getByRole('button', { name: 'Bring it to the group' })).toBeEnabled()
})

test('several files at once: read in turn, a big one skipped by name, Materials goes to the group', async ({ page }) => {
  const calls = extractCalls(page)
  await page.addInitScript(() => localStorage.setItem('council:trust-seen', '1'))
  await openIntake(page)
  const pdf = (name: string, size = 20) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(size, 'x') })
  await page
    .getByTestId('file-input')
    .setInputFiles([pdf('Profile.pdf'), pdf('Big.pdf', 5 * 1024 * 1024 + 1), pdf('Plan.pdf')])
  await expect(page.getByTestId('intake-note')).toHaveText(
    'Read 2 files. Filled 3 of 7. Check them below. Skipped Big.pdf: over 5 MB.',
  )
  expect(calls).toHaveLength(2)
  await expect(page.getByLabel('Who are you professionally?')).toHaveValue(/Product manager/)
  await page.getByLabel('Materials').fill('Q3 numbers: churn 4.1%, ARPU flat.')
  await page.screenshot({ path: `${SHOTS}/v43-intake-files.png`, fullPage: true })
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('facilitator').first()).toContainText('premium tier')
})

test('connect from your AI: the MCP address is one tap from the clipboard', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Connect from your AI').click()
  await expect(page.getByText('https://llm.dravec.org/mcp')).toBeVisible()
  await page.getByRole('button', { name: 'Copy' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://llm.dravec.org/mcp')
  await page.screenshot({ path: `${SHOTS}/v43-start-connect.png`, fullPage: true })
})
