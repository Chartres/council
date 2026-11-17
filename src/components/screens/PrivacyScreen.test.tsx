import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PrivacyScreen } from './PrivacyScreen'

// Pavol, 17 Nov: the gateway keeps the email and approval state of each account that asks.
describe('PrivacyScreen', () => {
  it('lists the approval record with where, how long and who', () => {
    render(<PrivacyScreen />)
    const row = screen.getByText('Your email address and whether your account is approved').closest('div')!
    expect(row).toHaveTextContent('Cloudflare Durable Object (our gateway); one email to Pavol through Resend when you first ask, one to you when approved')
    expect(row).toHaveTextContent('Until you delete your account')
    expect(row).toHaveTextContent('The gateway code; Pavol; Resend when sending those two emails')
  })
})
