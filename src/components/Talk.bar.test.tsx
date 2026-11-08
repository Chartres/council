import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Item } from '@/domain/mastermind'
import * as tts from '@/domain/tts'
import { COUNTDOWN_MS, Talk, TALK_SILENCE_MS } from './Talk'

// The voice player bar (Pavol, 8 Nov): "a really nice, very easy-to-control interface, maybe a
// bottom bar where I can clearly pause the flow, go on to the next question, or go to the
// previous one … I don't know where we are on the list of questions."

vi.mock('@/domain/tts', () => ({ speak: vi.fn(), cancel: vi.fn(), setFallback: vi.fn(), setSession: vi.fn(), unlock: vi.fn() }))
vi.mock('@/analytics', () => ({ keyAction: vi.fn() }))

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
  say(text: string) {
    this.results.push([{ transcript: text }])
    this.onresult?.({ results: this.results.map((r) => Object.assign([...r], { isFinal: false })) })
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  Fake.all = []
  vi.mocked(tts.speak).mockReset()
  vi.mocked(tts.cancel).mockReset()
  Object.defineProperty(window, 'SpeechRecognition', { value: Fake, configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
})

const floors: Item[] = [
  { kind: 'floor', question: 'What is the goal?' },
  { kind: 'contribution', speaker: 'seneca', text: 'Count the days.' },
  { kind: 'floor', question: 'Who pays for it?' },
]

function setup(start: Item[] = floors, opts: { streaming?: boolean } = {}) {
  const onSay = vi.fn()
  const onNow = vi.fn()
  let items = start
  let streaming = opts.streaming ?? false
  const view = () => <Talk on onChange={vi.fn()} items={items} streaming={streaming} onSay={onSay} onNow={onNow} />
  const r = render(view())
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  const set = (next: { items?: Item[]; streaming?: boolean }) => {
    if (next.items) items = next.items
    if (next.streaming !== undefined) streaming = next.streaming
    r.rerender(view())
  }
  return { onSay, onNow, set, rec: () => Fake.all[Fake.all.length - 1]! }
}

describe('Voice bar', () => {
  it('says which question it is on, and lists them; picking one goes back to it', () => {
    const { onSay } = setup()
    expect(screen.getByTestId('voice-where')).toHaveTextContent('Question 2')
    fireEvent.click(screen.getByTestId('voice-where'))
    const list = screen.getByTestId('voice-questions')
    expect(list).toHaveTextContent('What is the goal?')
    expect(list).toHaveTextContent('Who pays for it?')
    fireEvent.click(screen.getByRole('button', { name: /What is the goal\?/ }))
    expect(onSay).toHaveBeenCalledWith(`Let's go back to this question: "What is the goal?"`)
  })

  it('previous and next ask the facilitator in plain words', () => {
    const { onSay } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }))
    expect(onSay).toHaveBeenLastCalledWith(`Let's go back to the previous question: "What is the goal?"`)
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(onSay).toHaveBeenLastCalledWith("Let's move on to the next question.")
  })

  it('a thinking pause does not send: it waits, counts the last seconds down, and Done sends at once', () => {
    const { onSay, rec } = setup()
    act(() => rec().say('we have no engineers'))
    act(() => vi.advanceTimersByTime(1500)) // a thinking pause: nothing sent, no countdown yet
    expect(onSay).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Listening…')
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS - COUNTDOWN_MS - 1500 + 500))
    expect(screen.getByRole('status')).toHaveTextContent(/Sending in \d s/)

    act(() => rec().say('and no money'))
    expect(screen.getByRole('status')).toHaveTextContent('Listening…') // she went on: the clock starts over
    fireEvent.click(screen.getByTestId('voice-done'))
    expect(onSay).toHaveBeenCalledWith('we have no engineers and no money') // both segments, one message
    act(() => vi.advanceTimersByTime(TALK_SILENCE_MS * 2))
    expect(onSay).toHaveBeenCalledTimes(1)
  })

  it('pause holds the room: the line stops, what arrives waits, and resume speaks from the unfinished line', () => {
    const { set } = setup([], { streaming: true })
    set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Second', streaming: true }] })
    expect(vi.mocked(tts.speak).mock.calls.map((c) => c[0])).toEqual(['First point.'])

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(tts.cancel).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Paused')
    set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Second point.' }], streaming: false })
    expect(tts.speak).toHaveBeenCalledTimes(1) // nothing spoken while paused

    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('voice-resume'))
    expect(vi.mocked(tts.speak).mock.calls.slice(1).map((c) => c[0])).toEqual(['First point.', 'Second point.'])
  })

  it('tells the screen which line is being spoken, and when the room is quiet again', () => {
    const { onNow, set } = setup([], { streaming: true })
    set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Then', streaming: true }] })
    const [, , done, , started] = vi.mocked(tts.speak).mock.calls[0]!
    act(() => started!('gateway'))
    expect(onNow).toHaveBeenLastCalledWith({ index: 0, text: 'First point.' })
    act(() => done!())
    expect(onNow).toHaveBeenLastCalledWith(null)
  })

  it('while an adviser speaks, the main button interrupts', () => {
    const { set } = setup([], { streaming: true })
    set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Then', streaming: true }] })
    expect(screen.getByRole('status')).toHaveTextContent('Seneca is talking…')
    fireEvent.click(screen.getByTestId('voice-interrupt'))
    expect(tts.cancel).toHaveBeenCalled()
  })

  it('while the group thinks it counts the seconds, so silence never means nothing is happening', () => {
    setup(floors, { streaming: true })
    expect(screen.getByRole('status')).toHaveTextContent('Thinking… 0 s')
    act(() => vi.advanceTimersByTime(3_100))
    expect(screen.getByRole('status')).toHaveTextContent('Thinking… 3 s')
  })
})
