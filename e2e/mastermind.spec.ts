import { expect, test, type Page } from '@playwright/test'

// v4 persona journeys (flywheel/docs/expansion/council-v4.md). Lenka runs product at a
// 40-person SaaS company; she wants the group to help her decide whether to pilot a
// premium tier, and she wants to leave with a decision and a date, not a transcript.
// Screenshots at 390 px land in e2e/shots/.

const STUB = 'http://localhost:8787'

test.use({
  viewport: { width: 390, height: 844 },
  permissions: ['clipboard-read', 'clipboard-write'],
})

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`)
})

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

const settle = (page: Page) => page.waitForTimeout(400) // let the 320 ms fade-up finish

test('Business roster → intake → three turns with controls → capture → commitment with reminder', async ({
  page,
}) => {
  await page.goto('/')
  // Business is the default roster: four advisers ticked, each labelled as a simulation.
  await expect(page.getByRole('button', { name: 'Business' })).toHaveAttribute('aria-pressed', 'true')
  for (const name of ['Peter Drucker', 'Steve Jobs', 'Andy Grove']) {
    await expect(page.getByText(`Simulation inspired by ${name}`)).toBeVisible()
  }
  await expect(page.getByRole('button', { pressed: true, name: /Socrates/ })).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/v4-start.png' })
  await page.getByRole('button', { name: 'Begin' }).click()

  // Intake: one screen. She types two of the seven fields and goes.
  await page.getByText(/^About you ·/).click()
  await page.getByLabel('Who are you professionally?').fill('Head of product, 8 years in B2B SaaS.')
  await page.getByLabel('What would you like the group to help you achieve?').fill('decide whether to pilot a premium tier')
  await page.screenshot({ path: 'e2e/shots/v4-intake.png' })
  await page.getByRole('button', { name: 'Bring it to the group' }).click()

  // Turn 1: the facilitator recaps the intake, two advisers speak, the floor opens.
  await expect(page.getByTestId('facilitator').first()).toContainText('pilot a premium tier')
  await expect(page.getByTestId('contribution')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.getByTestId('floor')).toHaveCount(1)
  await expect(page.getByTestId('streaming')).toHaveCount(0, { timeout: 20_000 })
  await settle(page)
  await page.screenshot({ path: 'e2e/shots/v4-conversation.png' })
  expect(await noOverflow(page)).toBeLessThanOrEqual(1)

  // Turn 2: she answers in her own words; three speakers this time.
  await page.getByLabel('Your turn').fill('The constraint is engineering time, not demand.')
  await page.getByRole('button', { name: 'Say it' }).click()
  await expect(page.getByTestId('user')).toContainText('The constraint is engineering time')
  await expect(page.getByTestId('floor')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.getByTestId('contribution')).toHaveCount(5)
  await expect(page.getByText('confidence 70').first()).toBeVisible()

  // Turn 3: a control chip, and the group offers a proposal.
  await page.getByRole('button', { name: 'Make this concrete' }).click()
  const proposal = page.getByTestId('proposal').first()
  await expect(proposal).toBeVisible({ timeout: 20_000 })
  await expect(proposal).toContainText('two-week pilot')
  await expect(page.getByTestId('streaming')).toHaveCount(0, { timeout: 20_000 })

  // "Go back to Grove's point" steers without typing; it lives under More.
  await page.getByRole('button', { name: 'More ›' }).click()
  await page.getByLabel('Go back to').selectOption('grove')
  await expect(page.getByText("Back to Grove's point.")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('streaming')).toHaveCount(0, { timeout: 20_000 })

  // "Capture that decision" brings an editable entry; she edits and accepts it.
  await page.getByRole('button', { name: 'Capture that decision' }).click()
  const captured = page.getByTestId('proposal').nth(1)
  await expect(captured).toContainText('Talk to Sven', { timeout: 20_000 })
  await captured.getByLabel('Decision').fill('Talk to Sven before committing budget to the premium pilot.')
  await captured.getByRole('button', { name: 'Accept → journal' }).click()
  await expect(captured).toContainText('In your journal')

  // Commitment: a date and an opt-in email reminder.
  await captured.getByLabel('Due').fill('2026-10-15')
  await captured.getByLabel('Remind me by email on that day').check()
  await captured.scrollIntoViewIfNeeded()
  await settle(page)
  await page.screenshot({ path: 'e2e/shots/v4-commit.png' })
  await captured.getByRole('button', { name: 'Commit' }).click()
  await expect(captured.getByTestId('committed')).toHaveText('Committed by 2026-10-15 · email reminder on')

  // The in-stream proposal can wait.
  await proposal.getByRole('button', { name: 'Not yet' }).click()
  await expect(proposal).toContainText('Proposal · not yet')

  // Journal: the edited decision, its commitment with the reminder on, and an export.
  await page.getByRole('button', { name: /^Journal · 1$/ }).click()
  const journal = page.getByTestId('journal')
  await expect(journal).toContainText('Talk to Sven before committing budget to the premium pilot.')
  await expect(page.getByTestId('commitment')).toContainText('by 2026-10-15')
  await expect(page.getByTestId('commitment').getByLabel('Remind me by email')).toBeChecked()
  await page.getByRole('button', { name: 'Export (copy as text)' }).click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('Talk to Sven before committing budget')
  expect(clip).toContain('by 2026-10-15')
  await page.screenshot({ path: 'e2e/shots/v4-journal.png' })

  // Anonymous: it was kept in this browser.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('council:journal')!))
  expect(stored.commitments[0]).toMatchObject({ due_date: '2026-10-15', remind: true, outcome: null })
  expect(stored.lastIntake.goal).toBe('decide whether to pilot a premium tier')
})

test('Classics roster, quick path: no intake, straight to the group, then wrap up', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Classics' }).click()
  await expect(page.getByText('Simulation inspired by')).toHaveCount(0)
  await expect(page.getByRole('button', { pressed: true, name: /Seneca/ })).toBeVisible()
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByRole('button', { name: 'Bring it to the group' }).click()

  await expect(page.getByTestId('facilitator').first()).toContainText('Welcome')
  await expect(page.getByTestId('contribution').first()).toContainText('Socrates')
  await expect(page.getByTestId('streaming')).toHaveCount(0, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Wrap up' }).click()
  await expect(page.getByTestId('proposal')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Open the journal' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Say it' })).toHaveCount(0)
})

test('"Last time…": remembered journal opens the session, and the outcome writes back', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('council:journal')) return // only seed the first load
    localStorage.setItem(
      'council:journal',
      JSON.stringify({
        entries: [
          {
            id: 'e1',
            decision: 'Pilot the premium tier with five customers.',
            reasoning: 'Demand is the open question.',
            assumptions: [],
            next_action: 'talk to Sven',
            owner: 'Lenka',
            review_trigger: 'Thursday',
            confidence: 60,
            status: 'accepted',
            created_at: '2026-10-01T09:00:00.000Z',
          },
        ],
        commitments: [{ id: 'c1', journal_id: 'e1', what: 'talk to Sven', due_date: '2026-10-09', remind: true, outcome: null }],
        lastIntake: { role: 'Head of product', goal: 'decide on a premium tier' },
      }),
    )
  })
  await page.goto('/')
  const card = page.getByTestId('last-time')
  await expect(card).toContainText('Pilot the premium tier with five customers.')
  await expect(card).toContainText('You said you’d talk to Sven by 2026-10-09')
  await page.screenshot({ path: 'e2e/shots/v4-last-time.png' })

  // The stable fields (role, organization, working style) come back on their own; the goal does not.
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByLabel('Who are you professionally?')).toHaveValue('Head of product')
  await expect(page.getByLabel('What would you like the group to help you achieve?')).toHaveValue('')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()

  await expect(page.getByTestId('facilitator').first()).toContainText(
    "Last time we talked about Pilot the premium tier with five customers; you said you'd talk to Sven by 2026-10-09",
  )
  await expect(page.getByTestId('streaming')).toHaveCount(0, { timeout: 20_000 })
  await settle(page)
  await page.screenshot({ path: 'e2e/shots/v4-last-time-opener.png' })

  // Back on the journal, she marks it done; it is written back and leaves "Last time".
  await page.getByRole('button', { name: /^Journal/ }).click()
  await page.getByTestId('commitment').getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('commitment')).toContainText('· done')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('council:journal')!))
  expect(stored.commitments[0].outcome).toBe('done')
  expect(stored.entries[0].status).toBe('done')
})

test('a reminder deep link records the outcome and opens a session with that memory', async ({ page }) => {
  // Anonymous + a commitment this browser holds: no sign-in needed (signed-in path
  // reads Supabase instead; parsing is unit-tested in src/domain/mastermind.test.ts).
  await page.addInitScript(() => {
    if (localStorage.getItem('council:journal')) return
    localStorage.setItem(
      'council:journal',
      JSON.stringify({
        entries: [{ id: 'e1', decision: 'Pilot with five.', reasoning: '', assumptions: [], next_action: 'talk to Sven', owner: 'me', review_trigger: 'Thu', confidence: null, status: 'accepted', created_at: '2026-10-01T09:00:00.000Z' }],
        commitments: [{ id: 'c1', journal_id: 'e1', what: 'talk to Sven', due_date: '2026-10-09', remind: true, outcome: null }],
        lastIntake: null,
      }),
    )
  })
  await page.goto('/c/c1?outcome=later')
  await expect(page.getByTestId('facilitator').first()).toContainText("you said you'd talk to Sven", { timeout: 20_000 })
  await expect(page).toHaveURL(/\/$/)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('council:journal')!))
  expect(stored.commitments[0].outcome).toBe('later')
})

test('an unknown deep link while signed out asks to sign in first', async ({ page }) => {
  await page.goto('/c/not-mine?outcome=done')
  await expect(page.getByTestId('sign-in-panel')).toContainText('record how it went')
})
