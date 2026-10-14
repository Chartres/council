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
  importNote,
  mergeIntake,
} from '@/domain/intakeImport'
import { VOICE_IDLE, currentField, voiceReducer } from '@/domain/intakeVoice'
import { INTAKE_QUESTIONS, MAX_MATERIALS, intakePayload, stableIntake, type Intake } from '@/domain/mastermind'
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
    <section aria-label="Before you start" data-testid="trust-note" className="t-body mt-2">
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

const SHORTCUT = 'text-btn text-[17px]'

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
  const latest = useRef(answers)
  latest.current = answers
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

  const failed = (e: unknown) => {
    const code = e instanceof ExtractError ? e.code : 'gateway'
    if (code === 'password') lockDoor()
    setNote(EXTRACT_COPY[code])
  }

  const read = async (input: string) => {
    setBusy(true)
    setNote('Reading…')
    try {
      fill(await extractIntake(input, { gatewayUrl: GATEWAY_URL, token, councilKey }))
    } catch (e) {
      failed(e)
    } finally {
      setBusy(false)
    }
  }

  // Files are read one after another and merged into what is there; a bad file is skipped, not fatal.
  const readFiles = async (list: FileList | null | undefined) => {
    const files = Array.from(list ?? [])
    if (busy || !files.length) return
    const skipped: { name: string; size: number; reason?: string }[] = files.filter((f) => fileProblem(f))
    const ok = files.filter((f) => !fileProblem(f))
    if (!ok.length) return setNote(importNote({ read: 0, filled: 0, overflow: false, skipped }))
    setBusy(true)
    setOpen(true)
    let overflow = false
    let cut = false
    const touched = new Set<string>()
    try {
      for (const [i, f] of ok.entries()) {
        setNote(ok.length > 1 ? `Reading ${i + 1} of ${ok.length}…` : 'Reading…')
        let got: Intake
        try {
          got = await extractIntake(f, { gatewayUrl: GATEWAY_URL, token, councilKey })
        } catch (e) {
          const code = e instanceof ExtractError ? e.code : 'gateway'
          if (code === 'password' || code === 'quota') return failed(e)
          skipped.push({ name: f.name, size: f.size, reason: 'could not be read' })
          continue
        }
        Object.keys(got).forEach((k) => k !== 'materials' && touched.add(k))
        // Merge into the latest answers (not the ones at drop time) so what she typed during the read survives.
        const m = mergeIntake(latest.current, got)
        latest.current = m.merged
        overflow ||= m.overflow
        cut ||= m.cut
        setAnswers(m.merged)
      }
      const read = ok.length - skipped.filter((f) => f.reason).length
      setNote(importNote({ read, filled: touched.size, overflow, cut, skipped }))
    } finally {
      setBusy(false)
    }
  }

  const dropFiles = {
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return
      e.preventDefault()
      void readFiles(e.dataTransfer.files)
    },
  }

  const readText = () => {
    const c = classifyInput(text)
    if (c.kind === 'hint') setNote(c.message)
    else if (c.kind === 'parsed') fill(c.intake)
    else if (c.kind === 'extract') void read(c.text)
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
        {...dropFiles}
        placeholder={goal.hint}
        className="t-display mt-2 block w-full resize-none border-b-2 border-marble-500 bg-transparent pb-3 [field-sizing:content] placeholder:text-marble-400 focus:border-candle-400 focus-visible:shadow-none"
      />

      {/* Three ways to skip the form; what they fill is reviewed under About you. */}
      <div className="mt-2 flex flex-wrap gap-x-4" role="group" aria-label="Shortcuts">
        <button
          type="button"
          onClick={() => {
            setShowPrompt((s) => !s)
            setOpen(true)
          }}
          aria-expanded={showPrompt}
          className={SHORTCUT}
        >
          Let your AI fill this in
        </button>
        <button type="button" onClick={voice.phase === 'idle' ? startVoice : stopVoice} className={SHORTCUT}>
          {voice.phase === 'idle' ? 'Talk it through' : 'Stop talking'}
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className={SHORTCUT}>
          Drop files
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.docx,.txt"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          void readFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {note && (
        <p role="status" className="t-body mt-2 text-marble-100" data-testid="intake-note">
          {note}
        </p>
      )}
      {showPrompt && (
        <div className="mt-2 border-l-2 border-marble-500 pl-4" data-testid="ai-prompt">
          <p className="t-body">Run this in ChatGPT, Claude or Gemini, then paste the reply under About you.</p>
          <pre className="t-body mt-2 whitespace-pre-wrap font-sans">{AI_PROMPT}</pre>
          <button type="button" onClick={copyPrompt} className="text-btn -ml-3 px-3">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

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
      <p className="mt-2 text-[13px] leading-[18px] text-marble-400">
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
          {...dropFiles}
          placeholder="Paste a bio, notes or your AI’s answer, or drop PDF, DOCX or TXT files."
          className="field mt-2 resize-y"
        />
        <button type="button" onClick={readText} disabled={busy || !text.trim()} className="text-btn">
          Read it
        </button>

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
          <li>
            <label htmlFor="f-materials" className="t-label block">
              Materials
            </label>
            <textarea
              id="f-materials"
              rows={3}
              maxLength={MAX_MATERIALS}
              value={answers.materials ?? ''}
              onChange={(e) => set('materials', e.target.value)}
              placeholder="Anything else the group should read: notes, a plan, numbers."
              className="field mt-2 resize-y"
            />
          </li>
        </ul>
      </details>

      <p className="mt-12 text-[13px] leading-[18px] text-marble-400">
        The advisers are AI. <PrivacyLink />
      </p>
    </div>
  )
}
