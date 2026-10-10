import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendFeedback } from './feedback'

const opts = { gatewayUrl: 'https://gw.test/', councilKey: 'k', token: 't' }

describe('sendFeedback', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts text, page and session id; 204 is sent', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    await expect(sendFeedback({ text: ' slow on phone ', page: '/journal', session_id: 's1' }, opts)).resolves.toBe('sent')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://gw.test/v1/feedback')
    expect(init.headers.authorization).toBe('Bearer t')
    expect(JSON.parse(init.body)).toEqual({ text: 'slow on phone', page: '/journal', session_id: 's1' })
  })

  it('caps text at 2,000 characters and leaves out a missing session id', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    await sendFeedback({ text: 'x'.repeat(2500), page: '/' }, opts)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.text).toHaveLength(2000)
    expect('session_id' in body).toBe(false)
  })

  it('429 is "enough for today"; anything else is a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    await expect(sendFeedback({ text: 'a', page: '/' }, opts)).resolves.toBe('quota')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    await expect(sendFeedback({ text: 'a', page: '/' }, opts)).resolves.toBe('failed')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(sendFeedback({ text: 'a', page: '/' }, opts)).resolves.toBe('failed')
  })
})
