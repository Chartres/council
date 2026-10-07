import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERSONA_IDS,
  MAX_PERSONAS,
  PERSONAS,
  nextPicked,
  personaMonogram,
  personaName,
} from './personas'

describe('roster', () => {
  it('has seven thinkers with three on by default and no Jesus in v1', () => {
    expect(PERSONAS).toHaveLength(7)
    expect(DEFAULT_PERSONA_IDS).toEqual(['socrates', 'marcus-aurelius', 'seneca'])
    expect(PERSONAS.map((p) => p.id)).not.toContain('jesus')
  })

  it('gives every persona a monogram and a line of its own, never a portrait', () => {
    const brings = new Set(PERSONAS.map((p) => p.brings))
    expect(brings.size).toBe(PERSONAS.length)
    for (const p of PERSONAS) {
      expect(p.monogram.length).toBeGreaterThan(0)
      expect(p.source.length).toBeGreaterThan(0)
    }
  })

  it('falls back gracefully for an id this build does not know', () => {
    expect(personaName('diogenes')).toBe('diogenes')
    expect(personaMonogram('diogenes')).toBe('DI')
  })
})

describe('nextPicked', () => {
  it('adds up to the cap and then refuses', () => {
    const full = PERSONAS.slice(0, MAX_PERSONAS).map((p) => p.id)
    expect(full).toHaveLength(4)
    expect(nextPicked(full, 'montessori')).toEqual(full)
    expect(nextPicked(full.slice(0, 3), 'montessori')).toHaveLength(4)
  })

  it('unticks, but never empties the council', () => {
    expect(nextPicked(['socrates', 'seneca'], 'seneca')).toEqual(['socrates'])
    expect(nextPicked(['socrates'], 'socrates')).toEqual(['socrates'])
  })
})
