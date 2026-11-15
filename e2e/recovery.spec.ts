import { expect, test } from '@playwright/test'
import { STUB_PASSWORD } from '../playwright.config'

// Eyal, 30 Oct (feedback a452794d): "I try to login from my laptop … When I try to put the
// code, I got it asking for the password, but not for the code." Getting back in on a new
// device, end to end: no beta key and no session in this browser, the door, the account icon,
// the email, the six-digit code typed (not the link), the beta password once, and his own past
// discussion waiting. Runs against the auth build (:4175) and the stub Supabase (:8788),
// which "emails" the code to GET /__otp.

const APP = 'http://localhost:4175'
const SB = 'http://localhost:8788'
const SHOTS = process.env.SHOTS_DIR ?? 'e2e/shots'
const EYAL = { id: '33333333-3333-4333-8333-333333333333', email: 'eyal@test.dravec.org' }

test.use({ viewport: { width: 1280, height: 800 }, storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ request }) => {
  await request.post('http://localhost:8787/__reset')
  await request.post(`${SB}/__reset`)
  await request.post(`${SB}/__seed`, {
    data: {
      users: [EYAL],
      rows: {
        council_sessions: [
          {
            id: 's-eyal',
            user_id: EYAL.id,
            roster: 'classics',
            advisers: ['seneca'],
            intake: { goal: 'Hire a first engineer' },
            transcript: [{ kind: 'contribution', speaker: 'seneca', text: 'Hire for the work, not the title.' }],
            created_at: '2026-10-28T09:00:00Z',
            ended_at: null,
          },
        ],
      },
    },
  })
})

test('a new laptop: sign in from the door with the emailed code, no beta password, and the past discussion is there', async ({ page, request }) => {
  await page.goto(APP)
  const door = page.getByTestId('password-panel')
  await expect(door).toBeVisible()
  // The door says it is not the account sign-in, and offers that as the second way in.
  await expect(page.getByTestId('password-vs-account')).toContainText('not your account sign-in')

  // From the door → email → the panel asks for the code, never a password.
  await door.getByRole('button', { name: 'Have an account? Sign in' }).click()
  await door.getByLabel('Email').fill(EYAL.email)
  await door.getByRole('button', { name: 'Send link' }).click()
  const code = door.getByLabel('Code from the email')
  await expect(code).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/recovery-code-laptop.png` })

  // A wrong code is said in words and the field stays.
  await code.fill('000000')
  await door.getByRole('button', { name: 'Use code' }).click()
  await expect(door.getByRole('alert')).toContainText('didn’t work')

  const { code: sent } = (await (await request.get(`${SB}/__otp?email=${EYAL.email}`)).json()) as { code: string }
  await code.fill(sent)
  await door.getByRole('button', { name: 'Use code' }).click()

  // Signed in: the door goes away by itself; the gateway takes his token in place of the password.
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible()
  await expect(door).toHaveCount(0, { timeout: 20_000 })
  expect(await page.evaluate(() => localStorage.getItem('council:key'))).toBeNull()

  // His discussion from the other device is in the Discussions sheet.
  await page.getByRole('button', { name: 'Discussions' }).click()
  await expect(page.getByText('Hire a first engineer')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/recovery-discussions-laptop.png` })

  // And a council starts on the token alone.
  await page.keyboard.press('Escape')
  await page.goto(APP)
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to hire')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  await expect(page.getByTestId('floor')).toHaveCount(1, { timeout: 20_000 })
})

test('the door at phone width offers the account sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(APP)
  const door = page.getByTestId('password-panel')
  await door.getByRole('button', { name: 'Have an account? Sign in' }).click()
  await expect(door.getByLabel('Email')).toBeVisible()
  const box = await door.getByRole('button', { name: 'Have an account? Sign in' }).boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: `${SHOTS}/recovery-door-sign-in-phone.png`, fullPage: true })
})
