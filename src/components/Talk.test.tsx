import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Item } from '@/domain/mastermind'
import * as tts from '@/domain/tts'
import { ECHO_GRACE_MS, isEcho, RETRY_MS, Talk, TALK_SILENCE_MS } from './Talk'

vi.mock('@/domain/tts', () => ({ speak: vi.fn(), cancel: vi.fn(), setFallback: vi.fn(), setSession: vi.fn(), unlock: vi.fn() }))

// A recogniser the test drives: each `say` is a new result, `more` grows the last one (interim).
class Fake {
  static all: Fake[] = []
  continuous = false
  interimResults = false
  results: { transcript: string }[][] = []
  onresult: ((e: { results: unknown[] }) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e?: { error?: string }) => void) | null = null
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

beforeEach(() => {
  vi.useFakeTimers()
  Fake.all = []
  vi.mocked(tts.speak).mockReset()
  vi.mocked(tts.cancel).mockReset()
  vi.mocked(tts.unlock).mockReset()
  Object.defineProperty(window, 'SpeechRecognition', { value: Fake, configurable: true })
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

    // Talk on: the shared player is unlocked inside the tap, the mic opens in continuous mode.
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    expect(tts.unlock).toHaveBeenCalled()
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

    // Barge-in: one word (a cough) neither stops the audio nor goes as a message.
    act(() => r.say('wait'))
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(tts.cancel).not.toHaveBeenCalled()
    expect(onSay).toHaveBeenCalledTimes(1)
    // Two words cancel the audio and start the next message.
    act(() => r.say('wait'))
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
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
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

  it('on speakerphone, the room hearing its own voice is neither a barge-in nor a message', () => {
    const onSay = vi.fn()
    let items: Item[] = []
    const view = () => <Talk on onChange={() => {}} items={items} streaming={false} onSay={onSay} />
    const { rerender } = render(view())
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    const r = Fake.all[0]!
    items = [
      { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits? Then act.' },
      { kind: 'floor', question: 'Who is the customer?' },
    ]
    rerender(view())
    expect(spoken()).toHaveLength(4)

    // The mic transcribes the adviser, as recognisers do: lower case, a word misheard.
    act(() => r.say('start with'))
    act(() => r.more('start with a customer who benefits'))
    expect(tts.cancel).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(onSay).not.toHaveBeenCalled()

    // The lines finish; the tail of the question still comes back a moment later.
    for (const [, , onEnd] of vi.mocked(tts.speak).mock.calls) act(() => onEnd?.())
    act(() => r.say('who is the customer'))
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(onSay).not.toHaveBeenCalled()
    // Once that moment has passed, a short answer is hers, even when it reuses the question's words.
    act(() => vi.advanceTimersByTime(ECHO_GRACE_MS))
    act(() => r.say('the customer'))
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(onSay).toHaveBeenCalledWith('the customer')

    // She cuts in while the mic has been hearing the room with no pause between: her words stop
    // the audio and go alone; the room's words around them are dropped.
    items = [...items, { kind: 'contribution', speaker: 'grove', text: 'Only the paranoid survive. Measure it weekly.' }]
    rerender(view())
    act(() => r.say('only the paranoid survive'))
    expect(tts.cancel).not.toHaveBeenCalled()
    act(() => r.say('hold on that is wrong'))
    expect(tts.cancel).toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(onSay).toHaveBeenLastCalledWith('hold on that is wrong')

    // A one-word tail of the last line, just after the room stopped, is not a message either.
    items = [...items, { kind: 'contribution', speaker: 'grove', text: 'Measure it weekly.' }]
    rerender(view())
    for (const [, , onEnd] of vi.mocked(tts.speak).mock.calls) act(() => onEnd?.())
    act(() => r.say('weekly'))
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(onSay).toHaveBeenCalledTimes(2)

    // Long after the room went quiet, her own words are hers, even if they echo an adviser.
    act(() => vi.advanceTimersByTime(ECHO_GRACE_MS))
    act(() => r.say('who is the customer'))
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS))
    expect(onSay).toHaveBeenLastCalledWith('who is the customer')
  })

  it('isEcho: a near-contiguous run of the room’s own words, not scattered ones', () => {
    const lines = ['Start with the customer.', 'Who benefits?']
    expect(isEcho('start with a customer who benefits', lines)).toBe(true) // one word misheard
    expect(isEcho('Who benefits', lines)).toBe(true)
    expect(isEcho('customer who', lines)).toBe(true) // across the line boundary
    expect(isEcho('wait no', lines)).toBe(false)
    expect(isEcho('the customer is wrong here', lines)).toBe(false)
    expect(isEcho('benefits who', lines)).toBe(false)
    expect(isEcho('', lines)).toBe(false)
    // Answers that reuse common words from a long line are hers.
    const long = ['It matters what is said in the room, and the working hours count for the first of them.']
    expect(isEcho('it is working', long)).toBe(false)
    expect(isEcho('the first month', long)).toBe(false)
    expect(isEcho('I can not afford to wait', ['You cannot afford to wait for certainty.'])).toBe(false)
  })

  it('remembered as on, it waits for a tap: no mic, no audio until then', () => {
    const onChange = vi.fn()
    let items: Item[] = []
    const view = () => <Talk on onChange={onChange} items={items} streaming={false} onSay={() => {}} />
    const { rerender } = render(view())
    expect(screen.getByRole('button', { name: 'Talk' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Tap to resume')
    expect(Fake.all).toHaveLength(0)
    items = [{ kind: 'floor', question: 'Still there?' }]
    rerender(view())
    expect(tts.speak).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    expect(tts.unlock).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(Fake.all[0]!.start).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Listening…')
  })

  it('words still waiting for the pause are dropped when Talk goes off or the screen is left', () => {
    const onSay = vi.fn()
    const view = (on: boolean) => <Talk on={on} onChange={() => {}} items={[]} streaming={false} onSay={onSay} />
    const { rerender, unmount } = render(view(true))
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    act(() => Fake.all[0]!.say('hello there'))
    rerender(view(false))
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS * 2))
    expect(onSay).not.toHaveBeenCalled()

    rerender(view(true))
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    act(() => Fake.all[Fake.all.length - 1]!.say('hello again'))
    unmount()
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS * 2))
    expect(onSay).not.toHaveBeenCalled()
  })

  it('after an engine error it waits before listening again; a refused mic turns Talk off', () => {
    const onChange = vi.fn()
    render(<Talk on onChange={onChange} items={[]} streaming={false} onSay={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    act(() => {
      Fake.all[0]!.onerror?.({ error: 'network' })
      Fake.all[0]!.onend?.()
    })
    expect(Fake.all).toHaveLength(1)
    act(() => vi.advanceTimersByTime(RETRY_MS))
    expect(Fake.all).toHaveLength(2)
    // An engine that just ends (Chrome after a quiet spell) is reopened at once.
    act(() => Fake.all[1]!.onend?.())
    expect(Fake.all).toHaveLength(3)
    act(() => {
      Fake.all[2]!.onerror?.({ error: 'not-allowed' })
      Fake.all[2]!.onend?.()
    })
    expect(onChange).toHaveBeenCalledWith(false)
    act(() => vi.advanceTimersByTime(RETRY_MS))
    expect(Fake.all).toHaveLength(3)
  })

  it('a final text that rewrote the stream is not spoken from the middle of a word', () => {
    let items: Item[] = []
    const view = () => <Talk on onChange={() => {}} items={items} streaming onSay={() => {}} />
    const { rerender } = render(view())
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    items = [{ kind: 'contribution', speaker: 'grove', text: 'Who owns th', streaming: true }]
    rerender(view())
    items = [{ kind: 'contribution', speaker: 'grove', text: 'Name the owner first.' }, { kind: 'floor', question: 'Who?' }]
    rerender(view())
    expect(spoken()).toEqual([['Who?', 'facilitator']])
  })
})
