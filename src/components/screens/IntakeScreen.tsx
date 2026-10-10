import { useEffect, useReducer, useRef, useState } from 'react'
import { GATEWAY_URL, useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { cancel, FACILITATOR_VOICE, speak } from '@/components/Listen'
import { MicButton } from '@/components/MicButton'
import { PrivacyLink } from '@/components/screens/PrivacyScreen'
import {
  AI_PROMPT,
  EXTRACT_COPY,
  ExtractError,
  classifyInput,
  extractIntake,
  fileProblem,
} from '@/domain/intakeImport'
import { VOICE_IDLE, currentField, voiceReducer } from '@/domain/intakeVoice'
import { INTAKE_QUESTIONS, intakePayload, stableIntake, type Intake } from '@/domain/mastermind'
import { recognitionCtor, synthesisAvailable } from '@/domain/speech'

const TRUST_KEY = 'council:trust-seen'

function TrustNote() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(TRUST_KEY) === '1'
    } catch {
      return false
    }
  })
  if (seen) return null
  const dismiss = () => {
    setSeen(true)
    try {
      localStorage.setItem(TRUST_KEY, '1')
    } catch {
      // Private mode: the note comes back next visit, which is fine.
    }
  }
  return (
    <section aria-label="Before you start" data-testid="trust-note" className="mt-1 text-sm leading-relaxed text-marble-300">
      <p>
        <span className="text-marble-100">Before you start.</span> Your answers go to Anthropic’s Claude to write the
        advisers’ replies. Anthropic doesn’t train on them and deletes them within 30 days. Without an account, we keep
        nothing after 24 hours. Signed in, your sessions and journal are saved so the council remembers; you can export
        or delete them any time. Names are optional: describe people and companies in general terms if you prefer. The
        advisers are AI. <PrivacyLink />
      </p>
      <button type="button" onClick={dismiss} className="min-h-11 text-sm text-candle-300 hover:text-candle-200">
        Got it
      </button>
    </section>
  )
}

const filled = (a: Intake) => Object.fromEntries(Object.entries(a).filter(([, v]) => v?.trim())) as Intake
const ask = (id: string) => INTAKE_QUESTIONS.find((q) => q.id === id)!.q

