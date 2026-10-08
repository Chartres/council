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
import { isAdmin } from '@/domain/admin'
import {
  CouncilError,
  openSession,
  replyToSession,
  type CouncilEvent,
  type FailureReason,
  type Tier,
  type Turn,
  type Verdict,
} from '@/domain/council'
import { loadLocal, loadRemote, saveLocal, saveRemote, type SavedIdea } from '@/domain/ideas'
import { checkKey, gateState, loadKey, saveKey, type GateState } from '@/domain/key'
import { loadTier, saveTier } from '@/domain/tier'
import { fetchUsage, type Usage } from '@/domain/usage'

export type View = 'home' | 'session' | 'ideas'

/** What to resume automatically once a rotated password is re-entered and accepted. */
type PendingAction =
  | { kind: 'convene'; idea: string; dailyKey?: string; question?: string }
  | { kind: 'reply'; message: string }

export interface SessionState {
  localId: string
  sessionId: string | null
  idea: string
  dailyKey: string | null
  question: string | null
  personas: string[]
  turns: Turn[]
  verdict: Verdict | null
  tier: Tier | null
  /** Echoed back by the gateway; admin-only display (SessionScreen never shows it). */
  model: string | null
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
  /** 'ask' until the private-beta password is stored and accepted. */
  gate: GateState
  submitKey: (value: string) => void
  /** True while the panel's submit is checking the typed password against the gateway. */
  checkingKey: boolean
  /** Set when the gateway has just rejected a typed/rotated key; null otherwise. */
  keyError: 'password' | 'gateway' | null
  /** True for the committed admin emails (or the VITE_E2E_ADMIN test escape hatch). */
  isAdmin: boolean
  /** Admin-only free/premium switch, persisted in `council:tier`. */
  tier: Tier
  setTier: (tier: Tier) => void
  /** Admin-only cost indicator; null until the first successful fetch. */
  usage: Usage | null
}

const CouncilContext = createContext<CouncilContextValue | null>(null)

const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? ''

