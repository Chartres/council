// One capture path for every recording surface (Pavol, 20 Nov 2026: "the microphone lit up, but
// nothing happened"). The mic opens with getUserMedia inside the tap, an AnalyserNode gives the
// real input level for the thread and the candle, and the recording ends only when he says so:
// no silence endpoint, no idle cancel. Words come from the browser's recogniser where it can
// share the mic (desktop Chrome and Edge: live, phrase by phrase) and from the gateway
// everywhere else (/v1/stt, part by part). A recorder always runs beside the recogniser, so when
// that engine fails or stays wordless the gateway writes down what it missed.
// ponytail: loudness (RMS) stands in for a voice detector; it only decides where to cut a part
// and whether a part is worth sending. The gateway's Whisper runs its own VAD.

import { recognitionCtor, type Recognition } from './speech'
import { markBrowserEngineBroken, mimeType, recordingSupported, serverEars, SttError, transcribe, unlockAudioInput } from './stt'

/** Louder than this (RMS of the waveform, 0..1) is speech; quieter is the room. */
export const SPEECH_RMS = 0.02
/** The gateway takes about a minute of audio in one clip (2 MB): a part is cut before that. */
export const MAX_PART_MS = 50_000
export const MAX_PART_BYTES = 1_500_000
/** A breath this long after speech is a good place to cut: the part is written down while he
 *  thinks, and the recording goes on. It ends nothing. */
export const PAUSE_CUT_MS = 1500
/** Sound for this long and not one word from the browser's recogniser: the gateway takes over. */
export const WORDLESS_MS = 5000
// Speech needs little: 32 kbit/s keeps 50 s near 200 kB, and the daily allowance lasts longer.
const BITS_PER_SECOND = 32_000

export interface CaptureSink {
  /** A finished piece of what he said, in the order he said it. */
  onText(piece: string): void
  /** Words the browser is still making up its mind about ('' when there are none). */
  onInterim?(words: string): void
}

export interface CaptureEvents {
  /** How many parts are being written down by the gateway right now. */
  onPending(n: number): void
  /** Something failed. `recovered`: the gateway took over and no words were lost. */
  onProblem(engine: 'browser' | 'server', reason: string, recovered: boolean): void
}

export interface Capture {
  /** The input device's name, as the browser reports it. */
  readonly label: string
  /** The input level right now (RMS, 0..1). */
  level(): number
  /** True once something louder than the room came in. */
  heard(): boolean
  /** False when the browser has suspended audio: the level cannot be read. */
  audioRunning(): boolean
  /** Ask the browser to resume audio (call inside a tap). */
  wake(): void
  /** From now on the words go to another field; what was said before still lands in the old one. */
  retarget(sink: CaptureSink): void
  /** Stop recording. Resolves when every part has landed (or failed, in words). */
  finish(): Promise<void>
  /** Stop and throw away whatever has not landed yet. */
  cancel(): void
}

