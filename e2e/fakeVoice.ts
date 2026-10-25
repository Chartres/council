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
        this.timer = u ? setTimeout(() => { this.timer = null; u.onend?.(); this.next() }, 2000) : null
      },
      cancel() { this.cancels++; clearTimeout(this.timer); this.timer = null; this.queue = [] },
      getVoices() { return [{ lang: 'en-GB' }] },
    },
  })
`
