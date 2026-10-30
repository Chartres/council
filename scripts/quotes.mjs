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
import { pathToFileURL } from 'node:url'

export const PERSONAS = {
  seneca: { name: 'Seneca', work: 'Letters to Lucilius', translator: 'Richard M. Gummere', edition: 'Epistulae Morales ad Lucilium, trans. Richard M. Gummere, Loeb Classical Library (1917–1925), via Wikisource', brings: 'Counts the cost in time and money before anyone counts the upside.' },
  'marcus-aurelius': { name: 'Marcus Aurelius', work: 'Meditations', translator: 'George Long', edition: 'Meditations (The Thoughts of the Emperor Marcus Aurelius Antoninus), trans. George Long (1862), via Wikisource', brings: 'Strips the idea down to what is actually in your control.' },
  socrates: { name: 'Socrates', work: 'Plato’s dialogues', translator: 'Benjamin Jowett', edition: 'Plato, Apology, Crito, Meno, Theaetetus and Republic, trans. Benjamin Jowett, via Project Gutenberg', brings: 'Asks the question you are avoiding, then asks it again.' },
  confucius: { name: 'Confucius', work: 'Analects', translator: 'James Legge', edition: 'Analects (Lun Yu), trans. James Legge, via Project Gutenberg', brings: 'Weighs duty, relationships and who carries the work.' },
  franklin: { name: 'Benjamin Franklin', work: 'Autobiography and The Way to Wealth', translator: null, edition: 'Autobiography and The Way to Wealth (1758), via Project Gutenberg', brings: 'Turns the idea into a cheap experiment you can run this week.' },
  buddha: { name: 'The Buddha', work: 'Dhammapada and the suttas', translator: 'F. Max Müller', edition: 'Dhammapada, trans. F. Max Müller (1881), via Project Gutenberg, and suttas in Bhikkhu Sujato’s CC0 translation, via SuttaCentral', brings: 'Names the attachment driving the plan.' },
  montessori: { name: 'Maria Montessori', work: 'The Montessori Method', translator: 'Anne E. George', edition: 'The Montessori Method, trans. Anne E. George (1912), via Project Gutenberg', brings: 'Asks what you learn by doing, not by being told.' },
}

/** The translator of this line: the Buddha's suttas are Sujato's, the Dhammapada Müller's. */
export function translatorOf(persona, locator) {
  if (persona === 'buddha' && !locator.startsWith('Dhammapada')) return 'Bhikkhu Sujato'
  return PERSONAS[persona]?.translator ?? null
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
      // This edition prints The Way to Wealth after the Autobiography; both are checked against it.
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
  return md.split(/\r?\n/).flatMap((line) => {
    const m = line.match(LINE)
    if (!m) return []
    const locator = m[3].trim().replace(/\*/g, '')
    return [{ persona, tags: m[1].split(',').map((t) => t.trim()), text: m[2], locator, url: sourceUrl(persona, locator) }]
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2]
  if (!dir) throw new Error('usage: node scripts/quotes.mjs <flywheel/gateway/prompts/council/classics/quotes>')
  const quotes = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.slice(0, -3) in PERSONAS)
    .sort()
    .flatMap((f) => parseBank(f.slice(0, -3), readFileSync(join(dir, f), 'utf8')))
  writeFileSync('src/content/verified-quotes.json', `${JSON.stringify(quotes, null, 1)}\n`)
  console.log(`${quotes.length} quotes`)
}
