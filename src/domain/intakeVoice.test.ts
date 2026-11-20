import { describe, expect, it } from 'vitest'
import { VOICE_IDLE, currentField, nextField, voiceReducer, walkQueue } from './intakeVoice'

describe('the intake walk', () => {
  it('visits every field in the screen’s order, goal first: an answered field can take more by voice', () => {
    expect(walkQueue()).toEqual(['goal', 'situation', 'success', 'constraints', 'role', 'organization', 'working_style'])
  })

  it('moves only when told: next goes to the following field and stops at the last', () => {
    let s = voiceReducer(VOICE_IDLE, { type: 'start', queue: ['goal', 'success'] })
    expect(currentField(s)).toBe('goal')
    expect(nextField(s)).toBe('success')
    s = voiceReducer(s, { type: 'next' })
    expect(currentField(s)).toBe('success')
    expect(nextField(s)).toBeNull()
    expect(voiceReducer(s, { type: 'next' })).toBe(s)
  })

  it('idle has no field', () => {
    expect(currentField(VOICE_IDLE)).toBeNull()
  })
})
