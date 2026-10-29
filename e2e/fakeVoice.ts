// Fakes the Talk journeys drive (e2e/talk.spec.ts, e2e/talk-voice.spec.ts), injected with
// page.addInitScript. The recogniser: `window.__hear(text)` delivers one final result. The
// browser speech engine: a queue like a real one where each line "plays" for 2 s, recording
// what it was asked to say in `speechSynthesis.spoken` and its cancels.

export const FAKE_VOICE = `
  class FakeRecognition {
    constructor() { window.__rec = this; this.results = [] }
    start() { window.__started = (window.__started ?? 0) + 1 }
    stop() { this.onend?.() }
    abort() {}
  }
  window.__hear = (text) => {
    const r = window.__rec
    r.results.push(Object.assign([{ transcript: text }], { isFinal: true }))
    r.onresult?.({ results: r.results })
  }
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition })
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognition })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: class { constructor(text) { this.text = text } },
  })
  // A queue like a real engine; each line "plays" for 2 s, so the room is still talking when she cuts in.
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      spoken: [],
      cancels: 0,
      queue: [],
      timer: null,
      speak(u) { this.spoken.push(u.text); this.queue.push(u); if (!this.timer) this.next() },
      next() {
        const u = this.queue.shift()
        // The tap's silent primer (one space) ends at once; real lines take 2 s.
        const ms = u && u.text.trim() ? 2000 : 0
        this.timer = u ? setTimeout(() => { this.timer = null; u.onend?.(); this.next() }, ms) : null
      },
      cancel() { this.cancels++; clearTimeout(this.timer); this.timer = null; this.queue = [] },
      getVoices() { return [{ lang: 'en-GB' }] },
    },
  })
`

// An iPhone for voice in: no recogniser, a recorder that "records" whatever is in
// window.__say (the stub gateway reads it back as the transcript), and a loudness meter the
// test drives: window.__speak(ms) makes the room loud for that long, then quiet again.
export const FAKE_EARS = `
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    Object.defineProperty(window, name, { value: undefined, configurable: true })
  }
  window.__say = ''
  window.__clips = 0
  window.__loudUntil = 0
  window.__speak = (text, ms = 800) => { window.__say = text; window.__loudUntil = Date.now() + ms }
  const stream = { getTracks: () => [{ stop() {} }] }
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => stream }, configurable: true })
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
  class FakeAudioContext {
    constructor() { this.state = 'running' }
    resume() { return Promise.resolve() }
    close() { return Promise.resolve() }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createAnalyser() {
      return {
        fftSize: 1024,
        getByteTimeDomainData(buf) {
          const loud = Date.now() < window.__loudUntil
          for (let i = 0; i < buf.length; i++) buf[i] = loud ? (i % 2 ? 200 : 56) : 128
        },
      }
    }
  }
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true })
`
