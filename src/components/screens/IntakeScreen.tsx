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
    <section aria-label="Before you start" data-testid="trust-note" className="mt-2 text-[15px] leading-[22px] text-marble-300">
      <p>
        Your answers go to Anthropic’s Claude, which deletes them within 30 days and does not train on them; without an
        account we keep nothing after 24 hours. The advisers are AI. <PrivacyLink />
      </p>
      <button type="button" onClick={dismiss} className="text-btn -ml-3 px-3">
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
  const [open, setOpen] = useState(false)
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
    setOpen(true)
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

  const startVoice = () => {
    setOpen(true)
    dispatch({ type: 'start', empty: INTAKE_QUESTIONS.map((q) => q.id).filter((id) => !answers[id]?.trim()) })
  }
  const stopVoice = () => {
    cancel()
    dispatch({ type: 'stop' })
  }

  const about = INTAKE_QUESTIONS.filter((q) => q.id !== 'goal')
  const goal = INTAKE_QUESTIONS.find((q) => q.id === 'goal')!

  // The facilitator's question lives in the row it fills, so question, mic and Skip share a viewport.
  const voiceBar = (id: string, label: string) =>
    field === id && (
      <div className="mt-2 flex items-center gap-3" data-testid="voice-bar">
        {voice.phase === 'listen' && (
          <MicButton
            key={id}
            autoStart
            value={answers[id as keyof Intake] ?? ''}
            onChange={(t) => set(id, t)}
            label={label}
            onDone={(heard) => heard && dispatch({ type: 'advance' })}
          />
        )}
        <p className="t-title flex-1 italic">{ask(id)}</p>
        <button type="button" onClick={() => dispatch({ type: 'advance' })} className="text-btn px-3">
          {answers[id as keyof Intake]?.trim() ? 'Next' : 'Skip'}
        </button>
      </div>
    )

  return (
    <div className="mx-auto max-w-xl px-4 pb-12">
      <button type="button" onClick={() => go('start')} className="text-btn -ml-3 px-3 text-marble-400">
        ← Back
      </button>

      <TrustNote />

      <label htmlFor="f-goal" className={`t-label mt-2 block ${field === 'goal' ? 'text-candle-300' : ''}`}>
        {goal.q}
      </label>
      {voiceBar('goal', goal.label)}
      <textarea
        id="f-goal"
        rows={2}
        aria-label={goal.q}
        value={answers.goal ?? ''}
        onChange={(e) => set('goal', e.target.value)}
        placeholder={goal.hint}
        className="t-display mt-2 block w-full resize-none border-b-2 border-marble-500 bg-transparent pb-3 [field-sizing:content] placeholder:text-marble-400 focus:border-candle-400 focus-visible:shadow-none"
      />

      <button
        type="button"
        onClick={() => {
          stopVoice()
          begin(intakePayload(answers))
        }}
        className="slab mt-6"
      >
        Bring it to the group
      </button>
      <p className="mt-2 text-[15px] leading-[22px] text-marble-400">
        Everything below is optional. The group works with what you give it.
      </p>

      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="mt-12">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span className="t-label">
            About you · {about.filter((q) => answers[q.id]?.trim()).length} of {about.length}
          </span>
          <span className="text-btn flex items-center">{open ? 'Hide' : 'Show'}</span>
        </summary>

        <label htmlFor="bring" className="sr-only">
          Bring what you have
        </label>
        <textarea
          id="bring"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            takeFile(e.dataTransfer.files[0])
          }}
          placeholder="Paste a bio, notes or your AI’s answer, or drop a PDF, DOCX or TXT."
          className="field mt-2 resize-y"
        />
        <div className="flex flex-wrap items-center gap-x-4">
          <button type="button" onClick={readText} disabled={busy || !text.trim()} className="text-btn">
            Read it
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="text-btn">
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
          <button type="button" onClick={() => setShowPrompt((s) => !s)} aria-expanded={showPrompt} className="text-btn">
            Ask your AI
          </button>
          <button
            type="button"
            onClick={voice.phase === 'idle' ? startVoice : stopVoice}
            className={`text-btn ${voice.phase === 'idle' ? '' : 'text-candle-300'}`}
          >
            {voice.phase === 'idle' ? 'Talk it through' : 'Stop talking'}
          </button>
        </div>
        {note && (
          <p role="status" className="mt-2 text-[15px] leading-[22px] text-marble-100" data-testid="intake-note">
            {note}
          </p>
        )}

        {showPrompt && (
          <div className="mt-2 border-l-2 border-marble-500 pl-4" data-testid="ai-prompt">
            <p className="text-[15px] text-marble-300">Run this in ChatGPT, Claude or Gemini, then paste the reply above.</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-[15px] text-marble-200">{AI_PROMPT}</pre>
            <button type="button" onClick={copyPrompt} className="text-btn -ml-3 px-3">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        <ul className="mt-6 space-y-6" aria-label="Your context">
          {about.map((q) => (
            <li key={q.id}>
              <label htmlFor={`f-${q.id}`} className={`t-label block ${field === q.id ? 'text-candle-300' : ''}`}>
                {q.label}
              </label>
              {voiceBar(q.id, q.label)}
              <textarea
                id={`f-${q.id}`}
                rows={1}
                aria-label={q.q}
                value={answers[q.id] ?? ''}
                onChange={(e) => set(q.id, e.target.value)}
                placeholder={field === q.id ? q.hint : q.q}
                className="field mt-2 resize-none [field-sizing:content]"
              />
            </li>
          ))}
        </ul>
      </details>

      <p className="mt-12 text-[13px] leading-[18px] text-marble-400">
        The advisers are AI. <PrivacyLink />
      </p>
    </div>
  )
}
