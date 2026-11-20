import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { Item } from '@/domain/mastermind'
import { SttError } from '@/domain/stt'
import * as tts from '@/domain/tts'

// The floor (Pavol, 20 Nov, option A of lab/one-voice): record → text → correct → send, in one
// bar. "I did not like this stressful thing that waits for silence … That's against the idea of
// me being thoughtful with my responses." And: "The functionality of seeing the text and
// correcting it is super important."

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
/** His words as the conversation shows them (the dashed message). */
const words = () => screen.queryByTestId('draft-text')?.textContent?.replace(/\s*…$/, '').trim() ?? (screen.queryByTestId('voice-draft') as HTMLTextAreaElement | null)?.value ?? ''
/** Tap his words and correct them. */
const correct = (text: string) => {
  const t = screen.queryByTestId('draft-text')
  if (t) fireEvent.click(t)
  fireEvent.change(screen.getByTestId('voice-draft'), { target: { value: text } })
}
const settle = () => act(async () => {})
/** Every line handed to the speaker finishes playing. */
const roomFinishes = async () => {
  for (const call of vi.mocked(tts.speak).mock.calls) await act(async () => (call[2] as () => void)?.())
}

function setup(start: Item[] = [], opts: { streaming?: boolean; on?: boolean; timing?: boolean } = {}) {
  const onSay = vi.fn()
  const onChange = vi.fn()
  let items = start
  let streaming = opts.streaming ?? false
  let on = opts.on ?? true
  function Host() {
    const [slot, setSlot] = useState<HTMLDivElement | null>(null)
    return (
      <>
        <div ref={setSlot} data-testid="slot" />
        <Talk on={on} onChange={onChange} items={items} streaming={streaming} onSay={onSay} timing={opts.timing} slot={slot} />
      </>
    )
  }
  const r = render(<Host />)
  const set = async (next: { items?: Item[]; streaming?: boolean; on?: boolean }) => {
    if (next.items) items = next.items
    if (next.streaming !== undefined) streaming = next.streaming
    if (next.on !== undefined) on = next.on
    await act(async () => r.rerender(<Host />))
  }
  return { onSay, onChange, set, unmount: r.unmount }
}
const start = async () => {
  fireEvent.click(screen.getByTestId('voice-start'))
  await settle()
}

