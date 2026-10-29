import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tts = vi.hoisted(() => ({ speak: vi.fn(), cancel: vi.fn(), setFallback: vi.fn(), setSession: vi.fn(), unlock: vi.fn() }))
vi.mock('@/domain/tts', () => tts)

const { useListen, useNarration } = await import('./Listen')

describe('read-aloud', () => {
  beforeEach(() => {
    localStorage.clear()
    tts.speak.mockClear()
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] })
  })

  it('is off until she turns it on (Eyal, 29 Oct)', () => {
    const { result } = renderHook(() => useListen())
    expect(result.current[0]).toBe(false)
    localStorage.setItem('council:listen', '1')
    expect(renderHook(() => useListen()).result.current[0]).toBe(true)
  })

  it('reads each line at natural pitch and speed, naming its speaker so the gateway picks the voice', () => {
    const turns = [
      { persona: 'drucker', text: 'Drucker. Who is the customer?' },
      { persona: 'facilitator', text: 'What would change your mind?' },
    ]
    renderHook(() => useNarration(turns, null, true, 0))
    expect(tts.speak.mock.calls.map((c) => [c[0], c[1], c[3]])).toEqual([
      ['Drucker. Who is the customer?', { pitch: 1, rate: 1 }, 'drucker'],
      ['What would change your mind?', { pitch: 1, rate: 1 }, 'facilitator'],
    ])
  })
})
