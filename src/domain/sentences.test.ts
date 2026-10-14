import { describe, expect, it } from 'vitest'
import { sentenceChunker } from './sentences'

describe('sentenceChunker', () => {
  it('hands out a sentence once its end and the space after it have arrived', () => {
    const c = sentenceChunker()
    expect(c.push('Start with the cus')).toEqual([])
    expect(c.push('tomer.')).toEqual([]) // "." at the end: could still be "3.5"
    expect(c.push(' Who benefits? Ask them! Then')).toEqual(['Start with the customer.', 'Who benefits?', 'Ask them!'])
    expect(c.flush()).toEqual(['Then'])
    expect(c.flush()).toEqual([])
  })

  it('does not split on abbreviations, initials or decimals', () => {
    const c = sentenceChunker()
    expect(c.push('Pick one metric, e.g. churn, and i.e. not revenue. ')).toEqual([
      'Pick one metric, e.g. churn, and i.e. not revenue.',
    ])
    expect(c.push('Growth was 3.5 percent vs. last year. ')).toEqual(['Growth was 3.5 percent vs. last year.'])
    expect(c.push('As W. E. Deming said, measure it. ')).toEqual(['As W. E. Deming said, measure it.'])
  })

  it('keeps a closing quote with its sentence and flushes the tail on end', () => {
    const c = sentenceChunker()
    expect(c.push('He said "go." Then he went')).toEqual(['He said "go."'])
    expect(c.flush()).toEqual(['Then he went'])
  })
})
