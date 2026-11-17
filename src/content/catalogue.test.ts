import { describe, expect, it } from 'vitest'
import whatsNew from '../../whats-new.json'
import { ADVISER_COUNT, COLOPHON, EDITION, NONE_LIVING } from './catalogue'
import { BUSINESS, PERSONAS } from './personas'

const ALL = [...PERSONAS, ...BUSINESS.slice(0, 3)]

describe('the catalogue note', () => {
  it('counts the advisers from the rosters', () => {
    expect(ADVISER_COUNT).toBe(new Set([...PERSONAS, ...BUSINESS].map((p) => p.id)).size)
    expect(ADVISER_COUNT).toBe(10)
    expect(NONE_LIVING).toBe('Ten advisers, none living.')
    expect(COLOPHON[1]).toBe('Ten advisers, none living; simulated by AI.')
  })

  it('"none living" holds: every adviser carries a year of death', () => {
    for (const p of [...PERSONAS, ...BUSINESS]) expect(p.died, p.id).toMatch(/^d\. /)
  })

  // Sources: docs/SIGNATURE.md "Visual signature" (Encyclopaedia Britannica and Wikipedia
  // biographies, read 2026-11-17). The Buddha's date is disputed; both scholarly dates are printed.
  it('prints the years of death as checked', () => {
    expect(Object.fromEntries(ALL.map((p) => [p.id, p.died]))).toEqual({
      socrates: 'd. 399 BC',
      'marcus-aurelius': 'd. AD 180',
      seneca: 'd. AD 65',
      buddha: 'd. c. 483 or 400 BC',
      confucius: 'd. 479 BC',
      franklin: 'd. 1790',
      montessori: 'd. 1952',
      drucker: 'd. 2005',
      jobs: 'd. 2011',
      grove: 'd. 2016',
    })
  })

  it('the colophon names the edition from whats-new.json', () => {
    expect(EDITION).toBe(whatsNew.version)
    expect(COLOPHON[0]).toBe(`Mastermind Council, edition ${whatsNew.version}.`)
    expect(COLOPHON.join(' ')).toContain('Errata: probably. Report them under Feedback.')
  })
})
