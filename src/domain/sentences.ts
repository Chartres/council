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
