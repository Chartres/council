import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { STUB_PASSWORD } from '../playwright.config'

// What's new (flywheel docs/standards/whats-new.md): once per version, on the start screen,
// one tap to close. A fresh visitor sees nothing; someone who used the council before the
// sheet existed (council:key stored, no fw:whats-new) sees the first one.

const release = JSON.parse(readFileSync('whats-new.json', 'utf8')) as {
  version: string
  items: { id: string; text: string; media: string }[]
}
const ORIGIN = 'http://localhost:4173'

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

function withStorage(entries: { name: string; value: string }[]) {
  return { storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: entries }] } }
}

const sheet = (page: Page) => page.getByRole('dialog', { name: "What's new" })

test.describe('a version change', () => {
  test.use(withStorage([{ name: 'council:key', value: STUB_PASSWORD }, { name: 'fw:whats-new', value: '0.9.0' }]))

  test('shows the sheet once on the start screen; one tap closes it; a reload shows nothing', async ({ page }) => {
    await page.goto('/')
    const s = sheet(page)
    await expect(s).toBeVisible()
    for (const item of release.items) {
      await expect(s.getByText(item.text)).toBeVisible()
      await expect(s.locator(`li[data-id="${item.id}"] iframe`)).toHaveAttribute('src', item.media)
    }
    await expect(s.getByRole('button', { name: 'Got it' })).toBeFocused()
    // the animations have time to reach a frame worth photographing
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/shots/whats-new-phone.png' })

    await s.getByRole('button', { name: 'Got it' }).click()
    await expect(s).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible()
    await page.waitForTimeout(500)
    await expect(sheet(page)).toHaveCount(0)
  })

  test('never over a page other than the start screen', async ({ page }) => {
    await page.goto('/journal')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await page.waitForTimeout(500)
    await expect(sheet(page)).toHaveCount(0)
  })
})

test.describe('the first release with the sheet', () => {
  test.use(withStorage([{ name: 'council:key', value: STUB_PASSWORD }]))

  test('a returning beta tester (council:key, no fw:whats-new) sees it', async ({ page }) => {
    await page.goto('/')
    await expect(sheet(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
  })
})

test.describe('a first visit', () => {
  test.use(withStorage([]))

  test('a fresh visitor sees no sheet, neither at the door nor once past it', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('password-panel')).toBeVisible()
    await page.getByLabel('Password', { exact: true }).fill(STUB_PASSWORD)
    await page.getByRole('button', { name: 'Enter' }).click()
    await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(500)
    await expect(sheet(page)).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible()
    await page.waitForTimeout(500)
    await expect(sheet(page)).toHaveCount(0)
  })
})
