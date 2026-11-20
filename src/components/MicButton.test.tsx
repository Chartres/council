import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SttError } from '@/domain/stt'

// Pavol, 20 Nov: "the microphone lit up, but nothing happened … I need a really live feedback
// where I see, yes, what I'm talking is being captured. And if it is not, then I need to know
// that immediately." And: "I did not like this stressful thing that waits for silence."

const analytics = vi.hoisted(() => ({ keyAction: vi.fn() }))
vi.mock('@/analytics', () => analytics)
const fake = await vi.hoisted(async () => (await import('@/test/fakeCapture')).fakeCaptures())
vi.mock('@/domain/capture', async (orig) => ({ ...(await orig<object>()), openCapture: fake.openCapture }))
vi.mock('@/domain/stt', async (orig) => ({ ...(await orig<object>()), recordingSupported: () => true }))

const { MicButton } = await import('./MicButton')
const { captureStatus, flameTransform, DEAF_MS } = await import('./Capture')

function Field({ start = '' }: { start?: string }) {
  const [value, setValue] = useState(start)
  return (
    <>
      <textarea aria-label="idea" value={value} onChange={(e) => setValue(e.target.value)} />
      <MicButton value={value} onChange={setValue} label="your idea" />
    </>
  )
}
const field = () => screen.getByLabelText('idea') as HTMLTextAreaElement
const mic = () => screen.getByTestId('mic')
const status = () => screen.getByTestId('capture-status')
const open = async () => {
  fireEvent.click(mic())
  await act(async () => {})
}

beforeEach(() => {
  vi.useFakeTimers()
  fake.reset()
  analytics.keyAction.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('MicButton: the state in words, at once', () => {
  it('opens the mic inside the tap and says it is waiting while the permission prompt is up', async () => {
    fake.state.hold = true
    render(<Field />)
    expect(mic()).toHaveTextContent('Tap and talk')
    fireEvent.click(mic())
    expect(fake.openCapture).toHaveBeenCalledTimes(1) // before the click returned
    expect(status()).toHaveTextContent('Waiting for the microphone. Nothing is recorded yet.')
    expect(mic()).toHaveTextContent('Finish')

    await act(async () => fake.state.release[0]!())
    expect(status()).toHaveTextContent('Recording. Say something.')
    expect(screen.getByTestId('thread')).toBeInTheDocument()
    expect(screen.getByTestId('device')).toBeInTheDocument()
  })

  it('says it can hear him once sound comes in', async () => {
    render(<Field />)
    await open()
    act(() => fake.last().speak())
    act(() => vi.advanceTimersByTime(300))
    expect(status()).toHaveTextContent('Recording. I can hear you.')
  })

  it('no sound for 3 s: names the input, says what to do, and logs the reason', async () => {
    render(<Field />)
    await open()
    act(() => vi.advanceTimersByTime(DEAF_MS - 500))
    expect(status()).toHaveTextContent('Recording. Say something.')
    act(() => vi.advanceTimersByTime(1000))
    expect(status()).toHaveTextContent('I can’t hear anything from “Desk microphone”. Check the input, or speak up.')
    act(() => vi.advanceTimersByTime(10_000))
    expect(analytics.keyAction.mock.calls.filter((c) => c[1]?.reason === 'heard_nothing')).toEqual([
      ['mic_failed', { engine: 'meter', reason: 'heard_nothing' }],
    ])
    // The moment sound arrives, the sentence changes.
    act(() => fake.last().speak())
    act(() => vi.advanceTimersByTime(300))
    expect(status()).toHaveTextContent('Recording. I can hear you.')
  })

  it('paused audio has its own sentence, and a tap wakes it', async () => {
    render(<Field />)
    await open()
    fake.last().running = false
    act(() => vi.advanceTimersByTime(300))
    expect(status()).toHaveTextContent('The browser has paused audio')
    fireEvent.pointerDown(document.body)
    expect(fake.last().wake).toHaveBeenCalled()
  })

  it('a blocked mic and a missing one each get their sentence, and are logged', async () => {
    fake.state.reject = new SttError('denied')
    render(<Field />)
    await open()
    expect(screen.getByRole('alert')).toHaveTextContent('The microphone is blocked for this site.')
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'mic', reason: 'denied' })
    expect(mic()).toHaveTextContent('Tap and talk')

    fake.state.reject = new SttError('no_mic')
    await open()
    expect(screen.getByRole('alert')).toHaveTextContent('No microphone found on this device.')
  })
})

