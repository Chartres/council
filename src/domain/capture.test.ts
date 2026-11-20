import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// One capture path (Pavol, 20 Nov): the mic opens inside the tap, a recording ends only when he
// says so, and long answers are cut into parts the gateway can take. The fakes: a stream, a
// recorder that "records" a counter, a loudness meter the test drives, and transcribe().

const stt = vi.hoisted(() => {
  class SttError extends Error {
    constructor(readonly reason: string) {
      super(reason)
    }
  }
  return {
    SttError,
    transcribe: vi.fn(),
    serverEars: vi.fn(() => true),
    recordingSupported: vi.fn(() => true),
    markBrowserEngineBroken: vi.fn(),
    unlockAudioInput: vi.fn(),
    mimeType: () => 'audio/webm',
  }
})
vi.mock('./stt', () => stt)

const { openCapture, primeMic, MAX_PART_MS, PAUSE_CUT_MS, WORDLESS_MS } = await import('./capture')

let loud = false
let ctxState = 'running'
let stopped = 0
let recorders: FakeRecorder[] = []
const track = { label: 'Desk microphone', stop: () => void stopped++, onended: null as null | (() => void) }
const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
const getUserMedia = vi.fn(async () => stream)

class FakeRecorder {
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  n: number
  constructor() {
    recorders.push(this)
    this.n = recorders.length
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob([`clip${this.n}`]) })
    this.onstop?.()
  }
}

class Rec {
  static all: Rec[] = []
  continuous = false
  interimResults = false
  results: { t: string; final: boolean }[] = []
  onresult: ((e: { results: unknown[] }) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e?: { error?: string }) => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
  constructor() {
    Rec.all.push(this)
  }
  say(t: string, final = true) {
    const last = this.results[this.results.length - 1]
    if (last && !last.final) this.results.pop()
    this.results.push({ t, final })
    this.onresult?.({ results: this.results.map((r) => Object.assign([{ transcript: r.t }], { isFinal: r.final })) })
  }
}

const ctx = {
  get state() {
    return ctxState
  },
  resume: vi.fn(),
  createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
  createAnalyser: () => ({
    fftSize: 1024,
    getByteTimeDomainData(buf: Uint8Array) {
      for (let i = 0; i < buf.length; i++) buf[i] = loud ? (i % 2 ? 200 : 56) : 128
    },
  }),
}

const sink = () => {
  const heard: string[] = []
  const interim: string[] = []
  return { heard, interim, onText: (t: string) => void heard.push(t), onInterim: (t: string) => void interim.push(t) }
}
const events = () => ({ onPending: vi.fn(), onProblem: vi.fn() })
const clipText = (b: Blob) => b.text()
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  loud = false
  ctxState = 'running'
  stopped = 0
  recorders = []
  Rec.all = []
  stt.transcribe.mockReset()
  stt.serverEars.mockReturnValue(true)
  stt.markBrowserEngineBroken.mockClear()
  stt.unlockAudioInput.mockReset()
  stt.unlockAudioInput.mockReturnValue(ctx)
  getUserMedia.mockClear()
  getUserMedia.mockImplementation(async () => stream)
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
})

