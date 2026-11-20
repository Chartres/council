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

/** A note's own words, at most. */
export const MAX_NOTE = 300
/** The gateway's limit for one message (MAX_MESSAGE in v4-routes.ts): notes and her words together. */
export const MAX_MESSAGE = 2000
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

/** Her notes, one line each, then a blank line and her own words. Never longer than the
 *  gateway takes: the screen stops her first (tooLong); a voice turn is cut at the limit. */
export function composeMessage(notes: Note[], message: string, name: (id: string) => string, reply?: Reply): string {
  return compose(notes, message, name, reply).slice(0, MAX_MESSAGE)
}

/** How long the message would be, uncut — over MAX_MESSAGE Send waits. */
export function composedLength(notes: Note[], message: string, name: (id: string) => string, reply?: Reply): number {
  return compose(notes, message, name, reply).length
}

/** The one message his words answer, when he swiped or tapped Reply on it. */
export type Reply = { speaker: string; quote: string }

function compose(notes: Note[], message: string, name: (id: string) => string, reply?: Reply): string {
  const said = message.trim()
  const words = said && reply ? `To ${name(reply.speaker)} ("${reply.quote}"): ${said}` : said
  if (!notes.length) return words
  const lines = notes.map((n) => line(n, name(n.speaker)))
  // A reply goes first: the gateway gives the turn to the first adviser addressed.
  if (reply && words) return [words, '', ...lines].join('\n')
  return (words ? [...lines, '', words] : lines).join('\n')
}
