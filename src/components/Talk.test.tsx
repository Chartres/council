import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Item } from '@/domain/mastermind'
import { SttError } from '@/domain/stt'
import * as tts from '@/domain/tts'

// A Talk turn (Pavol, 20 Nov): record → text → correct → send. "I did not like this stressful
// thing that waits for silence … That's against the idea of me being thoughtful with my
// responses." And: "The functionality of seeing the text and correcting it is super important."

const analytics = vi.hoisted(() => ({ keyAction: vi.fn() }))
vi.mock('@/analytics', () => analytics)
vi.mock('@/domain/tts', () => ({ speak: vi.fn(), cancel: vi.fn(), setFallback: vi.fn(), setSession: vi.fn(), unlock: vi.fn() }))
const fake = await vi.hoisted(async () => (await import('@/test/fakeCapture')).fakeCaptures())
vi.mock('@/domain/capture', async (orig) => ({ ...(await orig<object>()), openCapture: fake.openCapture, primeMic: fake.primeMic }))
vi.mock('@/domain/stt', async (orig) => ({ ...(await orig<object>()), recordingSupported: () => true }))

const { Talk } = await import('./Talk')

beforeEach(() => {
  fake.reset()
  fake.primeMic.mockClear()
  analytics.keyAction.mockClear()
  vi.mocked(tts.speak).mockReset()
  vi.mocked(tts.cancel).mockReset()
  vi.mocked(tts.unlock).mockReset()
})

const spoken = () => vi.mocked(tts.speak).mock.calls.map(([text, , , speaker]) => [text, speaker])
const status = () => screen.getByTestId('talk-status')
const draft = () => screen.getByTestId('voice-draft') as HTMLTextAreaElement
const settle = () => act(async () => {})
/** Every line handed to the speaker finishes playing. */
const roomFinishes = async () => {
  for (const call of vi.mocked(tts.speak).mock.calls) await act(async () => (call[2] as () => void)?.())
}

function setup(start: Item[] = [], opts: { streaming?: boolean; on?: boolean; timing?: boolean } = {}) {
  const onSay = vi.fn()
  const onChange = vi.fn()
  const onLeft = vi.fn()
  let items = start
  let streaming = opts.streaming ?? false
  let on = opts.on ?? true
  const view = () => <Talk on={on} onChange={onChange} items={items} streaming={streaming} onSay={onSay} onLeft={onLeft} timing={opts.timing} />
  const r = render(view())
  const set = async (next: { items?: Item[]; streaming?: boolean; on?: boolean }) => {
    if (next.items) items = next.items
    if (next.streaming !== undefined) streaming = next.streaming
    if (next.on !== undefined) on = next.on
    await act(async () => r.rerender(view()))
  }
  return { onSay, onChange, onLeft, set, unmount: r.unmount }
}
const start = async () => {
  fireEvent.click(screen.getByTestId('voice-start'))
  await settle()
}

