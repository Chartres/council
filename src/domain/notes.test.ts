import { describe, expect, it } from 'vitest'
import { composeMessage, MAX_NOTE, quoteOf, type Note } from './notes'

const name = (id: string) => ({ drucker: 'Drucker', jobs: 'Jobs' })[id] ?? id

describe('quoteOf', () => {
  it('keeps the opening words of a contribution, enough to say which point', () => {
    expect(quoteOf('Who is the customer here, and how would they know it improved?')).toBe('Who is the customer here, and how would…')
    expect(quoteOf('Ship it.')).toBe('Ship it.')
  })
})

describe('composeMessage: margin notes go with her next message (Eyal, 29 Oct)', () => {
  const notes: Note[] = [
    { speaker: 'drucker', quote: 'Who is the customer here…', stance: 'agree', text: '' },
    { speaker: 'jobs', quote: 'Make it something they can hold…', stance: 'push', text: 'the price is the product here' },
    { speaker: 'drucker', quote: 'Measure the contribution…', stance: 'note', text: 'we measure churn, not contribution' },
  ]

  it('one line per note, addressed to the adviser and the point, then her own words', () => {
    expect(composeMessage(notes, 'So what do we pilot first?', name)).toBe(
      [
        'To Drucker ("Who is the customer here…"): Agree.',
        'To Jobs ("Make it something they can hold…"): Push back — the price is the product here',
        'To Drucker ("Measure the contribution…"): we measure churn, not contribution',
        '',
        'So what do we pilot first?',
      ].join('\n'),
    )
  })

  it('notes alone are a message; no notes leaves her words untouched', () => {
    expect(composeMessage(notes.slice(0, 1), '', name)).toBe('To Drucker ("Who is the customer here…"): Agree.')
    expect(composeMessage([], 'Just this.', name)).toBe('Just this.')
  })

  it('a push back without words still says she pushes back; a long note is cut to fit the turn', () => {
    expect(composeMessage([{ ...notes[1]!, text: '' }], '', name)).toBe('To Jobs ("Make it something they can hold…"): Push back.')
    const long = composeMessage([{ ...notes[2]!, text: 'x'.repeat(MAX_NOTE + 50) }], '', name)
    expect(long.length).toBeLessThan(MAX_NOTE + 60)
  })
})
