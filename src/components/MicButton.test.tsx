import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { MicButton, SILENCE_MS } from './MicButton'

// A recognition engine that only does what it is told: results and ends come from the test.
class Fake {
  static all: Fake[] = []
  continuous = false
  interimResults = false
  onresult: ((e: { results: unknown[] }) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
  start = vi.fn()
  constructor() {
    Fake.all.push(this)
  }
  hear(text: string) {
    this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: false })] })
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  Fake.all = []
  Object.defineProperty(window, 'SpeechRecognition', { value: Fake, configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
})

describe('MicButton endpointing', () => {
  it('keeps listening through pauses and ends after a real silence', () => {
    const onChange = vi.fn()
    const onDone = vi.fn()
    render(<MicButton value="" onChange={onChange} label="Goal" autoStart onDone={onDone} />)
    const r = Fake.all[0]!
    expect(r.continuous).toBe(true)

    act(() => r.hear('I want to'))
    act(() => vi.advanceTimersByTime(SILENCE_MS - 500))
    expect(r.stop).not.toHaveBeenCalled()
    act(() => r.hear('I want to leave my job'))
    act(() => vi.advanceTimersByTime(SILENCE_MS - 500))
    expect(r.stop).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(600))
    expect(r.stop).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('I want to leave my job')
    expect(onChange).toHaveBeenLastCalledWith('I want to leave my job')
  })

  it('listens again when the engine gives up before anything was said', () => {
    const onDone = vi.fn()
    render(<MicButton value="" onChange={() => {}} label="Goal" autoStart onDone={onDone} />)
    act(() => Fake.all[0]!.onend?.())
    expect(Fake.all).toHaveLength(2)
    expect(onDone).not.toHaveBeenCalled()
    act(() => Fake.all[1]!.onend?.())
    act(() => Fake.all[2]!.onend?.())
    act(() => Fake.all[3]!.onend?.())
    expect(Fake.all).toHaveLength(4)
    expect(onDone).toHaveBeenCalledWith('')
  })
})