/** One screen: bring what you have, ask your AI, or talk it through; then review and go. */
export function IntakeScreen() {
  const { go, councilKey, lockDoor } = useCouncil()
  const { token } = useAuth()
  const { begin, lastIntake } = useMastermind()
  const [answers, setAnswers] = useState<Intake>(() => stableIntake(lastIntake))
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [copied, setCopied] = useState(false)
  const [voice, dispatch] = useReducer(voiceReducer, VOICE_IDLE)
  const fileInput = useRef<HTMLInputElement>(null)
  const field = currentField(voice)

  // Signed in, the last intake arrives from Supabase after mount: fill the stable fields still empty.
  useEffect(() => {
    if (lastIntake) setAnswers((a) => ({ ...stableIntake(lastIntake), ...filled(a) }))
  }, [lastIntake])

  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }))

  const fill = (intake: Intake) => {
    const n = Object.keys(intake).length
    setAnswers((a) => ({ ...a, ...intake }))
    setText('')
    setNote(n ? `Filled ${n} of ${INTAKE_QUESTIONS.length}. Check them below.` : 'Nothing to fill from that. Answer below instead.')
  }

  const read = async (input: string | File) => {
    setBusy(true)
    setNote('Reading…')
    try {
      fill(await extractIntake(input, { gatewayUrl: GATEWAY_URL, token, councilKey }))
    } catch (e) {
      const code = e instanceof ExtractError ? e.code : 'gateway'
      if (code === 'password') lockDoor()
      setNote(EXTRACT_COPY[code])
    } finally {
      setBusy(false)
    }
  }

  const readText = () => {
    const c = classifyInput(text)
    if (c.kind === 'hint') setNote(c.message)
    else if (c.kind === 'parsed') fill(c.intake)
    else if (c.kind === 'extract') void read(c.text)
  }

  const takeFile = (file: File | undefined) => {
    if (!file) return
    const problem = fileProblem(file)
    if (problem) setNote(problem)
    else void read(file)
  }

  const copyPrompt = () =>
    navigator.clipboard?.writeText(AI_PROMPT).then(
      () => setCopied(true),
      () => setCopied(false),
    )

  // Talk it through: speak the question, then listen. Without synthesis it goes straight
  // to listening; without recognition the field gets focus so typing takes over.
  useEffect(() => {
    if (voice.phase !== 'ask' || !field) return
    if (!recognitionCtor()) document.getElementById(`f-${field}`)?.focus()
    if (!synthesisAvailable()) {
      dispatch({ type: 'asked' })
      return
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      dispatch({ type: 'asked' })
    }
    speak(ask(field), FACILITATOR_VOICE, finish)
    // ponytail: some engines never fire onend; a length-based timer is the backstop.
    const t = setTimeout(finish, 1200 + ask(field).length * 60)
    return () => {
      done = true
      clearTimeout(t)
    }
  }, [voice.phase, voice.at, field])

  const startVoice = () =>
    dispatch({ type: 'start', empty: INTAKE_QUESTIONS.map((q) => q.id).filter((id) => !answers[id]?.trim()) })
  const stopVoice = () => {
    cancel()
    dispatch({ type: 'stop' })
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-6">
      <button type="button" onClick={() => go('start')} className="mt-1 min-h-11 text-sm text-marble-400 hover:text-candle-300">
        ← Back
      </button>

      <TrustNote />

      <label htmlFor="bring" className="mt-2 block font-display text-xl text-marble-100">
        Bring what you have
      </label>
      <textarea
        id="bring"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          takeFile(e.dataTransfer.files[0])
        }}
        placeholder="Paste a bio, notes or your AI’s answer. Or drop a PDF, DOCX or TXT."
        className="mt-2 w-full resize-y rounded-card border border-ink-700 bg-ink-900 px-3 py-3 text-base leading-relaxed text-marble-100 placeholder:text-marble-500 focus:border-candle-500"
      />
      <div className="flex flex-wrap items-center gap-x-5">
        <button
          type="button"
          onClick={readText}
          disabled={busy || !text.trim()}
          className="min-h-11 text-sm text-candle-300 hover:text-candle-200 disabled:text-marble-500"
        >
          Read it
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="min-h-11 text-sm text-marble-300 hover:text-candle-300"
        >
          Pick a file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.txt"
          hidden
          data-testid="file-input"
          onChange={(e) => {
            takeFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => setShowPrompt((s) => !s)}
          aria-expanded={showPrompt}
          className="min-h-11 text-sm text-marble-300 hover:text-candle-300"
        >
          Ask your AI
        </button>
        <button
          type="button"
          onClick={voice.phase === 'idle' ? startVoice : stopVoice}
          className="min-h-11 text-sm text-marble-300 hover:text-candle-300"
        >
          {voice.phase === 'idle' ? 'Talk it through' : 'Stop talking'}
        </button>
      </div>
      {note && (
        <p role="status" className="text-sm text-marble-300" data-testid="intake-note">
          {note}
        </p>
      )}

      {showPrompt && (
        <div className="mt-2 border-l border-ink-700 pl-3" data-testid="ai-prompt">
          <p className="text-sm text-marble-400">Run this in ChatGPT, Claude or Gemini, then paste the reply above.</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-marble-200">{AI_PROMPT}</pre>
          <button type="button" onClick={copyPrompt} className="min-h-11 text-sm text-candle-300 hover:text-candle-200">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {field && (
        <div className="mt-3 flex items-center gap-3" data-testid="voice-bar">
          <p className="flex-1 font-display text-lg text-candle-200">{ask(field)}</p>
          <button
            type="button"
            onClick={() => dispatch({ type: 'advance' })}
            className="min-h-11 text-sm text-marble-300 hover:text-candle-300"
          >
            {answers[field]?.trim() ? 'Next' : 'Skip'}
          </button>
        </div>
      )}

      <ul className="mt-4" aria-label="Your context">
        {INTAKE_QUESTIONS.map((q) => {
          const v = answers[q.id] ?? ''
          const active = field === q.id
          return (
            <li key={q.id} className="border-t border-ink-800 py-1">
              <label htmlFor={`f-${q.id}`} className={`block pt-1 text-xs ${active ? 'text-candle-300' : 'text-marble-500'}`}>
                {v.trim() ? q.label : `Add · ${q.q}`}
              </label>
              <div className="flex items-start gap-2">
                <textarea
                  id={`f-${q.id}`}
                  rows={1}
                  aria-label={q.q}
                  value={v}
                  onChange={(e) => set(q.id, e.target.value)}
                  placeholder={q.hint}
                  className="min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-snug text-marble-100 [field-sizing:content] placeholder:text-marble-500 focus:outline-none"
                />
                {active && voice.phase === 'listen' && (
                  <MicButton
                    key={q.id}
                    autoStart
                    value={v}
                    onChange={(t) => set(q.id, t)}
                    label={q.label}
                    onDone={(heard) => heard && dispatch({ type: 'advance' })}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => {
          stopVoice()
          begin(intakePayload(answers))
        }}
        className="mt-4 min-h-12 w-full rounded-card bg-candle-400 px-4 py-3 font-display text-lg font-semibold text-ink-950 hover:bg-candle-300"
      >
        Bring it to the group
      </button>
      <p className="mt-3 text-xs text-marble-500">
        Everything is optional. <PrivacyLink />
      </p>
    </div>
  )
}
