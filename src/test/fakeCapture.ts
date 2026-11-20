import { vi } from 'vitest'
import type { CaptureEvents, CaptureSink } from '@/domain/capture'

// The seam under every recording surface: openCapture() faked, driven by the test.
// `say` lands a finished piece, `loud` moves the meter, `open` holds the permission prompt.

export function fakeCaptures() {
  const all: FakeCapture[] = []
  const state = { hold: false, reject: null as unknown, release: [] as (() => void)[] }
  const make = (sink: CaptureSink, ev: CaptureEvents) => {
    const c = {
      sink,
      ev,
      label: 'Desk microphone',
      loud: 0,
      heardYet: false,
      running: true,
      level: () => c.loud,
      heard: () => c.heardYet,
      /** How long the input has been digitally flat (a dead input); 0 for a room, however quiet. */
      flat: 0,
      flatMs: () => c.flat,
      /** Set before Finish: finish() then resolves only when the test calls land(). */
      hold: false,
      land: () => {},
      audioRunning: () => c.running,
      wake: vi.fn(),
      retarget: vi.fn((next: CaptureSink) => void (c.sink = next)),
      finish: vi.fn(() => (c.hold ? new Promise<void>((resolve) => (c.land = resolve)) : Promise.resolve())),
      cancel: vi.fn(),
      /** He speaks: the meter moves. */
      speak() {
        c.loud = 0.2
        c.heardYet = true
      },
      /** The phone took the mic away. */
      lose: (away = true) => c.ev.onLost('ended', away),
      /** A finished piece of his words lands. */
      say: (text: string) => c.sink.onText(text),
    }
    return c
  }
  type FakeCapture = ReturnType<typeof make>
  const openCapture = vi.fn((sink: CaptureSink, ev: CaptureEvents) => {
    if (state.reject) return Promise.reject(state.reject)
    const c = make(sink, ev)
    all.push(c)
    if (!state.hold) return Promise.resolve(c)
    return new Promise<FakeCapture>((resolve) => state.release.push(() => resolve(c)))
  })
  return {
    all,
    state,
    openCapture,
    primeMic: vi.fn(),
    last: () => all[all.length - 1]!,
    reset() {
      all.length = 0
      state.hold = false
      state.reject = null
      state.release = []
      openCapture.mockClear()
    },
  }
}