describe('MicButton: no waiting for silence', () => {
  it('a long pause ends nothing: it records until he taps Finish', async () => {
    render(<Field />)
    await open()
    act(() => fake.last().speak())
    act(() => vi.advanceTimersByTime(300))
    fake.last().loud = 0
    act(() => vi.advanceTimersByTime(5 * 60_000)) // five minutes of thinking
    expect(fake.last().finish).not.toHaveBeenCalled()
    expect(fake.last().cancel).not.toHaveBeenCalled()
    expect(mic()).toHaveTextContent('Finish')
    expect(status()).toHaveTextContent('Recording. Take your time.')

    await act(async () => fireEvent.click(mic()))
    expect(fake.last().finish).toHaveBeenCalledTimes(1)
    expect(mic()).toHaveTextContent('Tap and talk')
  })
})

describe('MicButton: the words are his to correct', () => {
  it('each piece is added after what he typed, as it arrives', async () => {
    render(<Field start="Pilot the tier" />)
    await open()
    act(() => fake.last().say('with ten customers'))
    expect(field().value).toBe('Pilot the tier with ten customers')
    act(() => fake.last().say('before the summer'))
    expect(field().value).toBe('Pilot the tier with ten customers before the summer')
  })

  it('a second recording adds to the text he corrected by hand', async () => {
    render(<Field />)
    await open()
    act(() => fake.last().say('we have no engineers'))
    await act(async () => fireEvent.click(mic()))
    fireEvent.change(field(), { target: { value: 'We have two engineers.' } })

    await open()
    expect(fake.all).toHaveLength(2)
    act(() => fake.last().say('and no designer'))
    expect(field().value).toBe('We have two engineers. and no designer')
  })

  it('what he types while it records is kept: a later piece lands after it', async () => {
    render(<Field />)
    await open()
    act(() => fake.last().say('first'))
    fireEvent.change(field(), { target: { value: 'First, corrected.' } })
    act(() => fake.last().say('second'))
    expect(field().value).toBe('First, corrected. second')
  })

  it('shows the words still forming and "Writing it down…" while a part is with the gateway', async () => {
    render(<Field />)
    await open()
    act(() => fake.last().sink.onInterim?.('we have no'))
    expect(screen.getByTestId('capture-interim')).toHaveTextContent('we have no')
    act(() => fake.last().ev.onPending(1))
    expect(screen.getByTestId('capture-writing')).toHaveTextContent('Writing it down…')
    await act(async () => fireEvent.click(mic()))
    expect(mic()).toBeDisabled() // the last part is still being written down
    act(() => fake.all[0]!.ev.onPending(0))
    expect(mic()).toHaveTextContent('Tap and talk')
  })

  it('a part that failed is said in words and logged; a recovered engine is only logged', async () => {
    render(<Field />)
    await open()
    act(() => fake.last().ev.onProblem('browser', 'network', true))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'browser', reason: 'network', recovered: true })
    act(() => fake.last().ev.onProblem('server', 'network', false))
    expect(screen.getByRole('alert')).toHaveTextContent('Part of what you said could not be written down.')
    expect(analytics.keyAction).toHaveBeenCalledWith('mic_failed', { engine: 'server', reason: 'network' })
  })

  it('sound but no words at all: says so after Finish', async () => {
    render(<Field />)
    await open()
    act(() => fake.last().speak())
    await act(async () => fireEvent.click(mic()))
    expect(screen.getByRole('alert')).toHaveTextContent('I heard sound but no words.')
  })
})

describe('captureStatus and the flame', () => {
  const live = { state: 'live' as const, running: true, heard: true, liveMs: 9000, quietMs: 0, label: 'Desk microphone' }
  it('one sentence per state', () => {
    expect(captureStatus({ ...live, state: 'asking' }).text).toBe('Waiting for the microphone. Nothing is recorded yet.')
    expect(captureStatus(live).text).toBe('Recording. I can hear you.')
    expect(captureStatus({ ...live, heard: false })).toMatchObject({
      tone: 'bad',
      deaf: true,
      text: 'I can’t hear anything from “Desk microphone”. Check the input, or speak up.',
    })
    expect(captureStatus({ ...live, heard: false, liveMs: 1000 }).text).toBe('Recording. Say something.')
    expect(captureStatus({ ...live, running: false }).tone).toBe('bad')
  })

  it('the flame does not grow with volume: a few percent and a few degrees at the loudest, still when quiet', () => {
    expect(flameTransform(0, 1234)).toBe('')
    for (let t = 0; t < 2000; t += 37) {
      const [, skew, sx, sy] = /skewX\((-?[\d.]+)deg\) scale\((-?[\d.]+), (-?[\d.]+)\)/.exec(flameTransform(1, t))!.map(Number)
      expect(Math.abs(skew!)).toBeLessThanOrEqual(5)
      expect(Math.abs(sx! - 1)).toBeLessThanOrEqual(0.0301)
      expect(Math.abs(sy! - 1)).toBeLessThanOrEqual(0.0501)
    }
  })
})