describe('openCapture: the mic', () => {
  it('asks for the mic and wakes the audio before anything is awaited: inside the tap', () => {
    void openCapture(sink(), events())
    expect(stt.unlockAudioInput).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('names a blocked mic and a missing one', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
    await expect(openCapture(sink(), events())).rejects.toMatchObject({ reason: 'denied' })
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotFoundError' }))
    await expect(openCapture(sink(), events())).rejects.toMatchObject({ reason: 'no_mic' })
  })

  it('reports the input by name, its level, and whether the audio is running', async () => {
    const c = await openCapture(sink(), events())
    expect(c.label).toBe('Desk microphone')
    expect(c.level()).toBe(0)
    expect(c.heard()).toBe(false)
    loud = true
    vi.advanceTimersByTime(100)
    expect(c.level()).toBeGreaterThan(0.3)
    expect(c.heard()).toBe(true)
    expect(c.audioRunning()).toBe(true)
    ctxState = 'suspended'
    expect(c.audioRunning()).toBe(false)
    c.cancel()
  })

  it('primeMic asks for permission inside the tap and lets the mic go at once', async () => {
    primeMic()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    await settle()
    expect(stopped).toBe(1)
  })
})

describe('openCapture: no waiting for silence', () => {
  it('a long pause after speaking does not end the recording; only finish does', async () => {
    stt.transcribe.mockResolvedValue('so I think')
    const s = sink()
    const c = await openCapture(s, events())
    loud = true
    vi.advanceTimersByTime(2000)
    loud = false
    vi.advanceTimersByTime(120_000) // two minutes of thinking
    await settle()
    expect(stopped).toBe(0) // the mic is still open
    expect(recorders.at(-1)!.state).toBe('recording')
    expect(s.heard).toEqual(['so I think']) // what he said before the pause is already text

    loud = true
    vi.advanceTimersByTime(1000)
    stt.transcribe.mockResolvedValue('we should wait')
    await c.finish()
    expect(s.heard).toEqual(['so I think', 'we should wait'])
    expect(stopped).toBe(1)
  })

  it('never opened his mouth: nothing is sent to the gateway, however long it stays open', async () => {
    const c = await openCapture(sink(), events())
    vi.advanceTimersByTime(MAX_PART_MS * 3)
    await c.finish()
    expect(stt.transcribe).not.toHaveBeenCalled()
  })
})

describe('openCapture: parts', () => {
  it('cuts before the gateway’s limit, keeps recording, and joins the parts in order', async () => {
    const answers: ((t: string) => void)[] = []
    stt.transcribe.mockImplementation(() => new Promise<string>((res) => answers.push(res)))
    const s = sink()
    const ev = events()
    const c = await openCapture(s, ev)
    loud = true
    vi.advanceTimersByTime(MAX_PART_MS * 2 + 5000) // talking for 105 s without a pause
    await settle()
    expect(stt.transcribe).toHaveBeenCalledTimes(2)
    expect(recorders).toHaveLength(3)
    expect(recorders[2]!.state).toBe('recording') // no gap: the third part is already running
    expect(ev.onPending).toHaveBeenLastCalledWith(2)
    const done = c.finish()
    await settle()
    expect(stt.transcribe).toHaveBeenCalledTimes(3)
    expect(await Promise.all(stt.transcribe.mock.calls.map((call) => clipText(call[0] as Blob)))).toEqual(['clip1', 'clip2', 'clip3'])

    // The gateway answers out of order; the text is joined in the order it was said.
    answers[2]!('three')
    answers[1]!('two')
    await settle()
    expect(s.heard).toEqual([])
    answers[0]!('one')
    await done
    expect(s.heard).toEqual(['one', 'two', 'three'])
    expect(ev.onPending).toHaveBeenLastCalledWith(0)
  })

  it('a pause after speech sends that part to be written down while the recording goes on', async () => {
    stt.transcribe.mockResolvedValue('first thought')
    const s = sink()
    const c = await openCapture(s, events())
    loud = true
    vi.advanceTimersByTime(3000)
    loud = false
    vi.advanceTimersByTime(PAUSE_CUT_MS + 100)
    await settle()
    expect(s.heard).toEqual(['first thought'])
    expect(recorders.at(-1)!.state).toBe('recording')
    c.cancel()
  })

  it('a part the gateway could not write down is said, and the rest still lands', async () => {
    stt.transcribe.mockRejectedValueOnce(new stt.SttError('quota')).mockResolvedValueOnce('the second part')
    const s = sink()
    const ev = events()
    const c = await openCapture(s, ev)
    loud = true
    vi.advanceTimersByTime(MAX_PART_MS + 1000)
    await c.finish()
    expect(ev.onProblem).toHaveBeenCalledWith('server', 'quota', false)
    expect(s.heard).toEqual(['the second part'])
  })

  it('tries a part once more when the network dropped it', async () => {
    stt.transcribe.mockRejectedValueOnce(new stt.SttError('network')).mockResolvedValueOnce('made it')
    const s = sink()
    const ev = events()
    const c = await openCapture(s, ev)
    loud = true
    vi.advanceTimersByTime(1000)
    await c.finish()
    expect(s.heard).toEqual(['made it'])
    expect(ev.onProblem).not.toHaveBeenCalled()
  })

  it('retarget: what was said before goes to the old field, what comes after to the new one', async () => {
    stt.transcribe.mockResolvedValueOnce('the goal').mockResolvedValueOnce('the situation')
    const a = sink()
    const b = sink()
    const c = await openCapture(a, events())
    loud = true
    vi.advanceTimersByTime(1000)
    c.retarget(b)
    vi.advanceTimersByTime(1000)
    await c.finish()
    expect(a.heard).toEqual(['the goal'])
    expect(b.heard).toEqual(['the situation'])
    expect(getUserMedia).toHaveBeenCalledTimes(1) // one mic, one permission
  })

  it('a recorder that will not start the next part is said, not swallowed', async () => {
    const ev = events()
    const c = await openCapture(sink(), ev)
    vi.stubGlobal('MediaRecorder', class { constructor() { throw new Error('no') } })
    loud = true
    vi.advanceTimersByTime(MAX_PART_MS + 5000)
    expect(ev.onProblem).toHaveBeenCalledWith('server', 'recorder', false)
    expect(ev.onProblem).toHaveBeenCalledTimes(1)
    c.cancel()
  })

  it('cancel throws the recording away', async () => {
    const s = sink()
    const c = await openCapture(s, events())
    loud = true
    vi.advanceTimersByTime(1000)
    c.cancel()
    await settle()
    expect(stt.transcribe).not.toHaveBeenCalled()
    expect(stopped).toBe(1)
  })
})

describe('openCapture: live words from the browser where it has them', () => {
  beforeEach(() => {
    stt.serverEars.mockReturnValue(false)
    Object.defineProperty(window, 'SpeechRecognition', { value: Rec, configurable: true })
  })

  it('finished phrases are text at once, unfinished ones are shown as they come, nothing goes to the gateway', async () => {
    const s = sink()
    const c = await openCapture(s, events())
    const r = Rec.all[0]!
    expect(r.start).toHaveBeenCalled()
    r.say('we have no', false)
    expect(s.interim.at(-1)).toBe('we have no')
    r.say('we have no engineers')
    expect(s.heard).toEqual(['we have no engineers'])
    r.say('and no money', false)
    await c.finish() // the engine ends without finishing the phrase: it still counts
    expect(s.heard).toEqual(['we have no engineers', 'and no money'])
    expect(stt.transcribe).not.toHaveBeenCalled()
  })

  it('retarget: the engine keeps listening; an unfinished phrase stays in the old field and is not repeated in the new', async () => {
    const a = sink()
    const b = sink()
    const c = await openCapture(a, events())
    const r = Rec.all[0]!
    r.say('cut churn')
    r.say('by a third', false)
    c.retarget(b)
    expect(a.heard).toEqual(['cut churn', 'by a third'])
    expect(r.stop).not.toHaveBeenCalled()
    r.say('by a third') // the engine finishes the phrase it had begun
    r.say('churn is four percent')
    expect(a.heard).toEqual(['cut churn', 'by a third'])
    expect(b.heard).toEqual(['churn is four percent'])
    expect(Rec.all).toHaveLength(1)
    c.cancel()
  })

  it('the engine giving up in a quiet stretch is not an ending: it listens again', async () => {
    const c = await openCapture(sink(), events())
    Rec.all[0]!.onerror?.({ error: 'no-speech' })
    Rec.all[0]!.onend?.()
    expect(Rec.all).toHaveLength(2)
    expect(stopped).toBe(0)
    c.cancel()
  })

  it('the engine failing hands the words to the gateway, with what was said since its last phrase', async () => {
    stt.transcribe.mockResolvedValue('and no money')
    const s = sink()
    const ev = events()
    const c = await openCapture(s, ev)
    loud = true
    Rec.all[0]!.say('we have no engineers')
    vi.advanceTimersByTime(1000)
    Rec.all[0]!.onerror?.({ error: 'network' })
    Rec.all[0]!.onend?.()
    expect(stt.markBrowserEngineBroken).toHaveBeenCalled()
    expect(ev.onProblem).toHaveBeenCalledWith('browser', 'network', true)
    await c.finish()
    expect(s.heard).toEqual(['we have no engineers', 'and no money'])
    expect(Rec.all).toHaveLength(1)
  })

  it('sound but no words from the engine: the gateway takes over, so a lit mic with nothing happening cannot last', async () => {
    stt.transcribe.mockResolvedValue('can you hear me')
    const s = sink()
    const ev = events()
    const c = await openCapture(s, ev)
    loud = true
    vi.advanceTimersByTime(WORDLESS_MS + 200)
    expect(ev.onProblem).toHaveBeenCalledWith('browser', 'wordless', true)
    await c.finish()
    expect(s.heard).toEqual(['can you hear me'])
  })
})
