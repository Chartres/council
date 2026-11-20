// Streamed text in, whole sentences out, so speech can start on the first sentence while the
// rest is still arriving. A sentence ends at . ! ? (plus any closing quote or bracket) followed
// by whitespace; a stop at the very end waits for the next piece ("3." may become "3.5").
// ponytail: a fixed abbreviation list and single-letter initials; add words as they misfire.

const END = /[.!?]+["'”’)\]]*(?=\s)/g
const ABBREV = /(?:^|\s)(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st|no|cf|approx|[a-z])\.$/i

export function sentenceChunker() {
  let buf = ''
  const take = (end: boolean): string[] => {
    const out: string[] = []
    let start = 0
    for (const m of buf.matchAll(END)) {
      const stop = m.index + m[0].length
      if (m[0] === '.' && ABBREV.test(buf.slice(start, stop))) continue
      const s = buf.slice(start, stop).trim()
      if (s) out.push(s)
      start = stop
    }
    buf = buf.slice(start)
    if (end) {
      if (buf.trim()) out.push(buf.trim())
      buf = ''
    }
    return out
  }
  return {
    push: (delta: string) => {
      buf += delta
      return take(false)
    },
    flush: () => take(true),
  }
}

/** A whole text, cut where the speaker cuts it. */
export function sentencesOf(text: string): string[] {
  const c = sentenceChunker()
  return [...c.push(text), ...c.flush()]
}

/** The gateway checks quotations ("…", “…”) and citations ("(Meditations 4.3)") once the turn
 *  is in and may cut that sentence: while streaming, such a sentence waits for the checked text. */
export const mayQuote = (s: string) => /["“”(]/.test(s)

/** Emphasis marks and spacing: the check strips them, so they are not a change. */
const plain = (s: string) => s.replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()

/** The sentences of the checked text still to be read, in order: those already spoken are
 *  skipped where they appear, and nothing the check cut is read. */
export function rest(said: string[], shown: string): string[] {
  let j = 0
  return sentencesOf(shown).filter((s) => {
    if (j < said.length && plain(said[j]) === plain(s)) {
      j++
      return false
    }
    return true
  })
}

/** Where `line` sits among the sentences of `text`, or -1. */
export const sentenceAt = (text: string, line: string) => sentencesOf(text).findIndex((s) => plain(s) === plain(line))
