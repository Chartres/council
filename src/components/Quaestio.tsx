import type { ReactNode } from 'react'
import { personaName } from '@/content/personas'
import type { Quaestio as Q } from '@/domain/quaestio'
import { Manicule, Tailpiece, Versal } from '@/components/Furniture'

// The decision record as a quaestio (docs/SIGNATURE.md, after Aquinas). Rubrics in clay small
// capitals mark the parts, as in the printed Summa: a pilcrow before each, the question under
// a versal, the objections numbered in red, a manicule at what must hold, a tailpiece to close.

function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="rubric">
        <span aria-hidden="true" className="mr-1.5 text-[19px]">
          ¶
        </span>
        <span data-testid="rubric">{label}</span>
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
      {q.question && (
        <Part label="Question">
          <Versal className="t-title">{q.question}</Versal>
        </Part>
      )}
      {q.objections && (
        <Part label="It seems not, because">
          {q.objections.length ? (
            <ol className="space-y-2">
              {q.objections.map((o, i) => (
                <li key={i} className="grid grid-cols-[22px_1fr]">
                  <b aria-hidden="true" className="font-medium text-clay-400">
                    {i + 1}
                  </b>
                  <span>
                    {o.text}
                    {o.speaker && <span className="sc text-marble-400"> — {personaName(o.speaker)}</span>}
                  </span>
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
      )}
      {contra && (
        <Part label="On the contrary">
          <p className="text-[22px] italic leading-[28px] text-marble-50">“{contra.text.replace(/^["“]|["”]$/g, '')}”</p>
          <p className="t-ref mt-1">
            {personaName(contra.speaker)} · {contra.source}
          </p>
        </Part>
      )}
      <Part label="I answer">{q.answer}</Part>
      {q.mustHold.length > 0 && (
        <Part label="What must hold">
          <ul className="space-y-1">
            {q.mustHold.map((a, i) => (
              <li key={i} className="grid grid-cols-[38px_1fr]">
                <Manicule className="mt-[7px]" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </Part>
      )}
      <Tailpiece className="mt-6" />
    </div>
  )
}
