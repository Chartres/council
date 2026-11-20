import { useEffect, useReducer, useRef, useState } from 'react'
import { GATEWAY_URL, useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { addWords, CapturePanel, micAvailable, MicIcon, useCapture } from '@/components/Capture'
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
import { VOICE_IDLE, currentField, nextField, voiceReducer, walkQueue } from '@/domain/intakeVoice'
import { INTAKE_QUESTIONS, MAX_MATERIALS, intakePayload, stableIntake, voiceOrder, type Intake, type IntakeId } from '@/domain/mastermind'

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

const SHORTCUT = 'text-btn text-[19px]'

const filled = (a: Intake) => Object.fromEntries(Object.entries(a).filter(([, v]) => v?.trim())) as Intake
const ask = (id: string) => INTAKE_QUESTIONS.find((q) => q.id === id)!.q

/** One screen: tap and talk, type, bring what you have or ask your AI; then review and go. */
export function IntakeScreen() {
  const { go, councilKey, lockDoor, lockApproval } = useCouncil()
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
  const cap = useCapture()
  // The field being spoken into; none once the mic is closed (or never opened).
  const field = cap.recording ? currentField(voice) : null

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
    if (code === 'approval') lockApproval()
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
          if (code === 'password' || code === 'approval' || code === 'quota') return failed(e)
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

  // Voice (Pavol, 20 Nov): he arrives at the question and starts talking with one tap. The mic
  // opens inside that tap; nothing is read aloud first, and nothing moves on by itself.
  const add = (id: IntakeId) => (piece: string) => setAnswers((a) => ({ ...a, [id]: addWords(a[id] ?? '', piece) }))
  // After the mic was taken away (he left the page), the next tap carries on at the same field.
  const lostAt = cap.lost ? currentField(voice) : null
  const startVoice = () => {
    if (!lostAt) dispatch({ type: 'start', queue: walkQueue(answers) })
    cap.start(add(lostAt ?? 'goal'))
  }
  const upNext = nextField(voice)
  const nextQuestion = () => {
    if (!upNext) return
    cap.retarget(add(upNext)) // one open mic: what was said so far stays in this field
    dispatch({ type: 'next' })
    setOpen(true)
  }
  useEffect(() => {
    if (field && field !== 'goal') document.getElementById(`f-${field}`)?.scrollIntoView?.({ block: 'center' })
  }, [field])

  // Listed in the order the walk asks them, so screen and voice agree.
  const about = voiceOrder({})
    .filter((id) => id !== 'goal')
    .map((id) => INTAKE_QUESTIONS.find((q) => q.id === id)!)
  const goal = INTAKE_QUESTIONS.find((q) => q.id === 'goal')!

  // The recording's controls sit under the field they fill: one filled action per state
  // ("Tap and talk", then "Finish"), and "Next question" as a second word button.
  const voiceControls = (id: IntakeId) => {
    if (!micAvailable() || (field ?? lostAt ?? 'goal') !== id) return null
    const { phase } = cap
    return (
      <div className="mt-2" data-testid="voice-bar">
        {id !== 'goal' && <p className="t-title mb-2 italic">{ask(id)}</p>}
        <CapturePanel cap={cap} className="mb-2" />
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="mic"
            onClick={() => (phase === 'idle' ? startVoice() : cap.recording ? void cap.finish() : undefined)}
            disabled={phase === 'writing'}
            aria-pressed={cap.recording}
            className={`slab min-w-0 flex-1 gap-2 ${cap.recording || (phase === 'idle' && !answers.goal?.trim()) ? '' : 'slab-off'}`}
          >
            <MicIcon />
            {phase === 'idle' ? 'Tap and talk' : phase === 'writing' ? 'Writing it down…' : 'Finish'}
          </button>
          {cap.recording && upNext && (
            <button type="button" onClick={nextQuestion} className="slab slab-off min-w-0 flex-1">
              Next question
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-12">
      <h1 className="sr-only">Your question</h1>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go('start')} className="text-btn -ml-3 px-3 text-marble-400">
          ← Back
        </button>
        <p className="rubric" aria-hidden="true">
          Your question
        </p>
      </div>

      <TrustNote />

      <label htmlFor="f-goal" className={`t-note versal-raised mt-2 block ${field === 'goal' ? 'text-candle-300' : 'text-marble-200'}`}>
        {goal.q}
      </label>
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
      {voiceControls('goal')}

      {/* Two ways to skip the form; what they fill is reviewed under About you. */}
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
        onClick={() => begin(intakePayload(answers))}
        // While it records or writes down, his words are not all on the page yet.
        disabled={cap.phase !== 'idle'}
        className={`slab mt-6 ${answers.goal?.trim() || !micAvailable() ? '' : 'slab-off'}`}
      >
        Bring it to the group
      </button>
      <p className="t-note mt-2">
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
              <textarea
                id={`f-${q.id}`}
                rows={1}
                aria-label={q.q}
                value={answers[q.id] ?? ''}
                onChange={(e) => set(q.id, e.target.value)}
                placeholder={field === q.id ? q.hint : q.q}
                className="field mt-2 resize-none [field-sizing:content]"
              />
              {voiceControls(q.id)}
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

      <p className="t-fine mt-12">
        The advisers are AI. <PrivacyLink />
      </p>
    </div>
  )
}
