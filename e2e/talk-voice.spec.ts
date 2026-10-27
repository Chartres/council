import { expect, test, type Page } from '@playwright/test'
import { FAKE_VOICE } from './fakeVoice'

// Talk mode through the gateway's voices (flywheel/docs/expansion/council-v4.3.md), the
// parts a phone depends on: the tap unlocks one shared audio element, each adviser's lines
// ask the gateway for that adviser's voice inside the session, the first sentence plays while
// the turn is still streaming, the room's own voice coming back through the mic is not taken
// as her words, and when the gateway cannot speak the browser engine does.
// The stub gateway serves a tiny WAV per line here (POST /__tts {mode:"on"}). Playback is
// faked: `play()` records the element and the moment, and "ends" each line after 400 ms.

const STUB = 'http://localhost:8787'

const FAKE_AUDIO = `
  window.__audio = { made: 0, els: [], plays: [] }
  const RealAudio = window.Audio
  window.Audio = function (...a) { window.__audio.made++; return new RealAudio(...a) }
  HTMLMediaElement.prototype.play = function () {
    const a = window.__audio
    if (!a.els.includes(this)) a.els.push(this)
    const silent = this.src.startsWith('data:')
    a.plays.push({
      kind: silent ? 'unlock' : 'line',
      el: a.els.indexOf(this),
      inTap: navigator.userActivation ? navigator.userActivation.isActive : null,
      streaming: !!document.querySelector('[data-testid="contribution"][data-streaming]'),
      at: performance.now(),
    })
    if (!silent) setTimeout(() => this.dispatchEvent(new Event('ended')), 400)
    return Promise.resolve()
  }
  HTMLMediaElement.prototype.pause = function () {}
`

type Play = { kind: 'unlock' | 'line'; el: number; inTap: boolean | null; streaming: boolean; at: number }
const audio = (page: Page) =>
  page.evaluate(() => (window as unknown as { __audio: { made: number; els: unknown[]; plays: Play[] } }).__audio).then((a) => ({ made: a.made, els: a.els.length, plays: a.plays }))
const hear = (page: Page, text: string) => page.evaluate((t) => (window as unknown as { __hear: (t: string) => void }).__hear(t), text)
const spokenInBrowser = (page: Page) => page.evaluate(() => (window.speechSynthesis as unknown as { spoken: string[] }).spoken)
type Seen = { text: string; speaker: string | null; session_id: string | null }

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`)
  await request.post(`${STUB}/__tts`, { data: { mode: 'on' } })
})

test('Talk speaks through the gateway: one element unlocked in the tap, adviser voices, first sentence early, echo ignored, browser fallback', async ({ page, request }) => {
  await page.addInitScript(FAKE_VOICE)
  await page.addInitScript(FAKE_AUDIO)
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to pilot a premium tier')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })

  // The tap: the shared element plays the silent clip while the tap's activation is live.
  const before = (await audio(page)).plays.length
  await page.getByTestId('talk').click()
  await expect(page.getByTestId('talk-status')).toHaveText('Listening…')
  const unlock = (await audio(page)).plays.slice(before)
  expect(unlock.map((p) => p.kind)).toEqual(['unlock'])
  expect(unlock[0]!.inTap).toBe(true)
  const seenBefore = ((await (await request.get(`${STUB}/__tts`)).json()) as Seen[]).length

  // She speaks; the adviser's first sentence plays while the turn is still streaming.
  await hear(page, 'the constraint is engineering time')
  await expect(page.getByTestId('user')).toContainText('the constraint is engineering time')
  const talkLines = async () => (await audio(page)).plays.slice(before).filter((p) => p.kind === 'line')
  await expect.poll(async () => (await talkLines()).length, { timeout: 10_000 }).toBeGreaterThan(0)
  const firstLine = (await talkLines())[0]!
  expect(firstLine.streaming).toBe(true)

  // While the room is talking, its own voice through the speaker comes back through the mic:
  // not her message, and the rest of the answer is still spoken.
  const growing = (await page.locator('[data-testid="contribution"][data-streaming] .t-body').textContent())!
  const firstSentence = growing.match(/[^.!?]+[.!?]+/)![0].trim().toLowerCase().replace(/[.,!?]/g, '')
  await hear(page, firstSentence)
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })
  const answer = (await page.getByTestId('contribution').last().locator('.t-body').textContent())!
  await page.waitForTimeout(1600) // past the 1.2 s pause that would have sent it
  await expect(page.getByTestId('user')).toHaveCount(1)

  // Every line asked for a voice inside this session: the adviser's for theirs, the
  // facilitator's for the question. All on one element, made once.
  const seen = ((await (await request.get(`${STUB}/__tts`)).json()) as Seen[]).slice(seenBefore)
  const floor = (await page.getByTestId('floor').last().textContent())!.trim()
  expect(seen.length).toBeGreaterThanOrEqual(2)
  expect(seen.every((s) => s.session_id && s.session_id.startsWith('stub-'))).toBe(true)
  expect(seen.find((s) => s.text === floor)?.speaker).toBe('facilitator')
  const advisers = seen.filter((s) => s.speaker !== 'facilitator')
  expect(advisers.length).toBeGreaterThan(0)
  expect(new Set(advisers.map((s) => s.speaker)).size).toBe(1) // a voice turn is one adviser
  expect(advisers.map((s) => s.text).join(' ')).toBe(answer.trim())
  const a = await audio(page)
  expect(a.made).toBe(1)
  expect(a.els).toBe(1)

  // The gateway cannot speak: the same lines go to the browser engine instead of silence.
  await request.post(`${STUB}/__tts`, { data: { mode: 'fail' } })
  const browserBefore = (await spokenInBrowser(page)).length
  const linesBefore = (await talkLines()).length
  await hear(page, 'what about hiring a contractor')
  await expect(page.getByTestId('floor')).toHaveCount(3, { timeout: 20_000 })
  const floor3 = (await page.getByTestId('floor').last().textContent())!.trim()
  await expect.poll(async () => (await spokenInBrowser(page)).slice(browserBefore), { timeout: 15_000 }).toContain(floor3)
  expect((await talkLines()).length).toBe(linesBefore)
})
