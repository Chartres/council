import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { FAKE_EARS, FAKE_VOICE, hear, speakInto, tone } from './fakeVoice'

// Pavol, 20 Nov 2026: "the microphone lit up, but nothing happened. And I also don't have a
// sense that actually something is being recorded. So I need a really live feedback where I
// see, yes, what I'm talking is being captured. And if it is not, then I need to know that
// immediately." Later that day: "I did not like this stressful thing that waits for silence",
// and "The functionality of seeing the text and correcting it is super important."
//
// No real microphone is used anywhere here: getUserMedia is replaced by an oscillator stream
// (e2e/fakeVoice.ts). The level the thread draws is real, read by the app's own AnalyserNode.
// VOICE_REVIEW=1 also writes each state to docs/review/2026-11-20-voice/.

const DIR = 'docs/review/2026-11-20-voice'
const GOAL = 'What would you like the group to help you achieve?'
const VIEWPORTS = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
})

const shooter = (page: Page, label: string) => async (name: string) => {
  if (!process.env.VOICE_REVIEW) return
  mkdirSync(DIR, { recursive: true })
  await page.screenshot({ path: `${DIR}/${name}-${label}.png` })
}
const openIntake = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem('council:trust-seen', '1'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByLabel(GOAL)).toBeVisible()
}
const level = (page: Page) => page.getByTestId('thread').evaluate((c) => Number((c as HTMLCanvasElement).dataset.level))
const drawing = (page: Page) => page.getByTestId('thread').evaluate((c) => (c as HTMLCanvasElement).toDataURL())
const flame = (page: Page) => page.locator('.capture-candle .device-flame').evaluate((g) => (g as SVGGElement).style.transform)

