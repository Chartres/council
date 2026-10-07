// Voice in and voice out, entirely in the browser: Web Speech API for dictation,
// speechSynthesis for reading the debate aloud. No server, no key, no cost — which is
// also why both are feature-detected and simply absent where they do not exist.
// ponytail: local minimal types instead of a @types package; we use four fields.

export interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechResultEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

type RecognitionCtor = new () => Recognition

/** `webkitSpeechRecognition` on Safari and Chrome, `SpeechRecognition` where standardised. */
export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function synthesisAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

/** Everything a result event has said so far, final parts and interim alike. */
export function transcriptOf(event: SpeechResultEvent): string {
  let text = ''
  for (let i = 0; i < event.results.length; i++) text += event.results[i][0]?.transcript ?? ''
  return text.trim()
}

/**
 * A distinct but still human voice per persona, derived from the id so the same
 * thinker always sounds the same across sessions and devices.
 */
export function personaVoice(id: string): { pitch: number; rate: number } {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return {
    pitch: Number((0.8 + (hash % 9) / 20).toFixed(2)), // 0.80 … 1.20
    rate: Number((0.9 + ((hash >>> 4) % 5) / 25).toFixed(2)), // 0.90 … 1.06
  }
}

/** An English voice if the device has one; otherwise let the browser decide. */
export function pickVoice(voices: { lang: string }[]): { lang: string } | undefined {
  return voices.find((v) => v.lang?.toLowerCase().startsWith('en'))
}
