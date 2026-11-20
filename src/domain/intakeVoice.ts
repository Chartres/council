// The intake's voice walk: he taps "Tap and talk" at the goal and starts speaking. "Next
// question" moves the same open recording to the next still-empty field; "Finish" ends it.
// Nothing moves on by itself (Pavol, 20 Nov: no waiting for silence). The screen owns the mic;
// this reducer owns only the order.

import { voiceOrder, type Intake, type IntakeId } from './mastermind'

export interface VoiceState {
  queue: IntakeId[]
  at: number
}

export type VoiceAction = { type: 'start'; queue: IntakeId[] } | { type: 'next' }

export const VOICE_IDLE: VoiceState = { queue: [], at: 0 }

/** The goal first, filled or not (a second recording adds to it), then the still-empty fields. */
export const walkQueue = (answers: Intake): IntakeId[] => ['goal', ...voiceOrder(answers).filter((id) => id !== 'goal')]

export function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case 'start':
      return { queue: action.queue, at: 0 }
    case 'next':
      return state.at + 1 < state.queue.length ? { ...state, at: state.at + 1 } : state
  }
}

export const currentField = (s: VoiceState): IntakeId | null => s.queue[s.at] ?? null
export const nextField = (s: VoiceState): IntakeId | null => s.queue[s.at + 1] ?? null
