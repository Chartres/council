import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { Item } from '@/domain/mastermind'
import * as tts from '@/domain/tts'

// The voice player bar (Pavol, 8 Nov): "a really nice, very easy-to-control interface, maybe a
// bottom bar where I can clearly pause the flow, go on to the next question, or go to the
// previous one … I don't know where we are on the list of questions." And 20 Nov: "the controls
// are also very unintuitive. It's like some text, some icons."

vi.mock('@/domain/tts', () => ({ speak: vi.fn(), cancel: vi.fn(), setFallback: vi.fn(), setSession: vi.fn(), unlock: vi.fn() }))
vi.mock('@/analytics', () => ({ keyAction: vi.fn() }))
const fake = await vi.hoisted(async () => (await import('@/test/fakeCapture')).fakeCaptures())
vi.mock('@/domain/capture', async (orig) => ({ ...(await orig<object>()), openCapture: fake.openCapture, primeMic: fake.primeMic }))
vi.mock('@/domain/stt', async (orig) => ({ ...(await orig<object>()), recordingSupported: () => true }))

const { Talk } = await import('./Talk')

beforeEach(() => {
  vi.useFakeTimers()
  fake.reset()
  vi.mocked(tts.speak).mockReset()
  vi.mocked(tts.cancel).mockReset()
})
afterEach(() => {
  vi.useRealTimers()
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
  return { onSay, onNow, set }
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
    expect(onSay).toHaveBeenCalledWith(`Let's go back to this question: "What is the goal?"`, true)
  })

  it('previous and next ask the facilitator in plain words', () => {
    const { onSay } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the previous question' }))
    expect(onSay).toHaveBeenLastCalledWith(`Let's go back to the previous question: "What is the goal?"`, true)
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(onSay).toHaveBeenLastCalledWith("Let's move on to the next question.", true)
  })

  it('every control is a word: no bare icons', () => {
    setup()
    const bar = screen.getByTestId('voice-bar')
    const words = within(bar)
      .getAllByRole('button')
      .map((b) => b.textContent?.trim())
    expect(words.slice(1)).toEqual(['Finish', 'Back', 'Next', 'Stop reading aloud'])
    for (const w of words) expect(w).toBeTruthy()
  })

  it('a thinking pause does not send and nothing counts down: the turn waits for Finish', async () => {
    const { onSay } = setup()
    await act(async () => {})
    act(() => fake.last().say('we have no engineers'))
    act(() => vi.advanceTimersByTime(60_000))
    expect(onSay).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).not.toHaveTextContent(/Sending in/)
    expect(fake.last().finish).not.toHaveBeenCalled()
    expect(screen.getByTestId('voice-finish')).toBeEnabled()
  })

  it('pause holds the room: the line stops, what arrives waits, and resume speaks from the unfinished line', () => {
    const { set } = setup([], { streaming: true })
    set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Second', streaming: true }] })
    expect(vi.mocked(tts.speak).mock.calls.map((c) => c[0])).toEqual(['First point.'])

    fireEvent.click(screen.getByTestId('voice-pause'))
    expect(tts.cancel).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Paused.')
    set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Second point.' }], streaming: false })
    expect(tts.speak).toHaveBeenCalledTimes(1) // nothing spoken while paused

    expect(screen.getByTestId('voice-resume')).toHaveTextContent('Resume')
    fireEvent.click(screen.getByTestId('voice-resume'))
    expect(vi.mocked(tts.speak).mock.calls.slice(1).map((c) => c[0])).toEqual(['First point.', 'Second point.'])
  })

  it('tells the screen which line is being spoken, and when the room is quiet again', () => {
    const { onNow, set } = setup([], { streaming: true })
    set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Then', streaming: true }] })
    const [, , done, , started] = vi.mocked(tts.speak).mock.calls[0]!
    act(() => started!('gateway'))
    expect(onNow).toHaveBeenLastCalledWith({ index: 0, text: 'First point.' })
    expect(screen.getByRole('status')).toHaveTextContent('Seneca, sentence 1 of 2')
    act(() => done!())
    expect(onNow).toHaveBeenLastCalledWith(null)
  })

  it('while an adviser speaks, the main button cuts in', () => {
    const { set } = setup([], { streaming: true })
    set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Then', streaming: true }] })
    expect(screen.getByRole('status')).toHaveTextContent('Seneca is answering. Tap to speak instead.')
    fireEvent.click(screen.getByTestId('cut-in'))
    expect(tts.cancel).toHaveBeenCalled()
  })

  it('while the group thinks, the status says so: silence never means nothing is happening', () => {
    setup(floors, { streaming: true })
    expect(screen.getByRole('status')).toHaveTextContent('The council is answering. Tap to speak instead.')
    expect(screen.getByTestId('cut-in')).toBeEnabled()
  })

  it('Talk off while paused lets the pause go: back on, it listens and old lines are not spoken', () => {
    const onChange = vi.fn()
    let on = true
    let items: Item[] = []
    const view = () => <Talk on={on} onChange={onChange} items={items} streaming={on} onSay={vi.fn()} />
    const r = render(view())
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    items = [{ kind: 'contribution', speaker: 'seneca', text: 'First point. Then', streaming: true }]
    r.rerender(view())
    fireEvent.click(screen.getByTestId('voice-pause'))
    on = false
    r.rerender(view())
    on = true
    r.rerender(view())
    expect(screen.getByRole('status')).not.toHaveTextContent('Paused')
    expect(screen.queryByTestId('voice-resume')).toBeNull()
  })

  it('after next question, the rest of the old answer is not spoken; the new one is', () => {
    const { onSay, set } = setup([], { streaming: true })
    set({ items: [{ kind: 'floor', question: 'Q1?' }, { kind: 'contribution', speaker: 'seneca', text: 'First point. Then', streaming: true }] })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    vi.mocked(tts.speak).mockClear()
    set({
      items: [
        { kind: 'floor', question: 'Q1?' },
        { kind: 'contribution', speaker: 'seneca', text: 'First point. Then the rest.' },
        { kind: 'floor', question: 'Old question?' },
      ],
      streaming: false,
    })
    expect(onSay).toHaveBeenCalledWith("Let's move on to the next question.", true)
    expect(tts.speak).not.toHaveBeenCalled()
    set({
      items: [
        { kind: 'floor', question: 'Q1?' },
        { kind: 'contribution', speaker: 'seneca', text: 'First point. Then the rest.' },
        { kind: 'floor', question: 'Old question?' },
        { kind: 'user', text: "Let's move on to the next question." },
        { kind: 'floor', question: 'New question?' },
      ],
    })
    expect(vi.mocked(tts.speak).mock.calls.map((c) => c[0])).toEqual(['New question?'])
  })
})
