import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Item } from '@/domain/mastermind'
import * as tts from '@/domain/tts'

// Talk on an iPhone: the browser recogniser hears nothing there (Eyal, 11 and 29 Oct), so the
// gateway's ears take turns with the room. record() and transcribe() are the seams.

vi.mock('@/domain/tts', () => ({ speak: vi.fn(), cancel: vi.fn(), setFallback: vi.fn(), setSession: vi.fn(), unlock: vi.fn() }))
const analytics = vi.hoisted(() => ({ keyAction: vi.fn() }))
vi.mock('@/analytics', () => analytics)
const stt = vi.hoisted(() => {
  class SttError extends Error {
    constructor(readonly reason: string) {
      super(reason)
    }
  }
  return {
    serverEars: vi.fn(() => true),
    recordingSupported: vi.fn(() => true),
    record: vi.fn(),
    transcribe: vi.fn(),
    unlockAudioInput: vi.fn(),
    markBrowserEngineBroken: vi.fn(),
    SttError,
  }
})
vi.mock('@/domain/stt', () => stt)

const { Talk } = await import('./Talk')

type Opts = { onSilence?: () => void }
let clips: { opts: Opts; stop: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }[] = []

beforeEach(() => {
  clips = []
  stt.record.mockReset()
  stt.transcribe.mockReset()
  stt.unlockAudioInput.mockClear()
  analytics.keyAction.mockClear()
  vi.mocked(tts.speak).mockReset()
  vi.mocked(tts.cancel).mockReset()
  stt.record.mockImplementation(async (opts: Opts) => {
    const c = { opts, stop: vi.fn(async () => ({ clip: new Blob(['a'], { type: 'audio/mp4' }), heard: true })), cancel: vi.fn() }
    clips.push(c)
    return c
  })
})
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
})

