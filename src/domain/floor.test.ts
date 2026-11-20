import { describe, expect, it } from 'vitest'
import { floorStatus, type FloorState } from './floor'

const idle: FloorState = {
  waiting: false,
  paused: false,
  missed: null,
  talker: null,
  reading: null,
  streaming: false,
  answering: null,
  recording: false,
  mic: null,
  pending: 0,
  draft: false,
  held: false,
}
const say = (s: Partial<FloorState>) => floorStatus({ ...idle, ...s }).text

// Pavol, 20 Nov (Firefox on Android): the words took seconds to be written down and the status
// still said "Recording". The line says what is happening in every state.
describe('the floor’s status line', () => {
  it('says each state of a turn in words', () => {
    expect(say({})).toBe('Your turn. Take your time.')
    expect(say({ recording: true, mic: { tone: 'plain', text: 'Recording. I can hear you.' } })).toBe('Recording. I can hear you.')
    expect(say({ pending: 2 })).toBe('Writing it down: 2 parts left')
    expect(say({ draft: true })).toBe('Read it over. Tap your words to correct them.')
    expect(say({ streaming: true })).toBe('The council is answering. Tap to speak instead.')
    expect(say({ streaming: true, answering: 'Socrates' })).toBe('Socrates is answering. Tap to speak instead.')
    expect(say({ talker: 'Benjamin Franklin', reading: { k: 2, n: 4 } })).toBe('Benjamin Franklin, sentence 2 of 4')
  })

  it('counts the parts still being written down while it records, too', () => {
    expect(say({ recording: true, pending: 1, mic: { tone: 'plain', text: 'Recording. I can hear you.' } })).toBe('Recording. Writing it down: 1 part left')
  })

  it('a mic that hears nothing outranks everything else while it records', () => {
    const bad = { tone: 'bad' as const, text: 'I can’t hear anything from “Default”. Check the input, or speak up.' }
    expect(floorStatus({ ...idle, recording: true, pending: 1, mic: bad })).toEqual(bad)
  })

  it('a line that did not load holds the room and says whose', () => {
    expect(say({ paused: true, missed: 'Seneca' })).toBe('Seneca’s voice did not load. Tap to hear it, or read it above.')
    expect(say({ paused: true })).toBe('Paused.')
    expect(say({ waiting: true })).toBe('Read aloud is on. Tap Start to carry on.')
    expect(say({ held: true, streaming: true })).toBe('Your words go when the answer is done.')
  })
})