describe('The floor: his turn is record → text → correct → send', () => {
  it('opens the mic inside the Start tap, and says in words what the mic is doing', async () => {
    fake.state.hold = true
    setup([{ kind: 'floor', question: 'Where do you start?' }])
    fireEvent.click(screen.getByTestId('voice-start'))
    expect(fake.openCapture).toHaveBeenCalledTimes(1) // before the click returned
    await settle()
    expect(status()).toHaveTextContent('Waiting for the microphone. Nothing is recorded yet.')
    await act(async () => fake.state.release[0]!())
    expect(status()).toHaveTextContent('Recording. Say something when you are ready.')
    expect(screen.getByTestId('thread')).toBeInTheDocument()
    expect(screen.getByTestId('voice-finish')).toHaveTextContent('Finish')
  })

  // 20 Nov, Firefox on Android: lost_muted 4 s after Talk opened. The silent clip and the silent
  // browser line played in the same tap are the suspects; Android does not need them there.
  it("elsewhere the tap that opens the mic also unlocks the player (Safari needs it)", async () => {
    setup([{ kind: 'floor', question: 'Where do you start?' }])
    await start()
    expect(tts.unlock).toHaveBeenCalledTimes(1)
  })

  it('Android: no unlock in the tap that opens the mic', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0')
    setup([{ kind: 'floor', question: 'Where do you start?' }])
    await start()
    expect(fake.openCapture).toHaveBeenCalledTimes(1)
    expect(tts.unlock).not.toHaveBeenCalled()
    ua.mockRestore()
  })

  it('a pause, however long, sends nothing; his words are text he corrects, and only Send sends them', async () => {
    vi.useFakeTimers()
    const { onSay } = setup([{ kind: 'floor', question: 'Where do you start?' }])
    await start()
    act(() => fake.last().say('we have no engineers'))
    expect(words()).toBe('we have no engineers') // in the conversation while he is still talking
    act(() => vi.advanceTimersByTime(10 * 60_000)) // he thinks for ten minutes
    expect(onSay).not.toHaveBeenCalled()
    expect(fake.last().finish).not.toHaveBeenCalled()
    vi.useRealTimers()

    act(() => fake.last().say('and no money'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    expect(fake.last().finish).toHaveBeenCalledTimes(1)
    expect(onSay).not.toHaveBeenCalled() // Finish ends the recording, not the turn
    expect(status()).toHaveTextContent('Read it over. Tap your words to correct them.')
    expect(screen.queryByRole('textbox')).toBeNull() // a field only while he edits

    correct('We have two engineers and no money.')
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledTimes(1)
    expect(onSay).toHaveBeenCalledWith('We have two engineers and no money.', true, false)
    expect(screen.queryByTestId('draft')).toBeNull()
  })

  it('recording again adds to the text he corrected', async () => {
    setup()
    await start()
    act(() => fake.last().say('first thought'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    correct('First thought, fixed.')
    fireEvent.click(screen.getByTestId('voice-more'))
    await settle()
    expect(fake.all).toHaveLength(2)
    act(() => fake.last().say('second thought'))
    expect(words()).toBe('First thought, fixed. second thought')
  })

  it('while a part is still being written down, Send waits for it, and the status counts the parts', async () => {
    const { onSay } = setup()
    await start()
    act(() => fake.last().ev.onPending(2))
    expect(status()).toHaveTextContent('Recording. Writing it down: 2 parts left')
    act(() => fake.last().ev.onPending(1))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    expect(status()).toHaveTextContent('Writing it down: 1 part left')
    expect(screen.getByTestId('voice-wait')).toBeDisabled()
    act(() => fake.all[0]!.say('the last part'))
    act(() => fake.all[0]!.ev.onPending(0))
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledWith('the last part', true, false)
  })

  it('he can type his turn instead: the same draft, the same Send', async () => {
    const { onSay } = setup([], { on: false })
    expect(screen.getByTestId('voice-talk')).toHaveTextContent('Talk')
    fireEvent.click(screen.getByTestId('type-instead'))
    expect(screen.getByTestId('voice-draft')).toHaveFocus()
    fireEvent.change(screen.getByTestId('voice-draft'), { target: { value: 'typed instead' } })
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledWith('typed instead', false, false)
  })

  it('without read aloud, Talk records and nothing is read', async () => {
    const { onSay, set } = setup([], { on: false })
    fireEvent.click(screen.getByTestId('voice-talk'))
    await settle()
    act(() => fake.last().say('just this'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledWith('just this', false, false)
    await set({ items: [{ kind: 'user', text: 'just this' }, { kind: 'contribution', speaker: 'drucker', text: 'Fine.' }] })
    expect(tts.speak).not.toHaveBeenCalled()
  })

  it('on a keyboard the space bar finishes the recording; it does not send, and it types in the field', async () => {
    const { onSay } = setup()
    await start()
    act(() => fake.last().say('one thing'))
    await act(async () => fireEvent.keyDown(document.body, { code: 'Space' }))
    expect(fake.last().finish).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { code: 'Space' })
    expect(onSay).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('draft-text'))
    fireEvent.keyDown(screen.getByTestId('voice-draft'), { code: 'Space' })
    expect(fake.all).toHaveLength(1)
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true })
    expect(onSay).toHaveBeenCalledWith('one thing', true, false)
  })
})

describe('The floor: the room and he take turns', () => {
  it('sends, the mic stays shut while an adviser speaks, and opens again when the room is quiet', async () => {
    const { onSay, onChange, set } = setup([{ kind: 'floor', question: 'Where do you start?' }], { on: false })
    fireEvent.click(screen.getByTestId('floor-more'))
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
    expect(onChange).toHaveBeenCalledWith(true)
    await set({ on: true })
    expect(fake.all).toHaveLength(1)
    expect(tts.speak).not.toHaveBeenCalled() // what was on screen before read aloud is not read

    act(() => fake.last().say('we have no engineers'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(onSay).toHaveBeenCalledWith('we have no engineers', true, false)

    const said: Item[] = [{ kind: 'floor', question: 'Where do you start?' }, { kind: 'user', text: 'we have no engineers' }]
    await set({ items: said, streaming: true })
    expect(status()).toHaveTextContent('The council is answering. Tap to speak instead.')

    // Deltas: each completed sentence goes to the adviser's voice, in order.
    await set({ items: [...said, { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who', streaming: true }] })
    expect(spoken()).toEqual([['Start with the customer.', 'drucker']])
    expect(status()).toHaveTextContent('Drucker is answering. Tap to speak instead.')
    expect(screen.getByTestId('cut-in')).toHaveTextContent('Cut in')
    await act(async () => (vi.mocked(tts.speak).mock.calls[0]![4] as (v: string) => void)('gateway'))
    expect(status()).toHaveTextContent('Drucker, sentence 1 of 2')
    await set({
      items: [...said, { kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits?' }, { kind: 'floor', question: 'Who is the customer?' }],
      streaming: false,
    })
    // A voice turn's question is the adviser's own: one voice for the whole answer.
    expect(spoken()).toEqual([
      ['Start with the customer.', 'drucker'],
      ['Who benefits?', 'drucker'],
      ['Who is the customer?', 'drucker'],
    ])
    expect(new Set(vi.mocked(tts.speak).mock.calls.map((c) => c[6])).size).toBe(1) // one message, one voice
    expect(fake.all).toHaveLength(1) // shut while the room speaks

    await roomFinishes()
    expect(fake.all).toHaveLength(2) // the room went quiet: his turn
    expect(status()).toHaveTextContent('Recording.')

    // Off: the room stops; the floor stays.
    fireEvent.click(screen.getByTestId('floor-more'))
    fireEvent.click(screen.getByRole('button', { name: 'Stop reading aloud' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
    await set({ on: false })
    expect(screen.getByTestId('talk-status')).toBeInTheDocument()
  })

  // Pavol, 20 Nov: "it read one sentence, skipped, then read something else."
  it('what is read is the checked text on screen: a sentence that may quote waits for it, and nothing is skipped', async () => {
    const { set } = setup([], { streaming: true })
    await start()
    const said: Item[] = [{ kind: 'user', text: 'what now' }]
    await set({ items: [...said, { kind: 'contribution', speaker: 'franklin', text: 'Write *both* numbers down. As I wrote, "Lost time is never found again." Then decide.', streaming: true }] })
    expect(spoken()).toEqual([['Write *both* numbers down.', 'franklin']])
    // The check cut the unverified quote and stripped the emphasis.
    await set({ items: [...said, { kind: 'contribution', speaker: 'franklin', text: 'Write both numbers down. Then decide. Sleep on it.' }], streaming: false })
    expect(spoken()).toEqual([
      ['Write *both* numbers down.', 'franklin'],
      ['Then decide.', 'franklin'],
      ['Sleep on it.', 'franklin'],
    ])
  })

  it('Cut in stops the adviser and opens the mic at once; the sentences not read stay unread', async () => {
    const { set } = setup([], { streaming: true })
    await start()
    expect(fake.all).toHaveLength(0) // the group is answering: not his turn
    expect(fake.primeMic).toHaveBeenCalledTimes(1) // but the permission was asked inside the tap
    await set({ items: [{ kind: 'contribution', speaker: 'drucker', text: 'Who is the customer here, really? Ask them.' } as Item], streaming: false })
    await act(async () => (vi.mocked(tts.speak).mock.calls[0]![4] as (v: string) => void)('gateway'))
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
    expect(status()).toHaveTextContent('Your words go when the answer is done.')
    vi.mocked(tts.speak).mockClear()
    await set({ items: [{ ...growing, text: 'First, cut the scope. Then hire.', streaming: false } as Item], streaming: false })
    expect(tts.speak).not.toHaveBeenCalled()
    expect(onSay).toHaveBeenCalledWith('wait, no', true, false)
  })

  // Before 21 Nov a cut-in lasted until his next spoken Send: the answer to a chip was never read.
  it('a cut-in belongs to that answer: the next answer is read', async () => {
    const { set } = setup([], { streaming: true })
    await start()
    await set({ items: [{ kind: 'contribution', speaker: 'grove', text: 'Cut the scope.', streaming: true }] })
    await act(async () => fireEvent.click(screen.getByTestId('cut-in')))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    await set({ items: [{ kind: 'contribution', speaker: 'grove', text: 'Cut the scope.' }], streaming: false })
    vi.mocked(tts.speak).mockClear()
    await set({ streaming: true }) // a chip: the group answers again
    await set({ items: [{ kind: 'contribution', speaker: 'grove', text: 'Cut the scope.' }, { kind: 'contribution', speaker: 'jobs', text: 'Say no to a thousand things.' }], streaming: false })
    expect(spoken()).toEqual([['Say no to a thousand things.', 'jobs']])
  })

  it('a typed reply or a chip while the mic is open shuts it; what he had said stays as text', async () => {
    const { onSay, set } = setup()
    await start()
    act(() => fake.last().say('half a thought'))
    await set({ streaming: true })
    expect(fake.last().finish).toHaveBeenCalled()
    expect(onSay).not.toHaveBeenCalled()
    expect(words()).toBe('half a thought')
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
    fireEvent.click(screen.getByTestId('floor-more'))
    expect(screen.getByTestId('talk')).toHaveAttribute('aria-pressed', 'true')
    expect(status()).toHaveTextContent('Read aloud is on. Tap Start to carry on.')
    await set({ items: [{ kind: 'floor', question: 'Still there?' }] })
    expect(tts.speak).not.toHaveBeenCalled()
    expect(fake.openCapture).not.toHaveBeenCalled()
    await start()
    expect(onChange).not.toHaveBeenCalled()
    expect(fake.all).toHaveLength(1)
  })
})

// Review of #41.
describe('The floor: review fixes', () => {
  it('while the facilitator is read, it is the facilitator’s turn: status, Pause, and no mic', async () => {
    const { set } = setup([], { streaming: true })
    await start()
    await set({ items: [{ kind: 'facilitator', text: 'Let us hear from the group.' }], streaming: false })
    await act(async () => (vi.mocked(tts.speak).mock.calls[0]![4] as (v: string) => void)('gateway'))
    expect(status()).toHaveTextContent('The facilitator')
    expect(screen.getByTestId('voice-pause')).toBeInTheDocument()
    expect(fake.all).toHaveLength(0)
  })

  it('words sent while the group answered come back to the floor when read aloud stops', async () => {
    const { onSay, set } = setup([], { streaming: true })
    await start()
    fireEvent.click(screen.getByTestId('cut-in'))
    await settle()
    act(() => fake.last().say('hold this thought'))
    await act(async () => fireEvent.click(screen.getByTestId('voice-finish')))
    fireEvent.click(screen.getByTestId('voice-send'))
    expect(status()).toHaveTextContent('Your words go when the answer is done.')
    await set({ on: false })
    expect(words()).toBe('hold this thought')
    await set({ streaming: false })
    expect(onSay).not.toHaveBeenCalled()
  })

  it('too long for one message: it says so and Send waits (it used to be cut at 2000 silently)', async () => {
    const onSay = vi.fn()
    function Host() {
      const [slot, setSlot] = useState<HTMLDivElement | null>(null)
      return (
        <>
          <div ref={setSlot} />
          <Talk on={false} onChange={vi.fn()} items={[]} streaming={false} onSay={onSay} slot={slot} lengthOf={(w) => w.length + 1990} />
        </>
      )
    }
    render(<Host />)
    fireEvent.click(screen.getByTestId('type-instead'))
    fireEvent.change(screen.getByTestId('voice-draft'), { target: { value: 'twenty characters!!!' } })
    expect(screen.getByTestId('too-long')).toHaveTextContent('2010 of 2000')
    expect(screen.getByTestId('voice-send')).toBeDisabled()
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true })
    expect(onSay).not.toHaveBeenCalled()
  })

  it('⌘ Enter sends without read aloud too', async () => {
    const { onSay } = setup([], { on: false })
    fireEvent.click(screen.getByTestId('type-instead'))
    fireEvent.change(screen.getByTestId('voice-draft'), { target: { value: 'typed' } })
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true })
    expect(onSay).toHaveBeenCalledWith('typed', false, false)
  })
})

describe('The floor: a line that did not load', () => {
  it('holds the room at that line in that voice; Tap to hear reads it and the rest', async () => {
    const { set } = setup([], { streaming: true })
    await start()
    await set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'One. Two. Three.' }, { kind: 'floor', question: 'And?' }], streaming: false })
    const calls = vi.mocked(tts.speak).mock.calls
    await act(async () => (calls[0]![2] as () => void)()) // "One." played
    await act(async () => (calls[1]![5] as () => void)()) // "Two." did not load, twice
    expect(tts.cancel).toHaveBeenCalled()
    expect(status()).toHaveTextContent('Seneca’s voice did not load. Tap to hear it, or read it above.')
    expect(fake.all).toHaveLength(0) // the room holds: the mic does not open
    vi.mocked(tts.speak).mockClear()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap to hear' })))
    expect(spoken()).toEqual([
      ['Two.', 'seneca'],
      ['Three.', 'seneca'],
      ['And?', 'seneca'],
    ])
  })
})

describe('The floor: what fails is said', () => {
  // Review of #41: read aloud does not need the mic. A blocked mic is said; reading stays on.
  it('a blocked mic is said in words and logged; read aloud stays on', async () => {
    fake.state.reject = new SttError('denied')
    const { onChange, set } = setup([], { on: false })
    fireEvent.click(screen.getByTestId('floor-more'))
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
    await set({ on: true })
    expect(onChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByTestId('talk-problem')).toHaveTextContent(/blocked/i)
    await set({ items: [{ kind: 'contribution', speaker: 'seneca', text: 'Count the days.' }] })
    expect(spoken()).toEqual([['Count the days.', 'seneca']])
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'mic', reason: 'denied', talk: true })
  })

  it('thinking before he speaks, turn after turn, shows no warning and logs nothing', async () => {
    vi.useFakeTimers()
    setup()
    await start()
    act(() => vi.advanceTimersByTime(20_000))
    expect(status()).toHaveTextContent('Recording. Say something when you are ready.')
    expect(analytics.keyAction).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('a flat input for 3 s is said in the status line, with the input’s name, and logged', async () => {
    vi.useFakeTimers()
    setup()
    await start()
    fake.last().flat = 3100
    act(() => vi.advanceTimersByTime(500))
    expect(status()).toHaveTextContent('I can’t hear anything from “Desk microphone”. Check the input, or speak up.')
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'meter', reason: 'heard_nothing', talk: true })
    vi.useRealTimers()
  })

  it('the mic taken away mid-turn: his words stay, it says so, and one tap carries on', async () => {
    const { onSay } = setup()
    await start()
    act(() => fake.last().say('before I left'))
    await act(async () => fake.last().lose())
    expect(screen.getByTestId('talk-problem')).toHaveTextContent('The microphone stopped when you left the page. Tap to carry on.')
    expect(words()).toBe('before I left')
    expect(onSay).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('voice-more'))
    await settle()
    act(() => fake.last().say('after I came back'))
    expect(words()).toBe('before I left after I came back')
  })

  it('Cut in with words already waiting stops the adviser and opens the mic to add to them', async () => {
    const { set } = setup()
    await start()
    act(() => fake.last().say('half a thought'))
    await set({ items: [{ kind: 'contribution', speaker: 'drucker', text: 'Who is the customer here, really?' } as Item] })
    await act(async () => fireEvent.click(screen.getByTestId('cut-in')))
    expect(tts.cancel).toHaveBeenCalled()
    expect(fake.all).toHaveLength(2)
    act(() => fake.last().say('and the rest'))
    expect(words()).toBe('half a thought and the rest')
  })

  it('switching read aloud off keeps the words on the floor', async () => {
    const { onSay, set } = setup()
    await start()
    act(() => fake.last().say('not sent yet'))
    await set({ on: false })
    expect(words()).toBe('not sent yet')
    expect(onSay).not.toHaveBeenCalled()
  })

  it('leaving the screen closes the mic and sends nothing', async () => {
    const { onSay, unmount } = setup()
    await start()
    act(() => fake.last().say('too late'))
    unmount()
    expect(fake.last().finish).toHaveBeenCalled()
    expect(onSay).not.toHaveBeenCalled()
  })
})

describe('The floor: the wait to the first word', () => {
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
