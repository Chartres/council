import type { Page } from '@playwright/test'

// Fakes the voice journeys drive, injected with page.addInitScript.
//
// The mic (FAKE_MIC): real getUserMedia hangs in Playwright's Chromium, so it is replaced by
// a real audio stream from an oscillator. The app's own AudioContext and AnalyserNode read it,
// so the thread on screen moves with a real level. The tone is off until the test turns it on
// (window.__tone(true)): a silent stream is how a dead input looks. The recorder is a fake
// that "records" the text in window.__say; the stub gateway reads it back as the transcript.
//
// FAKE_VOICE: a desktop Chrome. The recogniser gives live words: window.__hear(text) is one
// finished phrase, window.__forming(text) one still being worked out. The speech engine is a queue where each line "plays" for 2 s, recording
// what it was asked to say in speechSynthesis.spoken and its cancels.
//
// FAKE_EARS: an iPhone for voice in. No recogniser; the words come from the gateway.
// window.__speak(text, ms) makes sound for that long, then quiet: the part is written down.

export const FAKE_MIC = `
  let wantTone = false
  window.__say = ''
  window.__mics = 0
  window.__clips = 0
  window.__tone = (on) => { wantTone = on } // before the mic opens: it opens with the tone as asked
  window.__speak = (text, ms = 800) => { window.__say = text; window.__tone(true); setTimeout(() => window.__tone(false), ms) }
  // Every AudioContext made on the page, the app's included: __ctxs[0] is the app's (made in the tap).
  window.__ctxs = []
  const RealContext = window.AudioContext
  window.AudioContext = class extends RealContext { constructor(...a) { super(...a); window.__ctxs.push(this) } }
  // window.__denyMic = 'NotAllowedError' refuses the mic; window.__holdMic = true keeps the
  // permission prompt "up" until window.__grantMic().
  window.__grantMic = () => {}
  const getUserMedia = async () => {
    window.__mics++
    if (window.__denyMic) throw Object.assign(new Error('refused'), { name: window.__denyMic })
    if (window.__holdMic) await new Promise((resolve) => (window.__grantMic = resolve))
    const ctx = new RealContext()
    await ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const out = ctx.createMediaStreamDestination()
    gain.gain.value = wantTone ? 0.5 : 0
    osc.frequency.value = 220
    osc.connect(gain).connect(out)
    osc.start()
    window.__tone = (on) => { wantTone = on; gain.gain.value = on ? 0.5 : 0 }
    const track = out.stream.getAudioTracks()[0]
    Object.defineProperty(track, 'label', { value: 'Test microphone' })
    // What a phone does when the page goes to the background: the page is hidden, the track
    // ends, the page comes back. window.__leaveAndReturn() plays that.
    window.__leaveAndReturn = () => {
      const see = (hidden) => {
        Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
        Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      }
      see(true)
      track.stop()
      track.dispatchEvent(new Event('ended'))
      for (const c of window.__ctxs) c.suspend()
      see(false)
    }
    return out.stream
  }
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  class FakeRecorder {
    static isTypeSupported(t) { return t === 'audio/mp4' }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/mp4' }
    start() { this.state = 'recording'; window.__clips++ }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob([window.__say], { type: 'audio/mp4' }) })
      setTimeout(() => this.onstop?.(), 0)
    }
  }
  Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder, configurable: true })
`

const FAKE_RECOGNISER = `
  class FakeRecognition {
    constructor() { window.__rec = this; this.results = [] }
    start() { window.__started = (window.__started ?? 0) + 1 }
    stop() { setTimeout(() => this.onend?.(), 0) }
    abort() {}
  }
  window.__hear = (text) => {
    const r = window.__rec
    r.results.push(Object.assign([{ transcript: text }], { isFinal: true }))
    r.onresult?.({ results: r.results })
  }
  // Words the engine has not settled on yet.
  window.__forming = (text) => {
    const r = window.__rec
    r.onresult?.({ results: [...r.results, Object.assign([{ transcript: text }], { isFinal: false })] })
  }
  // Chromium ships the standard global too, and the app prefers it: stub both.
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true })
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognition, configurable: true })
`

const NO_RECOGNISER = `
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    Object.defineProperty(window, name, { value: undefined, configurable: true })
  }
`

/** The browser speech engine; \`ms\` is how long a line "plays". */
export const fakeSynth = (ms: number) => `
  // The fake engine owns its utterance type too: a real one rejects a fake voice object.
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: class { constructor(text) { this.text = text } },
    configurable: true,
  })
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      spoken: [],
      cancels: 0,
      queue: [],
      timer: null,
      speak(u) { this.spoken.push(u.text); this.queue.push(u); if (!this.timer) this.next() },
      next() {
        const u = this.queue.shift()
        // The tap's silent primer (one space) ends at once; real lines take a while.
        const ms = u && u.text.trim() ? ${ms} : 0
        this.timer = u ? setTimeout(() => { this.timer = null; u.onend?.(); this.next() }, ms) : null
      },
      cancel() { this.cancels++; clearTimeout(this.timer); this.timer = null; this.queue = [] },
      getVoices() { return [{ lang: 'en-GB' }] },
    },
    configurable: true,
  })
`

export const FAKE_VOICE = FAKE_RECOGNISER + FAKE_MIC + fakeSynth(2000)
export const FAKE_EARS = NO_RECOGNISER + FAKE_MIC

type W = { __hear: (t: string) => void; __speak: (t: string, ms?: number) => void; __tone: (on: boolean) => void }
/** Desktop: one finished phrase from the browser's recogniser. */
export const hear = (page: Page, text: string) => page.evaluate((t) => (window as unknown as W).__hear(t), text)
/** Phone: sound for a moment, then quiet; the gateway writes the part down as `text`. */
export const speakInto = (page: Page, text: string, ms = 800) =>
  page.evaluate(([t, d]) => (window as unknown as W).__speak(t as string, d as number), [text, ms] as const)
export const tone = (page: Page, on: boolean) => page.evaluate((v) => (window as unknown as W).__tone(v), on)
