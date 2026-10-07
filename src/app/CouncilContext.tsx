import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { conversion, logError, track } from '@/analytics'
import { useAuth } from '@/auth/AuthContext'
import { supabase } from '@/auth/supabase'
import { DEFAULT_PERSONA_IDS, nextPicked } from '@/content/personas'
import {
  CouncilError,
  openSession,
  replyToSession,
  type CouncilEvent,
  type FailureReason,
  type Turn,
  type Verdict,
} from '@/domain/council'
import { loadLocal, loadRemote, saveLocal, saveRemote, type SavedIdea } from '@/domain/ideas'

export type View = 'home' | 'session' | 'ideas'

export interface SessionState {
  localId: string
  sessionId: string | null
  idea: string
  dailyKey: string | null
  question: string | null
  personas: string[]
  turns: Turn[]
  verdict: Verdict | null
  streaming: boolean
  failure: FailureReason | null
}

interface CouncilContextValue {
  view: View
  go: (view: View) => void
  picked: string[]
  togglePersona: (id: string) => void
  session: SessionState | null
  convene: (input: { idea: string; dailyKey?: string; question?: string }) => void
  reply: (message: string) => void
  ideas: SavedIdea[]
  open: (idea: SavedIdea) => void
}

const CouncilContext = createContext<CouncilContextValue | null>(null)

const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? ''

export function CouncilProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [view, setView] = useState<View>('home')
  const [picked, setPicked] = useState<string[]>(DEFAULT_PERSONA_IDS)
  const [session, setSession] = useState<SessionState | null>(null)
  const [ideas, setIdeas] = useState<SavedIdea[]>(() => loadLocal())
  // The streaming loop must not race a second convene; one generator at a time.
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!supabase || !user) return
    loadRemote(supabase, user.id).then((rows) => {
      if (rows.length) setIdeas(rows)
    })
  }, [user])

  const togglePersona = useCallback((id: string) => {
    setPicked((current) => nextPicked(current, id))
  }, [])

  const persist = useCallback(
    (state: SessionState, verdict: Verdict | null) => {
      const saved: SavedIdea = {
        id: state.localId,
        idea: state.idea,
        transcript: state.turns,
        verdict,
        created_at: new Date().toISOString(),
        daily_key: state.dailyKey,
      }
      setIdeas(saveLocal(saved))
      if (supabase && user) void saveRemote(supabase, user.id, saved).catch(logError)
    },
    [user],
  )

  const consume = useCallback(
    async (events: AsyncGenerator<CouncilEvent>, base: SessionState) => {
      let state = base
      const commit = (next: Partial<SessionState>) => {
        state = { ...state, ...next }
        setSession(state)
      }
      try {
        for await (const event of events) {
          switch (event.type) {
            case 'session':
              commit({ sessionId: event.session_id })
              break
            case 'turn':
              commit({ turns: [...state.turns, { persona: event.persona, text: event.text }] })
              break
            case 'verdict':
              commit({
                verdict: {
                  summary: event.summary,
                  next_action: event.next_action,
                  votes: event.votes,
                },
              })
              break
            case 'done':
              break
            case 'error':
              commit({ failure: (event.reason as FailureReason) ?? 'gateway' })
              break
          }
        }
        commit({ streaming: false })
        if (state.verdict) {
          conversion({ personas: state.personas.length, daily: Boolean(state.dailyKey) })
          persist(state, state.verdict)
        }
      } catch (e) {
        if (e instanceof CouncilError) {
          track('council_blocked', { reason: e.reason })
          commit({ streaming: false, failure: e.reason })
        } else {
          logError(e, { where: 'council-stream' })
          commit({ streaming: false, failure: 'gateway' })
        }
      }
    },
    [persist],
  )

  const convene = useCallback(
    ({ idea, dailyKey, question }: { idea: string; dailyKey?: string; question?: string }) => {
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      const base: SessionState = {
        localId: crypto.randomUUID(),
        sessionId: null,
        idea,
        dailyKey: dailyKey ?? null,
        question: question ?? null,
        personas: picked,
        turns: [],
        verdict: null,
        streaming: true,
        failure: null,
      }
      setSession(base)
      setView('session')
      track('council_convened', { personas: picked.length, daily: Boolean(dailyKey) })
      void consume(
        openSession(
          { idea, personas: picked, anon: !token },
          { gatewayUrl: GATEWAY_URL, token, signal: controller.signal },
        ),
        base,
      )
    },
    [consume, picked, token],
  )

  const reply = useCallback(
    (message: string) => {
      if (!session?.sessionId) return
      const controller = new AbortController()
      abort.current = controller
      const base: SessionState = { ...session, streaming: true, failure: null, verdict: null }
      setSession(base)
      track('council_replied')
      void consume(
        replyToSession(
          { session_id: session.sessionId, message },
          { gatewayUrl: GATEWAY_URL, token, signal: controller.signal },
        ),
        base,
      )
    },
    [consume, session, token],
  )

  const open = useCallback((idea: SavedIdea) => {
    setSession({
      localId: idea.id,
      sessionId: null,
      idea: idea.idea,
      dailyKey: idea.daily_key ?? null,
      question: idea.daily_key ? idea.idea : null,
      personas: Object.keys(idea.verdict?.votes ?? {}),
      turns: idea.transcript ?? [],
      verdict: idea.verdict,
      streaming: false,
      failure: null,
    })
    setView('session')
  }, [])

  return (
    <CouncilContext.Provider
      value={{ view, go: setView, picked, togglePersona, session, convene, reply, ideas, open }}
    >
      {children}
    </CouncilContext.Provider>
  )
}

export function useCouncil(): CouncilContextValue {
  const ctx = useContext(CouncilContext)
  if (!ctx) throw new Error('useCouncil must be used within <CouncilProvider>')
  return ctx
}
