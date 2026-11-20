// The floor (Pavol, 20 Nov 2026, option A of lab/one-voice): one bar at the bottom of the
// conversation, one status line in it that always says what is happening. This is that line.

export type FloorState = {
  /** Read aloud is on but this page has not been tapped yet: the mic and the speaker wait. */
  waiting: boolean
  paused: boolean
  /** The adviser whose line did not load: the room holds there. */
  missed: string | null
  /** Who is being read aloud now, and which sentence of how many (1-based). */
  talker: string | null
  reading: { k: number; n: number } | null
  /** The group is answering; the adviser's name once the answer has one. */
  streaming: boolean
  answering: string | null
  recording: boolean
  /** The mic's own sentence while it records ("Recording. I can hear you."). */
  mic: { tone: 'plain' | 'bad'; text: string } | null
  /** Parts of what he said still being written down by the gateway. */
  pending: number
  /** Words waiting in the draft. */
  draft: boolean
  /** Sent while the group was still answering: they go when it is done. */
  held: boolean
}

const parts = (n: number) => `Writing it down: ${n} ${n === 1 ? 'part' : 'parts'} left`

export function floorStatus(s: FloorState): { text: string; tone: 'plain' | 'bad' } {
  const plain = (text: string) => ({ text, tone: 'plain' as const })
  if (s.waiting) return plain('Read aloud is on. Tap Start to carry on.')
  if (s.paused && s.missed) return plain(`${s.missed}’s voice did not load. Tap to hear it, or read it above.`)
  if (s.paused) return plain('Paused.')
  if (s.recording && s.mic?.tone === 'bad') return s.mic
  if (s.pending > 0) return plain(s.recording ? `Recording. ${parts(s.pending)}` : parts(s.pending))
  if (s.recording) return s.mic ?? plain('Recording.')
  if (s.talker && s.reading) return plain(`${s.talker}, sentence ${s.reading.k} of ${s.reading.n}`)
  if (s.held) return plain('Your words go when the answer is done.')
  if (s.talker || s.streaming) return plain(`${s.talker ?? s.answering ?? 'The council'} is answering. Tap to speak instead.`)
  if (s.draft) return plain('Read it over. Tap your words to correct them.')
  return plain('Your turn. Take your time.')
}
