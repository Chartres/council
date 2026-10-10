// "Talk it through": the facilitator asks each still-empty intake question aloud, the mic
// listens, the answer fills the field, and it moves on. The screen owns speech and
// recognition; this reducer owns only the order. ask → (spoken) listen → advance → ask …

import type { IntakeId } from './mastermind'

export interface VoiceState {
  queue: IntakeId[]
  at: number
  phase: 'idle' | 'ask' | 'listen'
}

export type VoiceAction =
  | { type: 'start'; empty: IntakeId[] }
  | { type: 'asked' }
  | { type: 'advance' }
  | { type: 'stop' }

export const VOICE_IDLE: VoiceState = { queue: [], at: 0, phase: 'idle' }

export function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case 'start':
      return action.empty.length ? { queue: action.empty, at: 0, phase: 'ask' } : VOICE_IDLE
    case 'stop':
      return { ...state, phase: 'idle' }
    case 'asked':
      return state.phase === 'ask' ? { ...state, phase: 'listen' } : state
    case 'advance': {
      if (state.phase === 'idle') return state
      const at = state.at + 1
      return { ...state, at, phase: at < state.queue.length ? 'ask' : 'idle' }
    }
  }
}

export const currentField = (s: VoiceState): IntakeId | null => (s.phase === 'idle' ? null : s.queue[s.at])
