import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchUsage, formatCents, formatUsageLine } from './usage'

describe('formatCents', () => {
  it('shows amounts under a euro in cents with one decimal', () => {
    expect(formatCents(12.3)).toBe('12.3 ¢')
    expect(formatCents(0)).toBe('0.0 ¢')
  })

  it('shows a euro or more as euros', () => {
    expect(formatCents(150)).toBe('€1.50')
    expect(formatCents(300000)).toBe('€3000.00')
  })
})

describe('formatUsageLine', () => {
  it('matches the "month: 12.3 ¢ / 3000" style with a cap', () => {
    expect(formatUsageLine('month', 12.3, 3000)).toBe('month: 12.3 ¢ / 3000')
  })

  it('omits the cap when none is given', () => {
    expect(formatUsageLine('today', 1.2)).toBe('today: 1.2 ¢')
  })
})

describe('fetchUsage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the token and council key and returns the parsed body', async () => {
    const body = {
      day_cents: 1.2,
      week_cents: 5,
      month_cents: 12.3,
      month_cap_cents: 3000,
      sessions_day: 1,
      sessions_week: 4,
      sessions_month: 9,
      by_model: { 'claude-sonnet-5-5': 12.3 },
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const usage = await fetchUsage({ gatewayUrl: 'https://llm.example/', token: 'jwt', councilKey: 'tallow-candle' })
    expect(usage).toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/admin/usage',
      expect.objectContaining({
        headers: { authorization: 'Bearer jwt', 'x-council-key': 'tallow-candle' },
      }),
    )
  })

  it('returns null on a non-2xx or network failure, never throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    await expect(fetchUsage({ gatewayUrl: 'https://llm.example' })).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchUsage({ gatewayUrl: 'https://llm.example' })).resolves.toBeNull()
  })
})
