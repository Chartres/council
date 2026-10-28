import { describe, expect, it, vi } from 'vitest'
import { createFlywheelClient, isAutomatedBrowser, type SupabaseLike } from './flywheel-client'

function fakeSupabase() {
  const insert = vi.fn(() => Promise.resolve())
  const sb = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseLike
  return { sb, insert }
}

describe('isAutomatedBrowser', () => {
  it('flags webdriver and bot or headless user agents, not a person', () => {
    expect(isAutomatedBrowser({ webdriver: true, userAgent: 'Mozilla/5.0 (iPhone)' })).toBe(true)
    expect(isAutomatedBrowser({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).toBe(true)
    expect(isAutomatedBrowser({ userAgent: 'Mozilla/5.0 HeadlessChrome/131.0' })).toBe(true)
    expect(isAutomatedBrowser({ webdriver: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1' })).toBe(false)
    expect(isAutomatedBrowser(undefined)).toBe(false)
  })
})

describe('createFlywheelClient', () => {
  it('drops every event from an automated browser', () => {
    const { sb, insert } = fakeSupabase()
    const fw = createFlywheelClient({ app: 'council', supabase: sb, isAutomated: () => true })
    fw.track('page_view')
    fw.conversion({ v: 4 })
    expect(insert).not.toHaveBeenCalled()
  })

  it('sends conversion as a conversion row for a person', () => {
    const { sb, insert } = fakeSupabase()
    const fw = createFlywheelClient({ app: 'council', supabase: sb, isAutomated: () => false, now: () => 't' })
    fw.conversion({ v: 4 })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ app: 'council', event: 'conversion', props: { v: 4 } }))
  })
})