describe('Talk: his turn is record → text → correct → send', () => {
  it('opens the mic inside the Start tap, and says in words what the mic is doing', async () => {
    fake.state.hold = true
    setup([{ kind: 'floor', question: 'Where do you start?' }])
    fireEvent.click(screen.getByTestId('voice-start'))
    expect(tts.unlock).toHaveBeenCalled()
    expect(fake.openCapture).toHaveBeenCalledTimes(1) // before the click returned
    await settle()
    expect(status()).toHaveTextContent('Waiting for the microphone. Nothing is recorded yet.')
    await act(async () => fake.state.release[0]!())
    expect(status()).toHaveTextContent('Recording. Say something.')
    expect(screen.getByTestId('thread')).toBeInTheDocument()
    expect(screen.getByTestId('voice-finish')).toHaveTextContent('Finish')
  })

  it('a pause, however long, sends nothing; his words are text he corrects, and only Send sends them', async () => {
    vi.useFakeTimers()
    const { onSay } = setup([{ kind: 'floor', question: 'Where do you start?' }])
    await start()
    act(() => fake.last().say('we have no engineers'))
    expect(draft().value).toBe('we have no engineers') // on screen while he is still talking
    act(() => vi.advanceTimersByTime(10 * 60_000)) // he thinks for ten minutes
    expect(onSay).not.toHaveBeenCalled()
    expect(fake.last().finish).not.toHaveBeenCalled()
    vi.useRealTimers()

    act(() => fake.last().say('and no money'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    expect(fake.last().finish).toHaveBeenCalledTimes(1)
    expect(onSay).not.toHaveBeenCalled() // Finish ends the recording, not the turn
    expect(status()).toHaveTextContent('Yours to correct before it goes.')

    fireEvent.change(draft(), { target: { value: 'We have two engineers and no money.' } })
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledTimes(1)
    expect(onSay).toHaveBeenCalledWith('We have two engineers and no money.')
    expect(draft().value).toBe('')
  })

  it('recording again adds to the text he corrected', async () => {
    setup()
    await start()
    act(() => fake.last().say('first thought'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    fireEvent.change(draft(), { target: { value: 'First thought, fixed.' } })
    fireEvent.click(screen.getByTestId('voice-more'))
    await settle()
    expect(fake.all).toHaveLength(2)
    act(() => fake.last().say('second thought'))
    expect(draft().value).toBe('First thought, fixed. second thought')
  })

  it('while a part is still being written down, Send waits for it', async () => {
    const { onSay } = setup()
    await start()
    act(() => fake.last().ev.onPending(1))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    expect(status()).toHaveTextContent('Writing it down…')
    expect(screen.getByTestId('voice-wait')).toBeDisabled()
    act(() => fake.all[0]!.say('the last part'))
    act(() => fake.all[0]!.ev.onPending(0))
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledWith('the last part')
  })

  it('he can type his turn instead: the same field, the same Send', async () => {
    const { onSay } = setup()
    await start()
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    expect(screen.getByTestId('voice-talk')).toHaveTextContent('Tap and talk') // nothing said: the mic is offered again
    fireEvent.change(draft(), { target: { value: 'typed instead' } })
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledWith('typed instead')
  })

  it('on a keyboard the space bar finishes the recording; it does not send, and it types in the field', async () => {
    const { onSay } = setup()
    await start()
    act(() => fake.last().say('one thing'))
    await act(async () => fireEvent.keyDown(document.body, { code: 'Space' }))
    expect(fake.last().finish).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { code: 'Space' })
    expect(onSay).not.toHaveBeenCalled()
    fireEvent.keyDown(draft(), { code: 'Space' })
    expect(fake.all).toHaveLength(1)
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true })
    expect(onSay).toHaveBeenCalledWith('one thing')
  })
})

describe('Talk: the room and he take turns', () => {
  it('sends, the mic stays shut while an adviser speaks, and opens again when the room is quiet', async () => {
    const { onSay, onChange, set } = setup([{ kind: 'floor', question: 'Where do you start?' }], { on: false })
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    expect(onChange).toHaveBeenCalledWith(true)
    await set({ on: true })
    expect(fake.all).toHaveLength(1)
    expect(tts.speak).not.toHaveBeenCalled() // what was on screen before Talk is not read

    act(() => fake.last().say('we have no engineers'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledWith('we have no engineers')

    const said: Item[] = [{ kind: 'floor', question: 'Where do you start?' }, { kind: 'user', text: 'we have no engineers' }]
    await set({ items: said, streaming: true })
    expect(status()).toHaveTextContent('Thinking…')
    expect(screen.getByTestId('voice-wait')).toBeDisabled()

    // Deltas: each completed sentence goes to the adviser's voice, in order.
    await set({ items: [...said, { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who', streaming: true }] })
    expect(spoken()).toEqual([['Start with the customer.', 'drucker']])
    expect(status()).toHaveTextContent('Drucker is talking…')
    expect(screen.getByTestId('cut-in')).toHaveTextContent('Cut in')
    await set({
      items: [...said, { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits?' }, { kind: 'floor', question: 'Who is the customer?' }],
      streaming: false,
    })
    expect(spoken()).toEqual([
      ['Start with the customer.', 'drucker'],
      ['Who benefits?', 'drucker'],
      ['Who is the customer?', 'facilitator'],
    ])
    expect(fake.all).toHaveLength(1) // shut while the room speaks

    await roomFinishes()
    expect(fake.all).toHaveLength(2) // the room went quiet: his turn
    expect(status()).toHaveTextContent('Recording.')

    // Off: the mic closes.
    fireEvent.click(screen.getByRole('button', { name: 'End voice' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
    await set({ on: false })
    expect(fake.last().cancel).toHaveBeenCalled()
    expect(screen.queryByTestId('talk-status')).toBeNull()
  })

  it('Cut in stops the adviser and opens the mic at once', async () => {
    const { set } = setup([], { streaming: true })
    await start()
    expect(fake.all).toHaveLength(0) // the group is answering: not his turn
    expect(fake.primeMic).toHaveBeenCalledTimes(1) // but the permission was asked inside the tap
    await set({ items: [{ kind: 'contribution', speaker: 'drucker', text: 'Who is the customer here, really?' } as Item], streaming: false })
    await act(async () => fireEvent.click(screen.getByTestId('cut-in')))
    expect(tts.cancel).toHaveBeenCalled()
    expect(fake.all).toHaveLength(1)
    expect(screen.getByTestId('voice-finish')).toBeInTheDocument()
  })

  it('Cut in while the answer is still streaming: what he sends waits for the answer to end, and the rest of it is not spoken', async () => {
    const growing = { kind: 'contribution', speaker: 'grove', text: 'First, cut the scope. Then', streaming: true } as Item
    const { onSay, set } = setup([], { streaming: true })
    await start()
    await set({ items: [growing] })
    await act(async () => fireEvent.click(screen.getByTestId('cut-in')))
    act(() => fake.last().say('wait, no'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).not.toHaveBeenCalled()
    vi.mocked(tts.speak).mockClear()
    await set({ items: [{ ...growing, text: 'First, cut the scope. Then hire.', streaming: false } as Item], streaming: false })
    expect(tts.speak).not.toHaveBeenCalled()
    expect(onSay).toHaveBeenCalledWith('wait, no')
  })

  it('a typed reply or a chip while the mic is open shuts it; what he had said stays as text', async () => {
    const { onSay, set } = setup()
    await start()
    act(() => fake.last().say('half a thought'))
    await set({ streaming: true }) // he typed and sent; the group answers
    expect(fake.last().finish).toHaveBeenCalled()
    expect(onSay).not.toHaveBeenCalled()
    expect(draft().value).toBe('half a thought')
  })

  it('the last question and the end of the stream in one render: the mic waits for the question to be read', async () => {
    const { set } = setup([], { streaming: true })
    await start()
    await set({ items: [{ kind: 'floor', question: 'Which first?' }], streaming: false })
    expect(fake.all).toHaveLength(0)
    await roomFinishes()
    expect(fake.all).toHaveLength(1)
  })

  it('remembered as on, it waits for a tap: no mic, no audio until then', async () => {
    const { onChange, set } = setup()
    expect(screen.getByRole('button', { name: 'End voice' })).toHaveAttribute('aria-pressed', 'true')
    expect(status()).toHaveTextContent('Tap to resume')
    await set({ items: [{ kind: 'floor', question: 'Still there?' }] })
    expect(tts.speak).not.toHaveBeenCalled()
    expect(fake.openCapture).not.toHaveBeenCalled()
    await start()
    expect(tts.unlock).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(fake.all).toHaveLength(1)
  })

  it('a final text that rewrote the stream is not spoken from the middle of a word', async () => {
    const { set } = setup([], { streaming: true })
    await start()
    await set({ items: [{ kind: 'contribution', speaker: 'grove', text: 'Who owns th', streaming: true }] })
    await set({ items: [{ kind: 'contribution', speaker: 'grove', text: 'Name the owner first.' }, { kind: 'floor', question: 'Who?' }] })
    expect(spoken()).toEqual([['Who?', 'facilitator']])
  })
})

describe('Talk: what fails is said', () => {
  it('a blocked mic is said in words, logged, and Talk switches off', async () => {
    fake.state.reject = new SttError('denied')
    const { onChange, set } = setup([], { on: false })
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    await set({ on: true })
    expect(onChange).toHaveBeenLastCalledWith(false)
    await set({ on: false })
    expect(screen.getByTestId('talk-problem')).toHaveTextContent(/blocked/i)
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'mic', reason: 'denied', talk: true })
  })

  it('no sound for 3 s is said in the status line, with the input’s name, and logged', async () => {
    vi.useFakeTimers()
    setup()
    await start()
    act(() => vi.advanceTimersByTime(3500))
    expect(status()).toHaveTextContent('I can’t hear anything from “Desk microphone”. Check the input, or speak up.')
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'meter', reason: 'heard_nothing', talk: true })
    vi.useRealTimers()
  })

  it('the mic taken away mid-turn: his words stay, it says so, and one tap carries on', async () => {
    const { onSay } = setup()
    await start()
    act(() => fake.last().say('before I left'))
    await act(async () => fake.last().lose())
    expect(screen.getByTestId('mic-problem')).toHaveTextContent('The microphone stopped when you left the page. Tap to carry on.')
    expect(draft().value).toBe('before I left')
    expect(onSay).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('voice-more'))
    await settle()
    act(() => fake.last().say('after I came back'))
    expect(draft().value).toBe('before I left after I came back')
  })

  it('ending Talk with words not sent hands them to the reply box', async () => {
    const { onLeft, onSay, set } = setup()
    await start()
    act(() => fake.last().say('not sent yet'))
    await set({ on: false })
    expect(onLeft).toHaveBeenCalledWith('not sent yet')
    expect(onSay).not.toHaveBeenCalled()
  })

  it('leaving the screen closes the mic and sends nothing', async () => {
    const { onSay, unmount } = setup()
    await start()
    act(() => fake.last().say('too late'))
    unmount()
    expect(fake.last().cancel).toHaveBeenCalled()
    expect(onSay).not.toHaveBeenCalled()
  })
})

describe('Talk: the wait to the first word', () => {
  it('times one turn from Send to the first adviser audio, reports it once, and shows it to an admin', async () => {
    vi.useFakeTimers()
    const { set } = setup([{ kind: 'floor', question: 'Where do you start?' }], { timing: true })
    await start()
    act(() => fake.last().say('we have no engineers'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    fireEvent.click(screen.getByTestId('voice-send'))
    const said: Item[] = [{ kind: 'floor', question: 'Where do you start?' }, { kind: 'user', text: 'we have no engineers' }]
    await set({ items: said, streaming: true })
    act(() => vi.advanceTimersByTime(1500)) // the group thinks
    await set({ items: [...said, { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who', streaming: true }] })
    const started = vi.mocked(tts.speak).mock.calls[0]![4]!
    act(() => vi.advanceTimersByTime(600)) // the voice arrives
    act(() => started('gateway'))
    const turns = analytics.keyAction.mock.calls.filter(([a]) => a === 'voice_turn')
    expect(turns).toEqual([['voice_turn', { ears: 'browser', out: 'gateway', silence_ms: 0, stt_ms: 0, think_ms: 1500, voice_ms: 600, total_ms: 2100 }]])
    expect(screen.getByTestId('voice-timing')).toHaveTextContent('to first word')

    // The next sentence of the same answer is not a new turn.
    await set({ items: [...said, { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits? Then', streaming: true }] })
    act(() => vi.mocked(tts.speak).mock.calls[1]![4]!('gateway'))
    expect(analytics.keyAction.mock.calls.filter(([a]) => a === 'voice_turn')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('shows no timing line to anyone else', () => {
    setup()
    expect(screen.queryByTestId('voice-timing')).toBeNull()
  })
})

// Review 15 Nov: Tap to hear must not throw away a recording he is already speaking into.
describe('Tap to hear', () => {
  async function missedFloor() {
    const { set } = setup([], { streaming: true })
    await start()
    await set({ items: [{ kind: 'floor', question: 'Who pays for it?' }], streaming: false })
    const call = vi.mocked(tts.speak).mock.calls[0]!
    await act(async () => {
      ;(call[5] as () => void)() // the gateway missed it (iPhone)
      ;(call[2] as () => void)() // and the queue moved on: his turn, the mic opens
    })
    expect(fake.all).toHaveLength(1)
    vi.mocked(tts.speak).mockClear()
  }

  it('while he is speaking, the tap leaves his recording alone', async () => {
    await missedFloor()
    fake.last().speak()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap to hear' })))
    expect(fake.last().finish).not.toHaveBeenCalled()
    expect(tts.speak).not.toHaveBeenCalled()
  })

  it('with the mic open and nothing said yet, the line is asked for again', async () => {
    await missedFloor()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap to hear' })))
    expect(tts.speak).toHaveBeenCalledTimes(1)
    expect(vi.mocked(tts.speak).mock.calls[0]![0]).toBe('Who pays for it?')
  })
})
