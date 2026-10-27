import type { ReactNode } from 'react'
import { personaName } from '@/content/personas'
import type { Quaestio as Q } from '@/domain/quaestio'

// The decision record as a quaestio (docs/SIGNATURE.md, after Aquinas). Rubrics in clay small
// capitals mark the parts, as in the printed Summa; nothing else on the card uses that red.

function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="rubric" data-testid="rubric">
        {label}
      </p>
      <div className="t-body mt-1 text-marble-200">{children}</div>
    </div>
  )
}

export function Quaestio({
  q,
  contra,
  onTest,
  busy = false,
}: {
  q: Q
  /** A verified line from the session; absent in the journal, where the transcript is gone. */
  contra?: { speaker: string; text: string; source: string } | null
  /** Live session only: ask the group to argue against it. */
  onTest?: () => void
  busy?: boolean
}) {
  return (
    <div data-testid="quaestio" className="mt-6">
      {q.question && <Part label="Question">{q.question}</Part>}
      <Part label="It seems not, because">
        {q.objections.length ? (
          <ol className="space-y-2">
            {q.objections.map((o, i) => (
              <li key={i}>
                {o.text}
                {o.speaker && <span className="text-marble-400"> — {personaName(o.speaker)}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <>
            <p>No one argued against this yet.</p>
            {onTest && (
              <button type="button" disabled={busy} onClick={onTest} className="text-btn -ml-3 px-3">
                Test it
              </button>
            )}
          </>
        )}
      </Part>
      {contra && (
        <Part label="On the contrary">
          <p className="font-display text-[19px] leading-[27px] text-marble-100">“{contra.text.replace(/^["“]|["”]$/g, '')}”</p>
          <p className="mt-1 text-[13px] text-marble-400">
            {personaName(contra.speaker)} · {contra.source}
          </p>
        </Part>
      )}
      <Part label="I answer">{q.answer}</Part>
      {q.mustHold.length > 0 && (
        <Part label="What must hold">
          <ul className="space-y-1">
            {q.mustHold.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Part>
      )}
    </div>
  )
}
