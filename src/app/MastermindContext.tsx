import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { conversion, logError, track } from '@/analytics'
import { useAuth } from '@/auth/AuthContext'
import { supabase } from '@/auth/supabase'
import { defaultAdvisers, nextPicked, type RosterId } from '@/content/personas'
import { CouncilError, type FailureReason, type StreamOptions, type Tier } from '@/domain/council'
import {
  loadLocalJournal,
  loadRemoteJournal,
  saveLocalJournal,
  saveRemoteCommitment,
  saveRemoteEntry,
  saveRemoteOutcome,
  saveRemoteSession,
} from '@/domain/journalStore'
import {
  assembleMemory,
  capture,
  commit,
  controlRoute,
  exportJournal,
  journalReducer,
  normalizeEntry,
  parseDeepLink,
  sendControl,
  sendTurn,
  startCouncil,
  type Control,
  type Intake,
  type JournalEntry,
  type JournalState,
  type MastermindEvent,
  type Memory,
  type Outcome,
} from '@/domain/mastermind'
import { useCouncil } from './CouncilContext'

export type Item =
  | { kind: 'facilitator'; text: string }
  | { kind: 'contribution'; speaker: string; text: string; confidence?: number }
  | { kind: 'floor'; question: string }
  | { kind: 'user'; text: string }
  | {
      kind: 'proposal'
      entry: JournalEntry
      /** From the "Capture that decision" chip (already captured) vs. offered in-stream. */
      captured: boolean
      state: 'open' | 'accepted' | 'declined' | 'committed'
    }

export interface Conversation {
  localId: string
  sessionId: string | null
  roster: RosterId
  advisers: string[]
  intake: Intake | null
  items: Item[]
  streaming: boolean
  failure: FailureReason | null
  ended: boolean
  tier: Tier | null
}

interface Value {
  roster: RosterId
  setRoster: (r: RosterId) => void
  advisers: string[]
  toggleAdviser: (id: string) => void
  journal: JournalState
  lastIntake: Intake | null
  memory: Memory | null
  conversation: Conversation | null
  begin: (intake?: Intake, memoryOverride?: Memory | null) => void
  say: (message: string) => void
  control: (c: Control) => void
  accept: (index: number, edits: { decision: string; next_action: string }) => void
  decline: (index: number) => void
  commitTo: (index: number, dueDate: string, remind: boolean) => void
  recordOutcome: (id: string, outcome: Outcome) => void
  setRemind: (id: string, remind: boolean) => void
  exportText: () => string
  /** A reminder deep link arrived while signed out: show the sign-in panel. */
  linkNeedsSignIn: boolean
}

const Ctx = createContext<Value | null>(null)
const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? ''
const PENDING_LINK = 'council:pending-link'

const today = () => new Date().toISOString()

function readPendingLink(): string | null {
  try {
    return localStorage.getItem(PENDING_LINK)
  } catch {
    return null
  }
}

function writePendingLink(v: string | null) {
  try {
    if (v) localStorage.setItem(PENDING_LINK, v)
    else localStorage.removeItem(PENDING_LINK)
  } catch {
    // Without storage the link simply has to be clicked again after sign-in.
  }
}

