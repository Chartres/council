import { describe, expect, it } from 'vitest'
import { turnClock } from './voiceTiming'

// One Talk turn, from her last word to the first adviser audio, split where the time goes:
// waiting for quiet, writing it down (server ears), the group thinking, the voice arriving.

describe('turnClock', () => {
  it('splits a server-ears turn into silence, transcription, thinking and voice', () => {
    let t = 2_600
    const c = turnClock(() => t)
    c.sent(1_000, 1_900)
    t = 4_100
    c.firstLine()
    t = 4_900
    expect(c.audioStarted('gateway', 'server')).toEqual({
      ears: 'server',
      out: 'gateway',
      silence_ms: 900,
      stt_ms: 700,
      think_ms: 1_500,
      voice_ms: 800,
      total_ms: 3_900,
    })
  })

  it('browser ears: no transcription step; silence runs to the send', () => {
    let t = 1_400
    const c = turnClock(() => t)
    c.sent(500)
    t = 3_000
    c.firstLine()
    t = 3_200
    expect(c.audioStarted('browser', 'browser')).toMatchObject({ silence_ms: 900, stt_ms: 0, think_ms: 1_600, voice_ms: 200, total_ms: 2_700 })
  })

  it('reports once per turn: later lines of the same answer are not a new turn', () => {
    let t = 0
    const c = turnClock(() => t)
    c.sent(0)
    c.firstLine()
    t = 10
    expect(c.audioStarted('gateway', 'browser')).not.toBeNull()
    c.firstLine()
    expect(c.audioStarted('gateway', 'browser')).toBeNull()
  })

  it('reports nothing for a turn it did not see start (the opener, a typed message)', () => {
    const c = turnClock(() => 5)
    c.firstLine()
    expect(c.audioStarted('gateway', 'browser')).toBeNull()
  })

  it('a cut-in or Talk going off starts over', () => {
    let t = 0
    const c = turnClock(() => t)
    c.sent(0)
    c.reset()
    c.firstLine()
    t = 50
    expect(c.audioStarted('gateway', 'browser')).toBeNull()
  })

  it('an answer with no spoken line drops the turn, so the next answer is not timed against it', () => {
    let t = 0
    const c = turnClock(() => t)
    c.sent(0)
    c.unanswered()
    t = 9_000
    c.firstLine()
    expect(c.audioStarted('gateway', 'browser')).toBeNull()
  })

  it('unanswered after a spoken line keeps the report coming', () => {
    let t = 0
    const c = turnClock(() => t)
    c.sent(0)
    c.firstLine()
    c.unanswered()
    t = 300
    expect(c.audioStarted('gateway', 'browser')).toMatchObject({ voice_ms: 300 })
  })
})
