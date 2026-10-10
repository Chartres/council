import { useState } from 'react'
import { GATEWAY_URL, useCouncil } from '@/app/CouncilContext'
import { useMastermind } from '@/app/MastermindContext'
import { useAuth } from '@/auth/AuthContext'
import { MicButton } from '@/components/MicButton'
import { MAX_FEEDBACK, sendFeedback } from '@/domain/feedback'

const DONE = { sent: 'Thanks. Pavol reads these.', quota: 'Enough for today, thank you.' }

/** The header's feedback sheet: a few words (typed or spoken) straight to Pavol. */
export function FeedbackSheet() {
  const { token } = useAuth()
  const { councilKey, session } = useCouncil()
  const { conversation } = useMastermind()
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'quota' | 'failed'>('idle')

  if (state === 'sent' || state === 'quota')
    return (
      <p role="status" className="text-sm text-marble-200" data-testid="feedback-done">
        {DONE[state]}
      </p>
    )

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setState('sending')
    const result = await sendFeedback(
      {
        text,
        page: window.location.pathname,
        session_id: conversation?.sessionId ?? session?.sessionId ?? null,
      },
      { gatewayUrl: GATEWAY_URL, token, councilKey },
    )
    setState(result)
  }

  return (
    <form onSubmit={send} aria-label="Feedback">
      <label htmlFor="feedback" className="block text-sm text-marble-300">
        What worked, what didn’t?
      </label>
      <div className="mt-1 flex items-end gap-2">
        <textarea
          id="feedback"
          rows={3}
          maxLength={MAX_FEEDBACK}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 resize-y rounded-card border border-ink-700 bg-ink-900 px-3 py-2 text-base text-marble-100 focus:border-candle-500"
        />
        <MicButton value={text} onChange={setText} label="your feedback" />
      </div>
      <button
        type="submit"
        disabled={state === 'sending' || !text.trim()}
        className="mt-1 min-h-11 text-sm font-semibold text-candle-300 hover:text-candle-200 disabled:text-marble-500"
      >
        {state === 'sending' ? 'Sending…' : 'Send'}
      </button>
      {state === 'failed' && <p className="text-sm text-clay-400">Could not send it. Try again in a moment.</p>}
    </form>
  )
}
