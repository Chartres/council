import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Item } from '@/domain/mastermind'
import * as tts from '@/domain/tts'
import { Talk, TALK_SILENCE_MS } from './Talk'

vi.mock('@/domain/tts', () => ({ speak: vi.fn(), cancel: vi.fn(), setFallback: vi.fn() }))

// A recogniser the test drives: each `say` is a new result, `more` grows the last one (interim).
class Fake {
  static all: Fake[] = []
  continuous = false
  interimResults = false
  results: { transcript: string }[][] = []
  onresult: ((e: { results: unknown[] }) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    Fake.all.push(this)
  }
  emit() {
    this.onresult?.({ results: this.results.map((r) => Object.assign([...r], { isFinal: false })) })
  }
  say(text: string) {
    this.results.push([{ transcript: text }])
    this.emit()
  }
  more(text: string) {
    this.results[this.results.length - 1] = [{ transcript: text }]
    this.emit()
  }
}

const played = vi.fn(() => Promise.resolve())
beforeEach(() => {
  vi.useFakeTimers()
  Fake.all = []
  vi.mocked(tts.speak).mockReset()
  vi.mocked(tts.cancel).mockReset()
  Object.defineProperty(window, 'SpeechRecognition', { value: Fake, configurable: true })
  vi.stubGlobal('Audio', class { play = played })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
})

const spoken = () => vi.mocked(tts.speak).mock.calls.map(([text, , , speaker]) => [text, speaker])

describe('Talk mode', () => {
  it('hears, sends a voice turn, speaks it sentence by sentence, and stops when talked over', () => {
    const onSay = vi.fn()
    const onChange = vi.fn()
    let items: Item[] = [{ kind: 'floor', question: 'Where do you start?' }]
    let streaming = false
    const view = (on: boolean) => (
      <Talk on={on} onChange={onChange} items={items} streaming={streaming} onSay={onSay} />
    )
    const { rerender } = render(view(false))

    // Talk on: the silent clip plays inside the tap, the mic opens in continuous mode.
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    expect(played).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(view(true))
    const r = Fake.all[0]!
    expect(r.continuous).toBe(true)
    expect(r.start).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Listening…')
    expect(tts.speak).not.toHaveBeenCalled() // what was on screen before Talk is not read

    // 1,200 ms of silence after the words sends them as a voice turn; the mic stays open.
    act(() => r.say('we have no engineers'))
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS - 1))
    expect(onSay).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onSay).toHaveBeenCalledWith('we have no engineers')
    expect(r.stop).not.toHaveBeenCalled()

    items = [...items, { kind: 'user', text: 'we have no engineers' }]
    streaming = true
    rerender(view(true))
    expect(screen.getByRole('status')).toHaveTextContent('Thinking…')

    // Deltas: each completed sentence goes to the adviser's voice, in order.
    items = [...items, { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who', streaming: true }]
    rerender(view(true))
    expect(spoken()).toEqual([['Start with the customer.', 'drucker']])
    expect(screen.getByRole('status')).toHaveTextContent('Drucker is talking…')
    items = [...items.slice(0, -1), { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits? Then', streaming: true }]
    rerender(view(true))
    items = [
      ...items.slice(0, -1),
      { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits? Then act.' },
      { kind: 'floor', question: 'Who is the customer?' },
    ]
    streaming = false
    rerender(view(true))
    expect(spoken()).toEqual([
      ['Start with the customer.', 'drucker'],
      ['Who benefits?', 'drucker'],
      ['Then act.', 'drucker'],
      ['Who is the customer?', 'facilitator'],
    ])

    // Barge-in: one word is not enough; two cancel the audio and start the next message.
    act(() => r.say('wait'))
    expect(tts.cancel).not.toHaveBeenCalled()
    act(() => r.more('wait actually'))
    expect(tts.cancel).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Listening…')
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(onSay).toHaveBeenLastCalledWith('wait actually')

    // Off: the mic closes and the audio stops.
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
    rerender(view(false))
    expect(r.abort).toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('drops the rest of a turn it was talked over in, and holds the new words until the stream ends', () => {
    const onSay = vi.fn()
    let items: Item[] = []
    let streaming = true
    const view = () => <Talk on onChange={() => {}} items={items} streaming={streaming} onSay={onSay} />
    const { rerender } = render(view())
    const r = Fake.all[0]!
    items = [{ kind: 'contribution', speaker: 'jobs', text: 'Show me day one. ', streaming: true }]
    rerender(view())
    expect(spoken()).toEqual([['Show me day one.', 'jobs']])

    act(() => r.say('no stop'))
    expect(tts.cancel).toHaveBeenCalled()
    items = [{ kind: 'contribution', speaker: 'jobs', text: 'Show me day one. Cut the rest.', streaming: true }]
    rerender(view())
    expect(spoken()).toHaveLength(1) // the contribution keeps its text on screen, unspoken
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(onSay).not.toHaveBeenCalled()

    streaming = false
    rerender(view())
    expect(onSay).toHaveBeenCalledWith('no stop')
  })
})
