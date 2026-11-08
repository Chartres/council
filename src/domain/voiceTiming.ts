// How long a Talk turn takes to answer, measured where it is felt: from her last word to the
// first adviser audio. Split into the parts that can each be made shorter: waiting for quiet,
// writing it down (server ears only), the group thinking up its first sentence, and the voice
// for that sentence arriving and starting. One report per turn (key_action `voice_turn`).
// Times only: no words, no audio.
//
// The turn starts when her words are sent, carrying when she stopped speaking. Words heard in
// between (a cough, a cut-in) never move the clock; a turn that was held while the group still
// answered is not timed at all (Talk resets instead of sending).

export type VoiceTurn = {
  ears: 'browser' | 'server'
  /** Whose voice spoke the first line: the gateway's adviser voice, or the browser's own. */
  out: 'gateway' | 'browser'
  silence_ms: number
  stt_ms: number
  think_ms: number
  voice_ms: number
  total_ms: number
}

export function turnClock(now: () => number = () => Date.now()) {
  let last: number | null = null
  let stop: number | null = null
  let sent: number | null = null
  let first: number | null = null
  const reset = () => {
    last = stop = sent = first = null
  }
  return {
    /** Her words went to the group. `lastWordAt`: when she stopped speaking; `stoppedAt`
     *  (server ears): when the recording went to be transcribed. */
    sent(lastWordAt: number, stoppedAt: number | null = null) {
      last = lastWordAt
      stop = stoppedAt
      sent = now()
      first = null
    },
    /** A line of the answer was handed to the speaker; only the first one counts. */
    firstLine() {
      if (sent !== null && first === null) first = now()
    },
    /** A line started playing: the turn's report the first time, null after that. */
    audioStarted(out: VoiceTurn['out'], ears: VoiceTurn['ears']): VoiceTurn | null {
      if (last === null || sent === null || first === null) return null
      const t = now()
      const report: VoiceTurn = {
        ears,
        out,
        silence_ms: (stop ?? sent) - last,
        stt_ms: stop === null ? 0 : sent - stop,
        think_ms: first - sent,
        voice_ms: t - first,
        total_ms: t - last,
      }
      reset()
      return report
    },
    /** The answer ended without a spoken line (an error, a refusal): drop the turn, so the next
     *  answer, perhaps to a typed message, is not timed against it. */
    unanswered() {
      if (sent !== null && first === null) reset()
    },
    reset,
  }
}

/** "3.9 s to first word (quiet 0.9 · writing 0.7 · thinking 1.5 · voice 0.8)" */
export function describeTurn(t: VoiceTurn): string {
  const s = (ms: number) => (ms / 1000).toFixed(1)
  const parts = [`quiet ${s(t.silence_ms)}`, ...(t.ears === 'server' ? [`writing ${s(t.stt_ms)}`] : []), `thinking ${s(t.think_ms)}`, `voice ${s(t.voice_ms)}`]
  return `${s(t.total_ms)} s to first word (${parts.join(' · ')})${t.out === 'browser' ? ', browser voice' : ''}`
}
