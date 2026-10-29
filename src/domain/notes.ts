// Margin notes (Eyal, 29 Oct): she reacts to each contribution as she reads — agree, push
// back, or a note of her own — and the notes go with her next message, each addressed to its
// adviser and the point it answers. The gateway's bible tells an adviser named in a note to
// answer it first. The form is the reader's gloss in the margin of a printed book.

export type Stance = 'agree' | 'push' | 'note'

export type Note = {
  speaker: string
  /** The opening words of the contribution, so the adviser knows which point. */
  quote: string
  stance: Stance
  text: string
}

/** A note's own words, at most (the gateway takes 2,000 characters per message). */
export const MAX_NOTE = 300
const QUOTE_WORDS = 8

export function quoteOf(text: string): string {
  const words = text.trim().split(/\s+/)
  return words.length <= QUOTE_WORDS ? text.trim() : `${words.slice(0, QUOTE_WORDS).join(' ')}…`
}

const line = (n: Note, name: string) => {
  const head = `To ${name} ("${n.quote}"): `
  const text = n.text.trim().slice(0, MAX_NOTE)
  if (n.stance === 'agree') return `${head}Agree.${text ? ` ${text}` : ''}`
  if (n.stance === 'push') return `${head}Push back${text ? ` — ${text}` : '.'}`
  return `${head}${text || 'Note.'}`
}

/** Her notes, one line each, then a blank line and her own words. */
export function composeMessage(notes: Note[], message: string, name: (id: string) => string): string {
  const words = message.trim()
  if (!notes.length) return words
  const lines = notes.map((n) => line(n, name(n.speaker)))
  return words ? [...lines, '', words].join('\n') : lines.join('\n')
}
