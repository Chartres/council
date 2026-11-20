import { describe, expect, it } from 'vitest'
import { mayQuote, rest, sentenceAt, sentenceChunker, sentencesOf } from './sentences'

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

// Pavol, 20 Nov: playback read one sentence, skipped, then read something else. The streamed
// text is checked when it ends (unverified quotes cut, emphasis stripped), and the old code
// dropped the rest when the checked text no longer began with what had streamed.
describe('what is spoken equals what is shown', () => {
  it('splits a text the way the speaker does', () => {
    expect(sentencesOf('One. Two? Three')).toEqual(['One.', 'Two?', 'Three'])
  })

  it('a streamed sentence with a quotation or a citation waits for the checked text', () => {
    expect(mayQuote('Start with the customer.')).toBe(false)
    expect(mayQuote('As he wrote, “Lost time is never found again.”')).toBe(true)
    expect(mayQuote('He said "keep your shop" and meant it.')).toBe(true)
    expect(mayQuote('Look at the almanac (Poor Richard, 1733).')).toBe(true)
  })

  it('the checked text is read from where the stream left off, in order', () => {
    expect(rest(['First point.'], 'First point. Second point. Third.')).toEqual(['Second point.', 'Third.'])
  })

  it('a sentence the check cut is not read, and emphasis or spacing does not count as a change', () => {
    const said = ['You have told me what you fear.', 'You have not *told* me the  cost.']
    const shown = 'You have told me what you fear. You have not told me the cost. Write both numbers down.'
    expect(rest(said, shown)).toEqual(['Write both numbers down.'])
    expect(rest(['Cut away.'], 'Kept here. And this.')).toEqual(['Kept here.', 'And this.'])
  })

  it('finds the sentence being read in the text on screen', () => {
    expect(sentenceAt('One. Two *stressed*? Three.', 'Two stressed?')).toBe(1)
    expect(sentenceAt('One. Two.', 'Gone.')).toBe(-1)
  })
})