for (const [label, viewport] of VIEWPORTS) {
  test(`${label}: arrive at the question, tap, see it record, finish, correct the text, and that text is what goes`, async ({ page }) => {
    test.setTimeout(90_000)
    const shot = shooter(page, label)
    await page.setViewportSize(viewport)
    await page.addInitScript(FAKE_EARS)
    await page.addInitScript(() => ((window as unknown as { __holdMic: boolean }).__holdMic = true))
    await openIntake(page)

    // One primary action: a word button, in reach, 44 px or more.
    const mic = page.getByTestId('mic')
    await expect(mic).toHaveText('Tap and talk')
    expect((await mic.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await shot('01-arrive')

    // The tap asks for the mic at once, and the screen says nothing is recorded yet.
    await mic.click()
    expect(await page.evaluate(() => (window as unknown as { __mics: number }).__mics)).toBe(1)
    const status = page.getByTestId('capture-status')
    await expect(status).toHaveText('Waiting for the microphone. Nothing is recorded yet.')
    await expect(mic).toHaveText('Finish')
    await shot('02-waiting-for-the-microphone')

    await page.evaluate(() => (window as unknown as { __grantMic: () => void }).__grantMic())
    await expect(status).toHaveText('Recording. Say something.')
    await expect(page.getByTestId('device')).toBeVisible()
    expect(await level(page)).toBe(0)
    expect(await flame(page)).toBe('') // nothing to flicker at

    // Sound comes in: the thread moves, the flame flickers, the sentence says so.
    await tone(page, true)
    await expect(status).toHaveText('Recording. I can hear you.')
    await expect.poll(() => level(page)).toBeGreaterThan(0.05)
    const one = await drawing(page)
    await page.waitForTimeout(120)
    expect(await drawing(page)).not.toBe(one)
    expect(await flame(page)).toMatch(/skewX\(.+\) scale\((0\.9[7-9]|1\.0[0-3])\d*, (0\.9[5-9]|1\.0[0-5])\d*\)/)
    await shot('03-recording-i-can-hear-you')

    // The browser pauses audio: said in words; any tap wakes it.
    await page.evaluate(() => (window as unknown as { __ctxs: AudioContext[] }).__ctxs[0]!.suspend())
    await expect(status).toContainText('The browser has paused audio')
    await shot('04-audio-paused')
    await page.getByRole('heading', { name: 'Your question' }).dispatchEvent('pointerdown')
    await expect(status).toContainText('Recording.')

    // He says something and pauses to think: that part is written down while the mic stays open.
    await tone(page, false)
    await speakInto(page, 'decide whether to pilot the tier')
    const goal = page.getByLabel(GOAL)
    await expect(goal).toHaveValue('decide whether to pilot the tier', { timeout: 10_000 })
    await page.waitForTimeout(4000) // a pause longer than any old silence endpoint
    await expect(mic).toHaveText('Finish')
    await expect(status).toHaveText('Recording. Take your time.')
    await shot('05-words-landed-still-recording')

    // Finish ends it. The text is in the ordinary field; one tap puts the cursor in it.
    await mic.click()
    await expect(mic).toHaveText('Tap and talk')
    await expect(page.getByTestId('capture')).toHaveCount(0)
    await goal.click()
    await expect(goal).toBeFocused()
    await goal.fill('Decide whether to pilot the premium tier')
    await shot('06-finished-text-to-correct')

    // Nothing has gone to the group yet; the corrected text is what goes when he says so.
    const sent = page.waitForRequest((r) => r.url().endsWith('/v1/council/start') && r.method() === 'POST')
    await page.getByRole('button', { name: 'Bring it to the group' }).click()
    expect((await sent).postDataJSON().intake.goal).toBe('Decide whether to pilot the premium tier')

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test(`${label}: a silent input is named after 3 s; a blocked mic says how to unblock it`, async ({ page }) => {
    const shot = shooter(page, label)
    await page.setViewportSize(viewport)
    await page.addInitScript(FAKE_EARS)
    await openIntake(page)
    const mic = page.getByTestId('mic')
    await mic.click()
    const status = page.getByTestId('capture-status')
    await expect(status).toHaveText('Recording. Say something.')
    await expect(status).toHaveText('I can’t hear anything from “Test microphone”. Check the input, or speak up.', { timeout: 6000 })
    expect(await level(page)).toBe(0)
    await shot('07-heard-nothing')
    // It is still recording: the moment sound arrives, it says so.
    await tone(page, true)
    await expect(status).toHaveText('Recording. I can hear you.')
    await mic.click()

    await page.evaluate(() => ((window as unknown as { __denyMic: string }).__denyMic = 'NotAllowedError'))
    await mic.click()
    await expect(page.getByTestId('mic-problem')).toContainText('The microphone is blocked for this site.')
    await expect(mic).toHaveText('Tap and talk')
    await shot('08-blocked')
    await page.evaluate(() => ((window as unknown as { __denyMic: string }).__denyMic = 'NotFoundError'))
    await mic.click()
    await expect(page.getByTestId('mic-problem')).toContainText('No microphone found on this device.')
    await shot('09-no-microphone')
  })

  test(`${label}: a Talk turn is record, text, correct, send`, async ({ page }) => {
    test.setTimeout(90_000)
    const shot = shooter(page, label)
    await page.setViewportSize(viewport)
    await page.addInitScript(FAKE_VOICE)
    await openIntake(page)
    await page.getByLabel(GOAL).fill('decide whether to pilot a premium tier')
    await page.getByRole('button', { name: 'Bring it to the group' }).click()
    await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })

    await page.getByTestId('talk').click()
    const bar = page.getByTestId('voice-bar')
    await expect(page.getByTestId('talk-status')).toContainText('Recording.')
    await tone(page, true)
    await expect(page.getByTestId('talk-status')).toHaveText('Recording. I can hear you.')
    await hear(page, 'the constraint is engineering time')
    await page.evaluate(() => (window as unknown as { __forming: (t: string) => void }).__forming('and we have'))
    const draft = page.getByTestId('voice-draft')
    await expect(draft).toHaveValue('the constraint is engineering time')
    await expect(bar.getByTestId('capture-interim')).toHaveText('and we have')
    await shot('10-talk-recording')
    await hear(page, 'and we have two engineers')
    await tone(page, false)

    // A long pause sends nothing.
    await page.waitForTimeout(4500)
    await expect(page.getByTestId('user')).toHaveCount(0)

    await page.getByTestId('voice-finish').click()
    await expect(page.getByTestId('talk-status')).toHaveText('Yours to correct before it goes.')
    await expect(page.getByTestId('user')).toHaveCount(0)
    await draft.fill('The constraint is engineering time: we have three engineers.')
    await shot('11-talk-text-to-correct')

    // Recording again adds to the corrected text.
    await page.getByTestId('voice-more').click()
    await hear(page, 'until March')
    await expect(draft).toHaveValue('The constraint is engineering time: we have three engineers. until March')
    await page.getByTestId('voice-finish').click()
    await draft.fill('The constraint is engineering time: we have three engineers until March.')

    await page.getByTestId('voice-send').click()
    await expect(page.getByTestId('user')).toHaveText(/The constraint is engineering time: we have three engineers until March\./)
    await expect(page.getByTestId('talk-status')).toHaveText(/is talking…$/, { timeout: 15_000 })
    await expect(page.getByTestId('cut-in')).toBeVisible()
    await shot('12-talk-adviser-speaking')

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const b of await bar.getByRole('button').all()) {
      const box = await b.boundingBox()
      if (box) expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test('reduced motion: the flame stands still, the thread still moves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(FAKE_EARS)
  await openIntake(page)
  await page.getByTestId('mic').click()
  await tone(page, true)
  await expect(page.getByTestId('capture-status')).toHaveText('Recording. I can hear you.')
  await expect.poll(() => level(page)).toBeGreaterThan(0.05)
  expect(await flame(page)).toBe('')
  const one = await drawing(page)
  await page.waitForTimeout(120)
  expect(await drawing(page)).not.toBe(one)
})
