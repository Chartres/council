import { expect, test } from '@playwright/test'

// Discoverability kit (flywheel/docs/standards/discoverability.md). On Cloudflare Pages a
// missing static file falls back to index.html with 200 text/html, so every check asserts
// the content-type, not just the status.

const HOST = 'https://council.dravec.org'

test('robots.txt welcomes everyone and names the sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/plain')
  const body = await res.text()
  expect(body).toContain('Allow: /')
  expect(body).toContain('ClaudeBot')
  expect(body).toContain(`Sitemap: ${HOST}/sitemap.xml`)
  expect(body).not.toContain('Disallow: /')
})

test('sitemap.xml lists the canonical root', async ({ request }) => {
  const res = await request.get('/sitemap.xml')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('xml')
  const xml = await res.text()
  expect(xml).toContain(`<loc>${HOST}/</loc>`)
  expect(xml).toContain('<lastmod>')
})

test('llms.txt is plain text in llmstxt.org shape', async ({ request }) => {
  const res = await request.get('/llms.txt')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/plain')
  const body = await res.text()
  expect(body.startsWith('# ')).toBe(true)
  expect(body).toContain('> ')
  expect(body).toContain(`${HOST}/`)
})

test('security.txt is served and not expired', async ({ request }) => {
  const res = await request.get('/.well-known/security.txt')
  expect(res.status()).toBe(200)
  const body = await res.text()
  expect(body).toContain('Contact:')
  const expires = body.match(/Expires:\s*(\S+)/)?.[1]
  expect(new Date(expires!).getTime()).toBeGreaterThan(Date.now())
})

test('og.png is a real 1200x630 PNG', async ({ request }) => {
  const res = await request.get('/og.png')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/png')
  const bytes = await res.body()
  // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
  expect(bytes.readUInt32BE(16)).toBe(1200)
  expect(bytes.readUInt32BE(20)).toBe(630)
})

test('the head carries canonical, social cards and WebApplication JSON-LD', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Mastermind Council/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${HOST}/`)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /verdict|debate/i,
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    `${HOST}/og.png`,
  )
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200')
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  )
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  )
  expect(jsonLd['@type']).toBe('WebApplication')
  expect(jsonLd.url).toBe(`${HOST}/`)
  expect(jsonLd.isAccessibleForFree).toBe(true)
  expect(await page.locator('html').getAttribute('lang')).toBe('en')
})
