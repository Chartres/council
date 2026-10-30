import { MAX_MESSAGE, MAX_NOTE, type Note, type Stance } from '@/domain/notes'

const MARK: Record<Stance, string> = { agree: 'You agree', push: 'You push back', note: 'Your note' }

/**
 * Under one contribution: Agree · Push back · Note. A mark stays in the margin like a reader's
 * gloss, in the rubric red; push back and note take a line of her own. Nothing is sent here —
 * the notes go with her next message (NotesTray says so).
 */
export function MarginNote({
  name,
  note,
  onChange,
}: {
  /** The adviser's display name, for the placeholder and labels. */
  name: string
  note?: Pick<Note, 'stance' | 'text'>
  onChange: (next: Pick<Note, 'stance' | 'text'> | null) => void
}) {
  if (!note) {
    const mark = (stance: Stance) => onChange({ stance, text: '' })
    return (
      <div className="-ml-3 mt-1 flex" role="group" aria-label={`Your note on ${name}`}>
        <button type="button" className="text-btn px-3 text-marble-400" onClick={() => mark('agree')}>
          Agree
        </button>
        <button type="button" className="text-btn px-3 text-marble-400" onClick={() => mark('push')}>
          Push back
        </button>
        <button type="button" className="text-btn px-3 text-marble-400" onClick={() => mark('note')}>
          Note
        </button>
      </div>
    )
  }
  return (
    <div className="mt-2 border-l-2 border-clay-500 pl-3" data-testid="margin-note">
      <div className="flex items-center justify-between gap-2">
        <p className="rubric">{MARK[note.stance]}</p>
        <button
          type="button"
          className="text-btn px-3 text-marble-400"
          aria-label={`Remove your note on ${name}`}
          onClick={() => onChange(null)}
        >
          Remove
        </button>
      </div>
      {note.stance !== 'agree' && (
        <textarea
          aria-label={note.stance === 'push' ? `Why you push back on ${name}` : `Your note to ${name}`}
          autoFocus
          rows={1}
          maxLength={MAX_NOTE}
          value={note.text}
          onChange={(e) => onChange({ ...note, text: e.target.value })}
          placeholder={note.stance === 'push' ? `What ${name} is missing` : `What you’d say to ${name}`}
          className="mt-1 w-full resize-none bg-transparent text-[17px] italic leading-[26px] text-marble-100 [field-sizing:content] placeholder:text-marble-500"
        />
      )}
    </div>
  )
}

/** Above the reply box: what goes with her next message, and whether it fits in one. */
export function NotesTray({ count, length = 0, onClear }: { count: number; length?: number; onClear: () => void }) {
  if (!count) return null
  const over = length > MAX_MESSAGE
  return (
    <div className="mt-6 flex items-center justify-between gap-2" data-testid="notes-tray">
      <p className={`text-[15px] leading-[23px] ${over ? 'text-clay-400' : 'text-marble-300'}`} role={over ? 'alert' : undefined}>
        {over
          ? `Too long for one message (${length} of ${MAX_MESSAGE} characters). Shorten a note or your reply.`
          : `${count === 1 ? 'Your note goes' : `Your ${count} notes go`} with your next message.`}
      </p>
      <button type="button" className="text-btn px-3 text-marble-400" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}
