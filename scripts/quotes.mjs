// Verified classics quotes → src/content/verified-quotes.json, and the source link for each.
//
// The banks live in the gateway (flywheel/gateway/prompts/council/classics/quotes/*.md); every
// line there was checked verbatim against a public-domain edition (PROVENANCE.md). This copies
// them here so the prerendered topic pages (scripts/prerender.mjs) can be built without the
// gateway. Business-roster banks are never copied: their sources are not public domain.
//
//   node scripts/quotes.mjs ../flywheel/gateway/prompts/council/classics/quotes

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PERSONAS = {
  seneca: { name: 'Seneca', work: 'Letters to Lucilius', translator: 'Richard M. Gummere' },
  'marcus-aurelius': { name: 'Marcus Aurelius', work: 'Meditations', translator: 'George Long' },
  socrates: { name: 'Socrates', work: 'Plato’s dialogues', translator: 'Benjamin Jowett' },
  confucius: { name: 'Confucius', work: 'Analects', translator: 'James Legge' },
  franklin: { name: 'Benjamin Franklin', work: 'Autobiography and The Way to Wealth', translator: null },
  buddha: { name: 'The Buddha', work: 'Dhammapada and the suttas', translator: 'F. Max Müller; Bhikkhu Sujato' },
  montessori: { name: 'Maria Montessori', work: 'The Montessori Method', translator: 'Anne E. George' },
}

const PLATO = { Apology: 1656, Crito: 1657, Meno: 1643, Republic: 1497, Theaetetus: 1726 }
const gutenberg = (n) => `https://www.gutenberg.org/ebooks/${n}`

/** Where a reader can check the line: the letter, book or edition it came from. */
export function sourceUrl(persona, locator) {
  const loc = locator.replace(/\*/g, '')
  switch (persona) {
    case 'seneca': {
      const n = loc.match(/Letter (\d+)/)?.[1]
      return n ? `https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_${n}` : 'https://en.wikisource.org/wiki/Moral_letters_to_Lucilius'
    }
    case 'marcus-aurelius': {
      const book = loc.match(/^([IVX]+)\./)?.[1]
      const base = 'https://en.wikisource.org/wiki/The_Thoughts_of_the_Emperor_Marcus_Aurelius_Antoninus'
      return book ? `${base}/Book_${book}` : base
    }
    case 'socrates': {
      const work = Object.keys(PLATO).find((w) => loc.startsWith(w))
      return gutenberg(work ? PLATO[work] : PLATO.Apology)
    }
    case 'confucius':
      return gutenberg(3330)
    case 'franklin':
      return gutenberg(20203)
    case 'buddha': {
      const sutta = loc.match(/^(DN|MN|SN|AN|SNP|Snp)\s*([\d.]+)/i)
      return sutta ? `https://suttacentral.net/${sutta[1].toLowerCase()}${sutta[2]}/en/sujato` : gutenberg(2017)
    }
    case 'montessori':
      return gutenberg(39863)
    default:
      return null
  }
}

const LINE = /^- \[([^\]]+)\] "(.*)" — (.+)$/

/** One bank file → its quotes. Lines that do not match the bank format are skipped, not guessed. */
export function parseBank(persona, md) {
  return md.split('\n').flatMap((line) => {
    const m = line.match(LINE)
    if (!m) return []
    const locator = m[3].trim().replace(/\*/g, '')
    return [{ persona, tags: m[1].split(',').map((t) => t.trim()), text: m[2], locator, url: sourceUrl(persona, locator) }]
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2]
  if (!dir) throw new Error('usage: node scripts/quotes.mjs <flywheel/gateway/prompts/council/classics/quotes>')
  const quotes = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.slice(0, -3) in PERSONAS)
    .sort()
    .flatMap((f) => parseBank(f.slice(0, -3), readFileSync(join(dir, f), 'utf8')))
  writeFileSync('src/content/verified-quotes.json', `${JSON.stringify(quotes, null, 1)}\n`)
  console.log(`${quotes.length} quotes`)
}
