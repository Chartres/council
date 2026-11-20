import { expect, test } from '@playwright/test'
import { FAKE_VOICE, hear } from './fakeVoice'

// The voice player bar (Pavol, 8 Nov): a fixed bar at the bottom, like a podcast's "now playing"
// bar. It says which question the room is on and what is happening; the line being spoken is
// marked on screen; pause holds the room and resumes it; previous/next and the question list
// steer the facilitator. Her turn (Pavol, 20 Nov): Finish ends the recording, the words are
// text she can correct, Send sends them. Every control is an icon with its word.

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
})

for (const [label, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['laptop', { width: 1280, height: 800 }],
] as const) {
  test(`voice bar on a ${label}: where we are, the spoken line marked, pause and resume, previous question`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(FAKE_VOICE)
    await page.goto('/')
    await page.getByRole('button', { name: 'Begin' }).click()
    await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to pilot a premium tier')
    await page.getByRole('button', { name: 'Bring it to the group' }).click()
    await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })

    await page.getByTestId('talk').click()
    const bar = page.getByTestId('voice-bar')
    await expect(bar).toBeVisible()
    await expect(page.getByTestId('voice-where')).toContainText('Question 1')
    await expect(page.getByTestId('talk-status')).toContainText('Recording.')
    await expect(page.getByTestId('voice-finish')).toBeEnabled()
    await expect(bar.getByTestId('thread')).toBeVisible()
    await expect(bar.getByTestId('candle')).toBeVisible()
    // No bare icons: every button in the bar carries a word.
    for (const b of await bar.getByRole('button').all()) expect((await b.innerText()).trim()).not.toBe('')

    // She speaks, finishes and sends; the adviser's line is marked as it is spoken.
    await hear(page, 'the constraint is engineering time')
    await page.getByTestId('voice-finish').click()
    await expect(page.getByTestId('talk-status')).toHaveText('Read it over. Tap your words to correct them.')
    await page.getByTestId('voice-send').click()
    await expect(page.getByTestId('user')).toContainText('the constraint is engineering time')
    await expect(page.getByTestId('now-speaking')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('talk-status')).toHaveText(/, sentence \d of \d$/)
    await page.screenshot({ path: `e2e/shots/voice-bar-speaking-${label}.png` })

    // Pause: the room holds and says so; resume carries on.
    await page.getByTestId('voice-pause').click()
    await expect(page.getByTestId('talk-status')).toHaveText('Paused.')
    await expect(page.getByTestId('voice-resume')).toBeVisible()
    await page.screenshot({ path: `e2e/shots/voice-bar-paused-${label}.png` })
    await page.getByTestId('voice-resume').click()
    await expect(page.getByTestId('talk-status')).not.toHaveText('Paused.')

    // The second question arrives; the list shows both, and going back is one tap.
    await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 30_000 })
    await expect(page.getByTestId('voice-where')).toContainText('Question 2')
    await page.getByTestId('voice-where').click()
    await expect(page.getByTestId('voice-questions').getByRole('listitem')).toHaveCount(2)
    await page.screenshot({ path: `e2e/shots/voice-bar-questions-${label}.png` })
    await page.getByTestId('voice-questions').getByRole('button').first().click()
    await expect(page.getByTestId('user').last()).toContainText("Let's go back to this question")

    // Nothing sits under the bar: no sideways scroll, and the bar's targets are 44 px.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const b of await bar.getByRole('button').all()) {
      const box = await b.boundingBox()
      if (box) expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })
}
