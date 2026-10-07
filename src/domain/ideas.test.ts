import { describe, expect, it } from 'vitest'
import { loadLocal, mergeIdea, saveLocal, type SavedIdea } from './ideas'

const idea = (id: string): SavedIdea => ({
  id,
  idea: `idea ${id}`,
  transcript: [{ persona: 'seneca', text: 'Count the cost.' }],
  verdict: null,
  created_at: '2026-10-07T10:00:00.000Z',
})

describe('ideas store (anonymous fallback)', () => {
  it('puts the newest first and replaces a re-saved idea in place', () => {
    expect(mergeIdea([idea('a')], idea('b')).map((i) => i.id)).toEqual(['b', 'a'])
    const updated = { ...idea('a'), idea: 'revised' }
    expect(mergeIdea([idea('b'), idea('a')], updated)).toEqual([updated, idea('b')])
  })

  it('caps the list at 50', () => {
    const many = Array.from({ length: 50 }, (_, i) => idea(`i${i}`))
    expect(mergeIdea(many, idea('new')).length).toBe(50)
  })

  it('round-trips through localStorage and tolerates junk', () => {
    saveLocal(idea('a'))
    expect(loadLocal().map((i) => i.id)).toEqual(['a'])
    localStorage.setItem('council:ideas', '{not json')
    expect(loadLocal()).toEqual([])
  })
})
