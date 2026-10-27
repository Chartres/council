import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { build, LASTMOD, TOPICS } from './prerender.mjs'
import { PERSONAS } from './quotes.mjs'
import { parseBank, sourceUrl } from './quotes.mjs'

const quotes = JSON.parse(readFileSync('src/content/verified-quotes.json', 'utf8'))
const out = build(quotes, LASTMOD)
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

describe('prerendered topic pages', () => {
  it('the committed files are what the generator writes (run `node scripts/prerender.mjs`)', () => {
    for (const [file, text] of Object.entries(out)) expect(readFileSync(file, 'utf8'), file).toBe(text)
  })

  it('every quotation on a page is a verified bank line, and nothing else is in quotation marks', () => {
    const bank = new Set(quotes.map((q) => q.text))
    for (const t of Object.keys(TOPICS)) {
      const html = out[`public/on/${t}/index.html`]
      const lines = [...html.matchAll(/<blockquote>“([\s\S]*?)”<cite>/g)].map((m) => unescape(m[1]))
      expect(lines.length, t).toBeGreaterThan(20)
      expect(lines.filter((l) => !bank.has(l)), t).toEqual([])
      const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
      expect(ld.mainEntity.numberOfItems).toBe(lines.length)
      expect(ld.mainEntity.itemListElement.every((q) => bank.has(q.text) && q.url.startsWith('https://'))).toBe(true)
    }
  })

  it('carries no business-roster thinker (their sources are not public domain)', () => {
    const all = Object.values(out).join('\n')
    for (const name of ['Drucker', 'Steve Jobs', 'Andy Grove', 'Grove']) expect(all).not.toContain(name)
  })

  it('one page per Classics adviser: what it draws on, verified lines, an honest caveat', () => {
    const bank = new Set(quotes.map((q) => q.text))
    for (const [id, p] of Object.entries(PERSONAS)) {
      const html = out[`public/advisers/${id}/index.html`]
      expect(html, id).toContain(`<h1>${p.name.replace('’', '’')}`)
      expect(html).toContain('an AI simulation')
      const lines = [...html.matchAll(/<blockquote>“([\s\S]*?)”<cite>/g)].map((m) => unescape(m[1]))
      expect(lines.length, id).toBeGreaterThanOrEqual(6)
      expect(lines.filter((l) => !bank.has(l)), id).toEqual([])
    }
    expect(out['public/advisers/index.html']).toContain('href="/advisers/marcus-aurelius/"')
  })

  it('a how-it-works page names only what is live', () => {
    const html = out['public/how-it-works/index.html']
    expect(html).toContain('<h1>How a council session works</h1>')
    for (const step of ['facilitator', 'journal', 'commitment', 'Talk mode', 'https://llm.dravec.org/mcp', 'private beta']) expect(html).toContain(step)
  })

  it('the sitemap lists the app and every topic page', () => {
    const xml = out['public/sitemap.xml']
    expect(xml).toContain('<loc>https://council.dravec.org/</loc>')
    for (const t of Object.keys(TOPICS)) expect(xml).toContain(`<loc>https://council.dravec.org/on/${t}/</loc>`)
    for (const id of Object.keys(PERSONAS)) expect(xml).toContain(`<loc>https://council.dravec.org/advisers/${id}/</loc>`)
    expect(xml).toContain('<loc>https://council.dravec.org/how-it-works/</loc>')
  })
})

describe('quote banks', () => {
  it('parses a bank line, keeping inner quotation marks, and links the source', () => {
    const md = '# x\n- [fear, work] "never spurred by "prizes," nor by fear" — ch. I "A Critical Consideration"\n- not a quote line'
    expect(parseBank('montessori', md)).toEqual([
      { persona: 'montessori', tags: ['fear', 'work'], text: 'never spurred by "prizes," nor by fear', locator: 'ch. I "A Critical Consideration"', url: 'https://www.gutenberg.org/ebooks/39863' },
    ])
  })

  it('links each thinker to the letter, book or edition', () => {
    expect(sourceUrl('seneca', 'Letter 12')).toBe('https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_12')
    expect(sourceUrl('marcus-aurelius', 'IV.17')).toBe('https://en.wikisource.org/wiki/The_Thoughts_of_the_Emperor_Marcus_Aurelius_Antoninus/Book_IV')
    expect(sourceUrl('socrates', 'Republic II')).toBe('https://www.gutenberg.org/ebooks/1497')
    expect(sourceUrl('buddha', 'MN 22:13.1 (Sujato)')).toBe('https://suttacentral.net/mn22/en/sujato')
    expect(sourceUrl('buddha', 'Dhammapada v. 1')).toBe('https://www.gutenberg.org/ebooks/2017')
  })
})