const micError = (e: unknown) => {
  const name = (e as { name?: string })?.name
  return new SttError(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no_mic' : 'denied')
}
const askMic = () => {
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (typeof media?.getUserMedia !== 'function') return Promise.reject(new SttError('unavailable'))
  return media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch((e) => {
    throw micError(e)
  })
}

/** Ask for the mic inside a tap and let it go at once, so the permission prompt arrives with
 *  the tap and not later, in the middle of a conversation (Talk's Start). */
export function primeMic(): void {
  unlockAudioInput()
  askMic().then(
    (s) => s.getTracks().forEach((t) => t.stop()),
    () => {}, // the real opening says it in words
  )
}

/** One more try when the network or the gateway dropped a part; a refusal is final. */
async function writeDown(clip: Blob): Promise<string> {
  try {
    return await transcribe(clip)
  } catch (e) {
    if (!(e instanceof SttError) || (e.reason !== 'network' && e.reason !== 'unavailable')) throw e
    return transcribe(clip)
  }
}

/** Open the mic. Call inside the tap: the permission prompt and the audio unlock both need it. */
export async function openCapture(first: CaptureSink, ev: CaptureEvents): Promise<Capture> {
  const ctx = unlockAudioInput()
  const stream = await askMic()
  const release = () => stream.getTracks().forEach((t) => t.stop())

  const Ctor = recognitionCtor()
  const canRecord = recordingSupported()
  let mode: 'browser' | 'server' = Ctor && !serverEars(true) ? 'browser' : 'server'
  if (mode === 'server' && !canRecord) {
    release()
    throw new SttError('unavailable')
  }

  // --- the meter ---------------------------------------------------------------------------
  let analyser: AnalyserNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let buf = new Uint8Array(0)
  try {
    if (ctx) {
      analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      buf = new Uint8Array(analyser.fftSize)
    }
  } catch {
    analyser = null // no meter: the screen says the audio is paused, the recording still runs
  }
  const audioRunning = () => !!analyser && ctx?.state === 'running'
  const level = () => {
    if (!analyser) return 0
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += ((v - 128) / 128) ** 2
    return Math.sqrt(sum / buf.length)
  }

  // --- parts for the gateway ------------------------------------------------------------------
  let sink = first
  let open = true
  let cancelled = false
  let pending = 0
  let chain: Promise<void> = Promise.resolve()
  let everHeard = false
  let partHeard = false
  let lastLoud = 0
  let partBegan = Date.now()
  let partBytes = 0
  type Part = { rec: MediaRecorder; chunks: Blob[]; sink: CaptureSink }
  let part: Part | null = null
  const type = canRecord ? mimeType() : undefined

  const startPart = () => {
    const chunks: Blob[] = []
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: BITS_PER_SECOND })
    rec.ondataavailable = (e) => {
      if (!e.data?.size) return
      chunks.push(e.data)
      partBytes += e.data.size
    }
    partHeard = false
    partBegan = Date.now()
    partBytes = 0
    rec.start(1000)
    part = { rec, chunks, sink }
  }

  /** Close a part. Kept: it goes to the gateway and its words land in order. */
  const endPart = (p: Part | null, keep: boolean): Promise<void> => {
    if (!p) return Promise.resolve()
    const stopped = new Promise<Blob>((resolve) => {
      const done = () => resolve(new Blob(p.chunks, { type: p.rec.mimeType || type || 'audio/webm' }))
      if (p.rec.state === 'inactive') return done()
      p.rec.onstop = done
      try {
        p.rec.stop()
      } catch {
        done()
      }
    })
    if (!keep) return stopped.then(() => {})
    const words = stopped.then((clip) => (clip.size ? writeDown(clip) : ''))
    words.catch(() => {}) // reported in order, below
    pending += 1
    ev.onPending(pending)
    chain = chain
      .then(() => words)
      .then(
        (text) => {
          if (text && !cancelled) p.sink.onText(text)
        },
        (e) => {
          if (!cancelled) ev.onProblem('server', e instanceof SttError ? e.reason : 'unavailable', false)
        },
      )
      .then(() => {
        pending -= 1
        ev.onPending(pending)
      })
    return stopped.then(() => {})
  }

  /** Without a meter nobody can say a part was silent: it is kept. */
  const worthKeeping = () => partHeard || !audioRunning()
  /** A new part starts before the old one stops, so nothing falls between them. */
  let dead = false // the recorder refused to start again: said once, not retried every tick
  const cut = (keep: boolean) => {
    if (!canRecord || dead) return
    const old = part
    try {
      startPart()
    } catch {
      part = null
      dead = true
      // The recorder would not start again: from here nothing is written down, and he is told.
      if (mode === 'server' && open) ev.onProblem('server', 'recorder', false)
    }
    void endPart(old, keep)
  }

  // --- the browser's recogniser (live words) -------------------------------------------------
  let rec: Recognition | null = null
  let interim = ''
  let recSink = sink
  let loudSince: number | null = null // sound came in and the recogniser has said nothing since
  let ended: (() => void) | null = null
  let moveRec: ((next: CaptureSink) => void) | null = null

  const toServer = (reason: string) => {
    const r = rec
    rec = null
    try {
      r?.abort()
    } catch {
      // already gone
    }
    interim = ''
    recSink.onInterim?.('')
    markBrowserEngineBroken()
    if (!canRecord) return ev.onProblem('browser', reason, false)
    mode = 'server'
    ev.onProblem('browser', reason, true)
  }

  const listen = () => {
    if (!Ctor) return
    const r = new Ctor()
    let mine = sink
    recSink = mine
    r.continuous = true
    r.interimResults = true
    let done = 0 // results before this index are already text
    let moved = -1 // a phrase that was unfinished when the field changed: already text, in the old field
    let error: string | null = null
    r.onresult = (e) => {
      if (rec !== r) return
      loudSince = null
      let i = done
      for (; i < e.results.length && e.results[i].isFinal; i++) {
        const t = (e.results[i][0]?.transcript ?? '').trim()
        if (t && i !== moved) mine.onText(t)
      }
      // Those words are text now: the safety recording starts over from here.
      if (i > done) cut(false)
      done = i
      let rest = ''
      for (; i < e.results.length; i++) if (i !== moved) rest += e.results[i][0]?.transcript ?? ''
      interim = rest.trim()
      mine.onInterim?.(interim)
    }
    // The engine keeps listening across the change of field, so no word falls into a gap.
    // ponytail: words added to the unfinished phrase after the tap are dropped with it.
    moveRec = (next) => {
      if (interim) {
        mine.onText(interim)
        moved = done
        interim = ''
        mine.onInterim?.('')
      }
      mine = recSink = next
      cut(false)
    }
    r.onerror = (e) => {
      error = e?.error ?? 'unknown'
    }
    r.onend = () => {
      if (rec !== r) return
      rec = null
      const failed = error && error !== 'no-speech' && error !== 'aborted'
      // A phrase the engine never finished still counts, unless the gateway is about to write
      // the same sound down.
      if (interim && !failed) {
        mine.onText(interim)
        cut(false)
      }
      interim = ''
      mine.onInterim?.('')
      if (!open) return ended?.()
      if (failed) return toServer(error!)
      // ponytail: engines end on their own in a quiet stretch (Chrome, about 8 s): listen again.
      listen()
    }
    rec = r
    try {
      r.start()
    } catch {
      toServer('unavailable')
    }
  }

  // --- the watch ---------------------------------------------------------------------------
  const tick = setInterval(() => {
    const now = Date.now()
    if (level() > SPEECH_RMS) {
      everHeard = partHeard = true
      lastLoud = now
      loudSince ??= now
    }
    if (mode === 'browser') {
      if (loudSince !== null && now - loudSince >= WORDLESS_MS) toServer('wordless')
      // ponytail: a minute with no finished phrase is quiet; the safety recording starts over.
      else if (now - partBegan >= MAX_PART_MS) cut(false)
      return
    }
    if (partHeard && now - lastLoud >= PAUSE_CUT_MS) cut(true)
    else if (now - partBegan >= MAX_PART_MS || partBytes >= MAX_PART_BYTES) cut(worthKeeping())
  }, 100)

  const close = () => {
    open = false
    clearInterval(tick)
    source?.disconnect()
  }

  try {
    if (canRecord) startPart()
  } catch {
    close()
    release()
    throw new SttError('unavailable')
  }
  if (mode === 'browser') listen()
  const track = stream.getAudioTracks?.()[0]
  // Unplugged, or taken by another app.
  if (track) track.onended = () => open && ev.onProblem('server', 'mic_ended', false)

  return {
    label: track?.label || 'this microphone',
    level,
    heard: () => everHeard,
    audioRunning,
    wake: () => void ctx?.resume?.(),
    retarget(next) {
      if (!open) return
      sink = next
      if (mode === 'server') return cut(worthKeeping())
      if (rec) moveRec?.(next)
    },
    async finish() {
      if (!open) return chain
      close()
      if (rec) {
        const r = rec
        await new Promise<void>((resolve) => {
          ended = resolve
          // ponytail: an engine that never fires onend must not hold the Finish tap hostage.
          setTimeout(resolve, 1500)
          try {
            r.stop()
          } catch {
            resolve()
          }
        })
        if (rec === r) {
          rec = null
          if (interim) recSink.onText(interim)
          recSink.onInterim?.('')
        }
      }
      const last = part
      part = null
      await endPart(last, mode === 'server' && worthKeeping())
      release()
      await chain
    },
    cancel() {
      if (cancelled) return
      cancelled = true
      close()
      const r = rec
      rec = null
      try {
        r?.abort()
      } catch {
        // already gone
      }
      const last = part
      part = null
      void endPart(last, false)
      release()
    },
  }
}
