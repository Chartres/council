import { describe, expect, it } from 'vitest'
import { VOICE_IDLE, currentField, voiceReducer } from './intakeVoice'

describe('voiceReducer', () => {
  it('starts on the first still-empty field and asks it', () => {
    const s = voiceReducer(VOICE_IDLE, { type: 'start', empty: ['goal', 'success'] })
    expect(s).toEqual({ queue: ['goal', 'success'], at: 0, phase: 'ask' })
    expect(currentField(s)).toBe('goal')
  })

  it('nothing empty: stays idle', () => {
    expect(voiceReducer(VOICE_IDLE, { type: 'start', empty: [] })).toEqual(VOICE_IDLE)
  })

  it('asked → listen; advance (answer or skip) asks the next; the last one ends it', () => {
    let s = voiceReducer(VOICE_IDLE, { type: 'start', empty: ['goal', 'success'] })
    s = voiceReducer(s, { type: 'asked' })
    expect(s.phase).toBe('listen')
    s = voiceReducer(s, { type: 'advance' })
    expect(s).toMatchObject({ at: 1, phase: 'ask' })
    expect(currentField(s)).toBe('success')
    s = voiceReducer(s, { type: 'advance' })
    expect(s.phase).toBe('idle')
    expect(currentField(s)).toBeNull()
  })

  it('stop ends it any time; a stale asked after stop is ignored', () => {
    let s = voiceReducer(VOICE_IDLE, { type: 'start', empty: ['goal'] })
    s = voiceReducer(s, { type: 'stop' })
    expect(s.phase).toBe('idle')
    expect(voiceReducer(s, { type: 'asked' }).phase).toBe('idle')
    expect(voiceReducer(s, { type: 'advance' }).phase).toBe('idle')
  })
})