export function MastermindProvider({ children }: { children: ReactNode }) {
  const { user, token, loading } = useAuth()
  const { councilKey, isAdmin, tier, lockDoor, go } = useCouncil()
  const [roster, setRosterState] = useState<RosterId>('business')
  const [advisers, setAdvisers] = useState<string[]>(() => defaultAdvisers('business'))
  const initial = useRef(loadLocalJournal()).current
  const [journal, dispatch] = useReducer(journalReducer, {
    entries: initial.entries,
    commitments: initial.commitments,
  })
  const [lastIntake, setLastIntake] = useState<Intake | null>(initial.lastIntake)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [linkNeedsSignIn, setLinkNeedsSignIn] = useState(false)
  const convo = useRef<Conversation | null>(null)
  const sb = user && supabase ? supabase : null

  const opts = useCallback(
    (): StreamOptions => ({ gatewayUrl: GATEWAY_URL, token, councilKey, tier: isAdmin ? tier : null }),
    [token, councilKey, isAdmin, tier],
  )

  const update = useCallback((next: Partial<Conversation> | ((c: Conversation) => Partial<Conversation>)) => {
    if (!convo.current) return
    const patch = typeof next === 'function' ? next(convo.current) : next
    convo.current = { ...convo.current, ...patch }
    setConversation(convo.current)
  }, [])

  // Anonymous: the whole journal lives in this browser.
  useEffect(() => {
    if (!user) saveLocalJournal({ ...journal, lastIntake })
  }, [user, journal, lastIntake])

  // Signed in: the last entries, open commitments and last intake come from Supabase.
  useEffect(() => {
    if (!sb || !user) return
    void loadRemoteJournal(sb, user.id).then((stored) => {
      dispatch({ type: 'load', state: { entries: stored.entries, commitments: stored.commitments } })
      if (stored.lastIntake) setLastIntake(stored.lastIntake)
    }, logError)
  }, [sb, user])

  const fail = useCallback(
    (e: unknown) => {
      const reason: FailureReason = e instanceof CouncilError ? e.reason : 'gateway'
      if (!(e instanceof CouncilError)) logError(e, { where: 'mastermind' })
      track('council_blocked', { reason, v: 4 })
      if (reason === 'password') lockDoor()
      update({ streaming: false, failure: reason })
    },
    [lockDoor, update],
  )

  const persistSession = useCallback(async () => {
    const c = convo.current
    if (!sb || !user || !c) return
    await saveRemoteSession(sb, user.id, {
      id: c.localId,
      roster: c.roster,
      advisers: c.advisers,
      intake: c.intake,
      transcript: c.items,
      ended_at: c.ended ? today() : null,
    }).catch(logError)
  }, [sb, user])

  const consume = useCallback(
    async (events: AsyncGenerator<MastermindEvent>) => {
      update({ streaming: true, failure: null })
      const push = (item: Item) => update((c) => ({ items: [...c.items, item] }))
      try {
        for await (const ev of events) {
          switch (ev.type) {
            case 'session':
              update((c) => ({ sessionId: ev.session_id, tier: ev.tier ?? c.tier }))
              break
            case 'facilitator':
              push({ kind: 'facilitator', text: ev.text })
              break
            case 'contribution':
              push({ kind: 'contribution', speaker: ev.speaker, text: ev.text, confidence: ev.confidence })
              break
            case 'floor':
              push({ kind: 'floor', question: ev.question })
              break
            case 'proposal': {
              const { type: _t, ...fields } = ev
              push({
                kind: 'proposal',
                captured: false,
                state: 'open',
                entry: normalizeEntry({ ...fields, status: 'proposal', created_at: today(), session_id: convo.current?.localId }),
              })
              break
            }
            case 'error':
              throw new CouncilError((ev.reason as FailureReason) ?? 'gateway')
          }
        }
        update({ streaming: false })
        void persistSession()
      } catch (e) {
        fail(e)
      }
    },
    [update, fail, persistSession],
  )

  const begin = useCallback(
    (intake?: Intake, memoryOverride?: Memory | null) => {
      const memory = memoryOverride === undefined ? assembleMemory(journal) : memoryOverride
      convo.current = {
        localId: crypto.randomUUID(),
        sessionId: null,
        roster,
        advisers,
        intake: intake ?? null,
        items: [],
        streaming: true,
        failure: null,
        ended: false,
        tier: null,
      }
      setConversation(convo.current)
      if (intake) setLastIntake(intake)
      go('conversation')
      track('council_convened', { personas: advisers.length, roster, v: 4, memory: Boolean(memory) })
      void consume(
        startCouncil({ roster, advisers, ...(intake ? { intake } : {}), ...(memory ? { memory } : {}) }, opts()),
      )
    },
    [journal, roster, advisers, go, consume, opts],
  )

  const say = useCallback(
    (message: string) => {
      const id = convo.current?.sessionId
      if (!id) return
      update((c) => ({ items: [...c.items, { kind: 'user', text: message }] }))
      track('council_replied', { v: 4 })
      void consume(sendTurn({ session_id: id, message }, opts()))
    },
    [update, consume, opts],
  )

  const exportText = useCallback(() => exportJournal(journal), [journal])

  const control = useCallback(
    (c: Control) => {
      const id = convo.current?.sessionId
      if (!id) return
      const route = controlRoute(c)
      if (route.route === 'export') return
      if (route.route === 'capture') {
        update({ streaming: true, failure: null })
        void capture({ session_id: id }, opts())
          .then(({ entry }) => {
            update((cv) => ({
              streaming: false,
              items: [
                ...cv.items,
                {
                  kind: 'proposal',
                  captured: true,
                  state: 'open',
                  entry: normalizeEntry({ ...entry, status: 'proposal', created_at: today(), session_id: cv.localId }),
                },
              ],
            }))
          })
          .catch(fail)
        return
      }
      if (c.kind === 'wrap_up') update({ ended: true })
      void consume(sendControl({ session_id: id, command: route.command }, opts()))
    },
    [update, consume, opts, fail],
  )

  const setItem = useCallback(
    (index: number, patch: Partial<Extract<Item, { kind: 'proposal' }>>) =>
      update((c) => ({
        items: c.items.map((it, i) => (i === index && it.kind === 'proposal' ? { ...it, ...patch } : it)),
      })),
    [update],
  )

  const accept = useCallback(
    (index: number, edits: { decision: string; next_action: string }) => {
      const c = convo.current
      const item = c?.items[index]
      if (!c?.sessionId || item?.kind !== 'proposal') return
      const save = (fields: Omit<JournalEntry, 'status' | 'created_at'>) => {
        // The journal row id is ours (uuid); the gateway's id only names the proposal.
        const entry: JournalEntry = {
          ...fields,
          ...edits,
          id: crypto.randomUUID(),
          session_id: c.localId,
          status: 'accepted',
          created_at: today(),
        }
        dispatch({ type: 'accept', entry })
        setItem(index, { entry, state: 'accepted' })
        conversion({ v: 4, roster: c.roster })
        // Session row first: the journal row references it.
        if (sb && user) void persistSession().then(() => saveRemoteEntry(sb, user.id, entry)).catch(logError)
      }
      if (item.captured) return save(item.entry)
      void capture({ session_id: c.sessionId, proposal_id: item.entry.id }, opts())
        .then(({ entry }) => save(normalizeEntry({ ...item.entry, ...entry })))
        .catch(fail)
    },
    [setItem, sb, user, persistSession, opts, fail],
  )

  const decline = useCallback((index: number) => setItem(index, { state: 'declined' }), [setItem])

  const commitTo = useCallback(
    (index: number, dueDate: string, remind: boolean) => {
      const c = convo.current
      const item = c?.items[index]
      if (!c?.sessionId || item?.kind !== 'proposal') return
      const body = {
        session_id: c.sessionId,
        entry_id: item.entry.id,
        due_date: dueDate,
        remind,
        id: crypto.randomUUID(),
        what: item.entry.next_action,
      }
      void commit(body, opts())
        .then(({ commitment }) => {
          const saved = {
            ...commitment,
            id: body.id,
            journal_id: body.entry_id,
            what: commitment.what ?? body.what,
            due_date: dueDate,
            remind,
            outcome: null,
          }
          dispatch({ type: 'commit', commitment: saved })
          setItem(index, { state: 'committed' })
          if (sb && user) void saveRemoteCommitment(sb, user.id, saved).catch(logError)
        })
        .catch(fail)
    },
    [opts, setItem, sb, user, fail],
  )

  const recordOutcome = useCallback(
    (id: string, outcome: Outcome) => {
      const at = today()
      dispatch({ type: 'outcome', id, outcome, at })
      if (sb) void saveRemoteOutcome(sb, id, outcome, at).catch(logError)
    },
    [sb],
  )

  const setRemind = useCallback(
    (id: string, remind: boolean) => {
      dispatch({ type: 'remind', id, remind })
      if (sb) void sb.from('council_commitments').update({ remind }).eq('id', id).then(undefined, logError)
    },
    [sb],
  )

  // Reminder deep link: /c/:commitmentId?outcome=… — record it, then open a session with
  // that memory. Signed out (and not a commitment this browser holds): sign in first; the
  // link waits in localStorage so the magic-link return to `/` can pick it up.
  const handledLink = useRef(false)
  useEffect(() => {
    if (loading || handledLink.current) return
    const raw = parseDeepLink(window.location.pathname, window.location.search)
      ? window.location.pathname + window.location.search
      : readPendingLink()
    if (!raw) return
    const url = new URL(raw, window.location.origin)
    const link = parseDeepLink(url.pathname, url.search)
    if (!link) return writePendingLink(null)
    const local = !user && journal.commitments.some((c) => c.id === link.id)
    if (!user && !local) {
      writePendingLink(raw)
      setLinkNeedsSignIn(true)
      return
    }
    handledLink.current = true
    writePendingLink(null)
    setLinkNeedsSignIn(false)
    window.history.replaceState(null, '', '/')
    const resume = async () => {
      let state = journal
      let intake = lastIntake
      if (sb && user) {
        const stored = await loadRemoteJournal(sb, user.id)
        state = stored
        intake = stored.lastIntake ?? intake
      }
      if (link.outcome) {
        const at = today()
        state = journalReducer(state, { type: 'outcome', id: link.id, outcome: link.outcome, at })
        if (sb) await saveRemoteOutcome(sb, link.id, link.outcome, at)
      }
      dispatch({ type: 'load', state: { entries: state.entries, commitments: state.commitments } })
      begin(intake ?? undefined, assembleMemory(state))
    }
    void resume().catch(logError)
  }, [loading, user, sb, journal, lastIntake, begin])

  const setRoster = useCallback((r: RosterId) => {
    setRosterState(r)
    setAdvisers(defaultAdvisers(r))
  }, [])

  const toggleAdviser = useCallback((id: string) => setAdvisers((cur) => nextPicked(cur, id)), [])

  return (
    <Ctx.Provider
      value={{
        roster,
        setRoster,
        advisers,
        toggleAdviser,
        journal,
        lastIntake,
        memory: assembleMemory(journal),
        conversation,
        begin,
        say,
        control,
        accept,
        decline,
        commitTo,
        recordOutcome,
        setRemind,
        exportText,
        linkNeedsSignIn,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useMastermind(): Value {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMastermind must be used within <MastermindProvider>')
  return v
}