export function CouncilProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [view, setView] = useState<View>('home')
  const [picked, setPicked] = useState<string[]>(DEFAULT_PERSONA_IDS)
  const [session, setSession] = useState<SessionState | null>(null)
  const [ideas, setIdeas] = useState<SavedIdea[]>(() => loadLocal())
  const [councilKey, setCouncilKey] = useState<string | null>(() => loadKey())
  const [checkingKey, setCheckingKey] = useState(false)
  const [keyError, setKeyError] = useState<'password' | 'gateway' | null>(null)
  const admin = isAdmin(user?.email)
  const [tier, setTierState] = useState<Tier>(() => loadTier())
  const [usage, setUsage] = useState<Usage | null>(null)
  // What to resume once a rotated password is re-entered and accepted; null for a
  // plain first-visit ask, which just opens the home screen instead.
  const [pendingResume, setPendingResume] = useState<PendingAction | null>(null)
  // The streaming loop must not race a second convene; one generator at a time.
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!supabase || !user) return
    loadRemote(supabase, user.id).then((rows) => {
      if (rows.length) setIdeas(rows)
    })
  }, [user])

  const setTier = useCallback((next: Tier) => {
    saveTier(next)
    setTierState(next)
  }, [])

  // Admin-only; refreshed on mount and after each session's `done` (see `consume`).
  const refreshUsage = useCallback(() => {
    if (!admin) return
    void fetchUsage({ gatewayUrl: GATEWAY_URL, token, councilKey }).then((next) => {
      if (next) setUsage(next)
    })
  }, [admin, token, councilKey])

  useEffect(() => {
    refreshUsage()
  }, [refreshUsage])

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
    async (events: AsyncGenerator<CouncilEvent>, base: SessionState, pending: PendingAction) => {
      let state = base
      const commit = (next: Partial<SessionState>) => {
        state = { ...state, ...next }
        setSession(state)
      }
      try {
        for await (const event of events) {
          switch (event.type) {
            case 'session':
              commit({
                sessionId: event.session_id,
                tier: event.tier ?? state.tier,
                model: event.model ?? state.model,
              })
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
                  quotes: event.quotes,
                },
              })
              break
            case 'done':
              refreshUsage()
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
          // The key that opened the panel was fine a moment ago and just got rotated.
          // Reopen the door (gateState reacts to failure:'password') but keep the idea
          // text and personas already captured in `pending`/session state, and remember
          // what to re-run once the new password checks out.
          if (e.reason === 'password') setPendingResume(pending)
        } else {
          logError(e, { where: 'council-stream' })
          commit({ streaming: false, failure: 'gateway' })
        }
      }
    },
    [persist, refreshUsage],
  )

  // Takes the key explicitly rather than reading `councilKey` state, so a resume right
  // after a password re-check can use the just-verified value without waiting a render
  // for the state update to land.
  const runConvene = useCallback(
    (idea: string, dailyKey: string | undefined, question: string | undefined, key: string | null) => {
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
        tier: null,
        model: null,
        streaming: true,
        failure: null,
      }
      setSession(base)
      setView('session')
      track('council_convened', { personas: picked.length, daily: Boolean(dailyKey) })
      void consume(
        openSession(
          { idea, personas: picked, anon: !token },
          {
            gatewayUrl: GATEWAY_URL,
            token,
            councilKey: key,
            tier: admin ? tier : null,
            signal: controller.signal,
          },
        ),
        base,
        { kind: 'convene', idea, dailyKey, question },
      )
    },
    [consume, picked, token, admin, tier],
  )

  const convene = useCallback(
    ({ idea, dailyKey, question }: { idea: string; dailyKey?: string; question?: string }) =>
      runConvene(idea, dailyKey, question, councilKey),
    [runConvene, councilKey],
  )

  const runReply = useCallback(
    (message: string, key: string | null) => {
      if (!session?.sessionId) return
      const controller = new AbortController()
      abort.current = controller
      const base: SessionState = { ...session, streaming: true, failure: null, verdict: null }
      setSession(base)
      track('council_replied')
      void consume(
        replyToSession(
          { session_id: session.sessionId, message },
          {
            gatewayUrl: GATEWAY_URL,
            token,
            councilKey: key,
            tier: admin ? tier : null,
            signal: controller.signal,
          },
        ),
        base,
        { kind: 'reply', message },
      )
    },
    [consume, session, token, admin, tier],
  )

  const reply = useCallback((message: string) => runReply(message, councilKey), [runReply, councilKey])

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
      tier: null,
      model: null,
      streaming: false,
      failure: null,
    })
    setView('session')
  }, [])

  // Checked against the gateway before the panel ever closes, so a wrong password
  // never costs the idea text a convene/reply would otherwise have carried in. A
  // pending resume (password rotated mid-session) re-runs with the preserved text;
  // a plain first-visit entry just opens the home screen.
  const submitKey = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      setCheckingKey(true)
      setKeyError(null)
      const result = await checkKey(trimmed, GATEWAY_URL)
      setCheckingKey(false)
      if (result === 'wrong') return setKeyError('password')
      if (result === 'gateway') return setKeyError('gateway')

      saveKey(trimmed)
      setCouncilKey(trimmed)
      const pending = pendingResume
      setPendingResume(null)
      if (pending?.kind === 'convene') {
        runConvene(pending.idea, pending.dailyKey, pending.question, trimmed)
      } else if (pending?.kind === 'reply') {
        runReply(pending.message, trimmed)
      } else {
        setSession(null)
        setView('home')
      }
    },
    [pendingResume, runConvene, runReply],
  )

  return (
    <CouncilContext.Provider
      value={{
        view,
        go: setView,
        picked,
        togglePersona,
        session,
        convene,
        reply,
        ideas,
        open,
        gate: gateState(councilKey, session?.failure ?? null),
        submitKey,
        checkingKey,
        keyError,
        isAdmin: admin,
        tier,
        setTier,
        usage,
      }}
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
