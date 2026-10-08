import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_EMAILS, isAdmin } from './admin'

describe('isAdmin', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is true only for the committed admin emails', () => {
    for (const email of ADMIN_EMAILS) expect(isAdmin(email)).toBe(true)
    expect(isAdmin('someone.else@example.com')).toBe(false)
  })

  it('is false for no email', () => {
    expect(isAdmin(null)).toBe(false)
    expect(isAdmin(undefined)).toBe(false)
  })

  it('is case-sensitive: the list is committed exactly as written', () => {
    expect(isAdmin('Pavol@dravecky.sk')).toBe(false)
  })

  it('the VITE_E2E_ADMIN escape hatch grants admin regardless of email', () => {
    vi.stubEnv('VITE_E2E_ADMIN', '1')
    expect(isAdmin('nobody@example.com')).toBe(true)
    expect(isAdmin(null)).toBe(true)
  })
})
