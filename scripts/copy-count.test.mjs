import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADVISER_COUNT, ADVISERS_WORD } from '../src/content/catalogue'

// The adviser count in static copy (the page title and share text, the package description,
// the README, the AGENTS one-liner, the share card's tagline) is written by hand. This keeps
// it equal to the rosters; og.png is re-rendered from the tagline in AGENTS.md.

const word = ADVISERS_WORD.toLowerCase()
const read = (f) => readFileSync(f, 'utf8')
const NUMBERS = 'one|two|three|five|six|seven|eight|nine|ten|eleven|twelve'

describe('the adviser count in static copy', () => {
  it('index.html names the count the rosters have', () => {
    const html = read('index.html')
    expect(html.match(new RegExp(`${word} thinkers debate your idea`, 'g'))?.length).toBeGreaterThanOrEqual(5)
    expect(html).toContain(`of ${word} historical thinkers`)
    expect(html).toContain(`${word} advisers in all`)
  })

  it('no file names another count of thinkers or advisers', () => {
    for (const f of ['index.html', 'package.json', 'README.md', 'AGENTS.md']) {
      const stale = [...read(f).matchAll(new RegExp(`\\b(${NUMBERS})\\s+(historical\\s+)?(thinkers|advisers)\\b`, 'gi'))]
        .map((m) => m[1].toLowerCase())
        .filter((n) => n !== word)
      expect(stale, f).toEqual([])
    }
  })

  it('package.json, README, the AGENTS one-liner and the share-card tagline carry it', () => {
    expect(read('package.json')).toContain(`of ${word} historical thinkers`)
    expect(read('README.md')).toContain(`${ADVISERS_WORD} advisers, up to four at a time`)
    expect(read('AGENTS.md')).toContain(`of ${word} historical thinkers`)
    expect(read('AGENTS.md')).toContain(`--tagline "${ADVISERS_WORD} thinkers debate your idea`)
    expect(ADVISER_COUNT).toBeGreaterThan(0)
  })
})
