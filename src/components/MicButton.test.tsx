import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

const analytics = vi.hoisted(() => ({ keyAction: vi.fn() }))
vi.mock('@/analytics', () => analytics)
// The gateway ears are a seam: record() and transcribe() are faked, serverEars() decides the mode.
const stt = vi.hoisted(() => {
  class SttError extends Error {
    constructor(readonly reason: string) {
      super(reason)
    }
  }
  return { serverEars: vi.fn(() => false), recordingSupported: vi.fn(() => true), record: vi.fn(), transcribe: vi.fn(), markBrowserEngineBroken: vi.fn(), unlockAudioInput: vi.fn(), SttError }
})
vi.mock('@/domain/stt', () => stt)

const { MicButton, SILENCE_MS } = await import('./MicButton')

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
  analytics.keyAction.mockClear()
  stt.record.mockReset()
  stt.transcribe.mockReset()
  vi.useFakeTimers({ shouldAdvanceTime: true })
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

describe('MicButton says what went wrong instead of failing silently (Eyal, 11 and 29 Oct)', () => {
  it('names a blocked mic and keeps the keyboard mic as the way out', async () => {
    const { getByTestId, findByRole } = render(<MicButton value="" onChange={() => {}} label="Goal" />)
    act(() => getByTestId('mic').click())
    const r = Fake.all[0]!
    act(() => {
      ;(r.onerror as unknown as (e: { error: string }) => void)({ error: 'not-allowed' })
      r.onend?.()
    })
    expect((await findByRole('alert')).textContent).toMatch(/blocked.*keyboard/i)
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'browser', reason: 'not-allowed' })
  })
})

describe('MicButton records for the gateway where the browser cannot hear (iPhone)', () => {
  beforeEach(() => {
    stt.serverEars.mockReturnValue(true)
  })
  afterEach(() => {
    stt.serverEars.mockReturnValue(false)
  })

  it('records, stops after a real pause, and puts the words after what she typed', async () => {
    let silence: (() => void) | undefined
    stt.record.mockImplementation(async (o: { onSilence?: () => void }) => {
      silence = o.onSilence
      return { stop: vi.fn(async () => ({ clip: new Blob(['a'], { type: 'audio/mp4' }), heard: true })), cancel: vi.fn() }
    })
    stt.transcribe.mockResolvedValue('and ship it by Friday')
    const onChange = vi.fn()
    const onDone = vi.fn()
    const { getByTestId } = render(<MicButton value="Pilot the tier" onChange={onChange} label="Goal" onDone={onDone} />)
    await act(async () => getByTestId('mic').click())
    expect(getByTestId('mic').getAttribute('aria-pressed')).toBe('true')
    expect(Fake.all).toHaveLength(0)
    await act(async () => silence?.())
    expect(stt.transcribe).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('Pilot the tier and ship it by Friday')
    expect(onDone).toHaveBeenCalledWith('and ship it by Friday')
    expect(getByTestId('mic').getAttribute('aria-pressed')).toBe('false')
  })

  it('a tap stops it early and still sends what was said', async () => {
    const stop = vi.fn(async () => ({ clip: new Blob(['a']), heard: false }))
    stt.record.mockResolvedValue({ stop, cancel: vi.fn() })
    stt.transcribe.mockResolvedValue('quietly said')
    const onChange = vi.fn()
    const { getByTestId } = render(<MicButton value="" onChange={onChange} label="Goal" />)
    await act(async () => getByTestId('mic').click())
    await act(async () => getByTestId('mic').click())
    expect(stop).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('quietly said')
  })

  it('tells her when the gateway could not transcribe, and logs why', async () => {
    let silence: (() => void) | undefined
    stt.record.mockImplementation(async (o: { onSilence?: () => void }) => {
      silence = o.onSilence
      return { stop: vi.fn(async () => ({ clip: new Blob(['a']), heard: true })), cancel: vi.fn() }
    })
    stt.transcribe.mockRejectedValue(new stt.SttError('quota'))
    const { getByTestId, findByRole } = render(<MicButton value="" onChange={() => {}} label="Goal" />)
    await act(async () => getByTestId('mic').click())
    await act(async () => silence?.())
    expect((await findByRole('alert')).textContent).toMatch(/today.*limit/i)
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'server', reason: 'quota' })
  })

  it('a denied mic permission is named before anything is sent', async () => {
    stt.record.mockRejectedValue(new stt.SttError('denied'))
    const { getByTestId, findByRole } = render(<MicButton value="" onChange={() => {}} label="Goal" />)
    await act(async () => getByTestId('mic').click())
    expect((await findByRole('alert')).textContent).toMatch(/blocked/i)
    expect(stt.transcribe).not.toHaveBeenCalled()
  })
})
