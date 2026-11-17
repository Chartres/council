import { describe, expect, it } from 'vitest'
import { runningHead } from '@/components/Header'
import { viewFromPath } from './CouncilContext'

describe('viewFromPath', () => {
  it('known paths open their screen, with or without a trailing slash', () => {
    expect(viewFromPath('/')).toBe('start')
    expect(viewFromPath('/journal')).toBe('journal')
    expect(viewFromPath('/journal/')).toBe('journal')
    expect(viewFromPath('/quick')).toBe('home')
    expect(viewFromPath('/privacy')).toBe('privacy')
  })

  it('/start and the reminder deep link still land on the start screen', () => {
    expect(viewFromPath('/start')).toBe('start')
    expect(viewFromPath('/index.html')).toBe('start')
    expect(viewFromPath('/c/c1')).toBe('start')
  })

  it('any other path is a leaf wanting', () => {
    expect(viewFromPath('/nope')).toBe('notfound')
    expect(viewFromPath('/c/c1/extra')).toBe('notfound')
    expect(viewFromPath('/journal/2026')).toBe('notfound')
  })
})

describe('runningHead', () => {
  it('names the book, or the part of it that is open', () => {
    expect(runningHead('start')).toBe('Mastermind Council')
    expect(runningHead('journal')).toBe('Journal')
    expect(runningHead('notfound')).toBe('Mastermind Council')
    expect(runningHead('conversation', [])).toBe('Mastermind Council')
    expect(runningHead('conversation', [{ kind: 'floor' }])).toBe('The first question')
    expect(runningHead('conversation', [{ kind: 'floor' }, { kind: 'user' }, { kind: 'floor' }])).toBe('The second question')
    expect(runningHead('conversation', [{ kind: 'floor' }, { kind: 'proposal', state: 'open' }])).toBe('Quaestio')
    expect(runningHead('conversation', Array(11).fill({ kind: 'floor' }))).toBe('Question 11')
  })
})