describe('Talk with the gateway’s ears (iPhone)', () => {
  it('takes turns: records while the room is quiet, sends, stays shut while an adviser speaks, listens again after', async () => {
    const onSay = vi.fn()
    const onChange = vi.fn()
    let items: Item[] = [{ kind: 'floor', question: 'Where do you start?' }]
    let streaming = false
    const view = (on: boolean) => <Talk on={on} onChange={onChange} items={items} streaming={streaming} onSay={onSay} />
    const { rerender } = render(view(false))

    // The tap unlocks both the player and the mic's loudness watch (iOS needs the tap for both).
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    expect(tts.unlock).toHaveBeenCalled()
    expect(stt.unlockAudioInput).toHaveBeenCalled()
    await act(async () => rerender(view(true)))
    expect(stt.record).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Listening…')

    // Her pause ends the clip; the words go as a voice turn.
    stt.transcribe.mockResolvedValue('we have no engineers')
    await act(async () => clips[0]!.opts.onSilence?.())
    expect(onSay).toHaveBeenCalledWith('we have no engineers')

    // The adviser answers: the mic stays shut while the line plays, and she may cut in.
    streaming = true
    items = [...items, { kind: 'user', text: 'we have no engineers' }, { kind: 'contribution', speaker: 'grove', text: 'Then hire one. Or cut the scope.' } as Item]
    await act(async () => rerender(view(true)))
    expect(tts.speak).toHaveBeenCalled()
    expect(stt.record).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('is talking…')
    expect(screen.getByTestId('cut-in')).toBeTruthy()

    // The room finishes: the stream is done and the last line ends — her turn again.
    streaming = false
    await act(async () => rerender(view(true)))
    for (const call of vi.mocked(tts.speak).mock.calls) await act(async () => (call[2] as () => void)?.())
    expect(stt.record).toHaveBeenCalledTimes(2)
  })

  it('Cut in stops the adviser and opens the mic at once', async () => {
    const view = (items: Item[], streaming: boolean) => (
      <Talk on onChange={() => {}} items={items} streaming={streaming} onSay={() => {}} />
    )
    const { rerender } = render(view([], false))
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    await act(async () => rerender(view([], false)))
    stt.transcribe.mockResolvedValue('hold on')
    await act(async () => clips[0]!.opts.onSilence?.())
    await act(async () =>
      rerender(view([{ kind: 'contribution', speaker: 'drucker', text: 'Who is the customer here, really?' } as Item], false)),
    )
    expect(screen.getByTestId('cut-in')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByTestId('cut-in')))
    expect(tts.cancel).toHaveBeenCalled()
    expect(stt.record).toHaveBeenCalledTimes(2)
  })

  it('a blocked mic is said in words, logged, and Talk switches off', async () => {
    stt.record.mockRejectedValue(new stt.SttError('denied'))
    const onChange = vi.fn()
    const { rerender } = render(<Talk on={false} onChange={onChange} items={[]} streaming={false} onSay={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    await act(async () => rerender(<Talk on onChange={onChange} items={[]} streaming={false} onSay={() => {}} />))
    expect(screen.getByRole('alert')).toHaveTextContent(/blocked/i)
    expect(onChange).toHaveBeenLastCalledWith(false)
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'server', reason: 'denied', talk: true })
  })

  it('a typed reply or a chip while the mic is open shuts it: the answer is never recorded as hers', async () => {
    const onSay = vi.fn()
    const view = (items: Item[], streaming: boolean) => <Talk on onChange={() => {}} items={items} streaming={streaming} onSay={onSay} />
    const { rerender } = render(view([], false))
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    await act(async () => rerender(view([], false)))
    expect(clips).toHaveLength(1)
    await act(async () => rerender(view([], true))) // she typed and sent; the group answers
    expect(clips[0]!.cancel).toHaveBeenCalled()
    stt.transcribe.mockResolvedValue('the room talking')
    await act(async () => clips[0]!.opts.onSilence?.())
    expect(onSay).not.toHaveBeenCalled()
  })

  it('the last question and the end of the stream in one render: the mic waits for the question to be read', async () => {
    const view = (items: Item[], streaming: boolean) => <Talk on onChange={() => {}} items={items} streaming={streaming} onSay={() => {}} />
    const { rerender } = render(view([], false))
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    await act(async () => rerender(view([], false)))
    stt.transcribe.mockResolvedValue('go on')
    await act(async () => clips[0]!.opts.onSilence?.())
    await act(async () => rerender(view([{ kind: 'user', text: 'go on' } as Item], true)))
    await act(async () => rerender(view([{ kind: 'user', text: 'go on' } as Item, { kind: 'floor', question: 'Which first?' }], false)))
    // A clip may have been opened by the stream ending, but the question's voice shut it.
    expect(clips.slice(1).every((c) => c.cancel.mock.calls.length > 0)).toBe(true)
    const done = vi.mocked(tts.speak).mock.calls.at(-1)![2] as () => void
    await act(async () => done())
    expect(clips.at(-1)!.cancel).not.toHaveBeenCalled()
  })

  it('Cut in while the answer is still streaming opens the mic; her words wait for the answer to end', async () => {
    const onSay = vi.fn()
    const growing = { kind: 'contribution', speaker: 'grove', text: 'First, cut the scope. Then', streaming: true } as Item
    const view = (items: Item[], streaming: boolean) => <Talk on onChange={() => {}} items={items} streaming={streaming} onSay={onSay} />
    const { rerender } = render(view([], false))
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    await act(async () => rerender(view([], false)))
    stt.transcribe.mockResolvedValueOnce('first one')
    await act(async () => clips[0]!.opts.onSilence?.())
    await act(async () => rerender(view([growing], true)))
    await act(async () => fireEvent.click(screen.getByTestId('cut-in')))
    expect(stt.record).toHaveBeenCalledTimes(2)
    stt.transcribe.mockResolvedValueOnce('wait, no')
    await act(async () => clips[1]!.opts.onSilence?.())
    expect(onSay).toHaveBeenCalledTimes(1)
    await act(async () => rerender(view([{ ...growing, streaming: false } as Item], false)))
    expect(onSay).toHaveBeenLastCalledWith('wait, no')
  })

  it('leaving the screen, or switching Talk off while it writes her words down, drops them and closes the mic', async () => {
    const onSay = vi.fn()
    let finish: (t: string) => void = () => {}
    stt.transcribe.mockImplementation(() => new Promise<string>((res) => (finish = res)))
    const view = (on: boolean) => <Talk on={on} onChange={() => {}} items={[]} streaming={false} onSay={onSay} />
    const { rerender, unmount } = render(view(false))
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    await act(async () => rerender(view(true)))
    await act(async () => void clips[0]!.opts.onSilence?.())
    expect(screen.getByRole('status')).toHaveTextContent('Writing it down…')
    await act(async () => rerender(view(false)))
    await act(async () => finish('too late'))
    expect(onSay).not.toHaveBeenCalled()
    unmount()
    expect(stt.record).toHaveBeenCalledTimes(1)
  })
})
