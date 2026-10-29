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
})
