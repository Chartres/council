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
import { conversion, keyAction, logError } from '@/analytics'
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
  itemsReducer,
  settleItems,
  journalReducer,
  normalizeEntry,
  parseDeepLink,
  sendControl,
  sendTurn,
  startCouncil,
  type Control,
  type Intake,
  type Item,
  type JournalEntry,
  type JournalState,
  type MastermindEvent,
  type Memory,
  type Outcome,
} from '@/domain/mastermind'
import {
  loadLocalDiscussions,
  loadRemoteDiscussions,
  resumeItems,
  saveLocalDiscussion,
  upsertDiscussion,
  type SavedDiscussion,
} from '@/domain/discussions'
import { useCouncil } from './CouncilContext'

export type { Item }

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
  /** When the discussion began (kept when it is continued). */
  startedAt: string
  /** A past discussion opened from the list: read-only until she continues it. */
  past?: boolean
  /** Continued: the items before this index are the earlier sessions' record. */
  earlier?: number
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
  /** `voice`: a Talk-mode turn — one adviser, streamed as deltas (council-v4.3.md). */
  say: (message: string, opts?: { voice?: boolean }) => void
  control: (c: Control) => void
  accept: (index: number, edits: { decision: string; next_action: string }) => void
  decline: (index: number) => void
  /** `what`: the part of the next action that is in her power, when she rewrote it. */
  commitTo: (index: number, dueDate: string, remind: boolean, what?: string) => void
  recordOutcome: (id: string, outcome: Outcome) => void
  setRemind: (id: string, remind: boolean) => void
  exportText: () => string
  /** A reminder deep link arrived while signed out: show the sign-in panel. */
  linkNeedsSignIn: boolean
  /** Every discussion, newest first (signed in: her account; anonymous: this browser). */
  discussions: SavedDiscussion[]
  /** Open one to read; the live one opens as it is. */
  openDiscussion: (id: string) => void
  /** Pick the opened past discussion up again with the same advisers. */
  continueDiscussion: () => void
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
  const [discussions, setDiscussions] = useState<SavedDiscussion[]>(() => (user ? [] : loadLocalDiscussions()))
  const convo = useRef<Conversation | null>(null)
  const generation = useRef(0)
  /** The open discussion is about to change hands: whatever is still streaming is let go. */
  const nextGeneration = () => {
    generation.current += 1
    return generation.current
  }
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

  // The list follows who she is: her account's discussions, or this browser's.
  const userId = user?.id ?? null
  useEffect(() => {
    if (loading) return
    if (!sb || !userId) return setDiscussions(loadLocalDiscussions())
    let current = true
    void loadRemoteDiscussions(sb, userId).then((list) => current && setDiscussions(list), logError)
    return () => {
      current = false
    }
  }, [loading, sb, userId])

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
      keyAction('blocked', { reason, v: 4 })
      if (reason === 'password') lockDoor()
      update((c) => ({ streaming: false, failure: reason, items: settleItems(c.items) }))
    },
    [lockDoor, update],
  )

  const persistSession = useCallback(async () => {
    const c = convo.current
    if (!c || c.past) return
    const saved: SavedDiscussion = {
      id: c.localId,
      roster: c.roster,
      advisers: c.advisers,
      intake: c.intake,
      items: c.items,
      created_at: c.startedAt,
      ended: c.ended,
    }
    // Anonymous: this browser keeps it; signed in: the session row below is the record.
    if (user) setDiscussions((list) => upsertDiscussion(list, saved))
    else setDiscussions(saveLocalDiscussion(saved))
    if (!sb || !user) return
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
      // Opening another discussion, beginning one or continuing one moves the generation on:
      // a stream from before then writes nowhere (even into the same discussion reopened).
      const mine = generation.current
      const gone = () => generation.current !== mine
      const push = (item: Item) => update((c) => ({ items: [...c.items, item] }))
      try {
        for await (const ev of events) {
          if (gone()) return
          switch (ev.type) {
            case 'session':
              update((c) => ({ sessionId: ev.session_id, tier: ev.tier ?? c.tier }))
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
            default:
              update((c) => ({ items: itemsReducer(c.items, ev) }))
          }
        }
        if (gone()) return
        update((c) => ({ streaming: false, items: settleItems(c.items) }))
        void persistSession()
      } catch (e) {
        if (!gone()) fail(e)
      }
    },
    [update, fail, persistSession],
  )

  const begin = useCallback(
    (intake?: Intake, memoryOverride?: Memory | null) => {
      const memory = memoryOverride === undefined ? assembleMemory(journal) : memoryOverride
      nextGeneration()
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
        startedAt: today(),
      }
      setConversation(convo.current)
      if (intake) setLastIntake(intake)
      go('conversation')
      keyAction('convened', { personas: advisers.length, roster, v: 4, memory: Boolean(memory) })
      void consume(
        startCouncil({ roster, advisers, ...(intake ? { intake } : {}), ...(memory ? { memory } : {}) }, opts()),
      )
    },
    [journal, roster, advisers, go, consume, opts],
  )

  const say = useCallback(
    (message: string, { voice = false }: { voice?: boolean } = {}) => {
      const id = convo.current?.sessionId
      if (!id) return
      update((c) => ({ items: [...c.items, { kind: 'user', text: message }] }))
      keyAction('replied', { v: 4, voice })
      void consume(sendTurn({ session_id: id, message, ...(voice ? { voice: true as const } : {}) }, opts()))
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
            keyAction('captured', { v: 4 })
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
      const gen = generation.current
      const save = (fields: Omit<JournalEntry, 'status' | 'created_at'>) => {
        if (generation.current !== gen) return // she left this discussion while it was captured
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
        // The discussion's record first (and, signed in, the session row the journal row references).
        void persistSession()
          .then(() => (sb && user ? saveRemoteEntry(sb, user.id, entry) : undefined))
          .catch(logError)
      }
      if (item.captured) return save(item.entry)
      void capture({ session_id: c.sessionId, proposal_id: item.entry.id }, opts())
        .then(({ entry }) => save(normalizeEntry({ ...item.entry, ...entry, map: entry.map ?? item.entry.map })))
        .catch((e) => generation.current === gen && fail(e))
    },
    [setItem, sb, user, persistSession, opts, fail],
  )

  const decline = useCallback((index: number) => setItem(index, { state: 'declined' }), [setItem])

  const commitTo = useCallback(
    (index: number, dueDate: string, remind: boolean, what?: string) => {
      const c = convo.current
      const item = c?.items[index]
      if (!c?.sessionId || item?.kind !== 'proposal') return
      const body = {
        session_id: c.sessionId,
        entry_id: item.entry.id,
        due_date: dueDate,
        remind,
        id: crypto.randomUUID(),
        what: what?.trim() || item.entry.next_action,
      }
      const gen = generation.current
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
          keyAction('committed', { v: 4, remind, rewritten: Boolean(what?.trim()) })
          if (sb && user) void saveRemoteCommitment(sb, user.id, saved).catch(logError)
          if (generation.current !== gen) return // she left this discussion meanwhile
          setItem(index, { state: 'committed' })
          void persistSession()
        })
        .catch((e) => generation.current === gen && fail(e))
    },
    [opts, setItem, sb, user, fail, persistSession],
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

  const openDiscussion = useCallback(
    (id: string) => {
      if (convo.current?.localId !== id) {
        const d = discussions.find((x) => x.id === id)
        if (!d) return
        nextGeneration()
        convo.current = {
          localId: d.id,
          sessionId: null,
          roster: d.roster,
          advisers: d.advisers,
          intake: d.intake,
          items: settleItems(d.items),
          streaming: false,
          failure: null,
          ended: d.ended,
          tier: null,
          startedAt: d.created_at,
          past: true,
        }
        setConversation(convo.current)
      }
      go('conversation')
    },
    [discussions, go],
  )

  // Continue: a new gateway session seeded with this discussion's record; the app goes on
  // writing to the same discussion, so the list keeps one entry and the journal its id.
  const continueDiscussion = useCallback(() => {
    const c = convo.current
    if (!c?.past) return
    const gen = nextGeneration()
    const earlier = c.items.length
    update({ past: false, earlier, sessionId: null, ended: false, failure: null, streaming: true })
    keyAction('convened', { personas: c.advisers.length, roster: c.roster, v: 4, resumed: true })
    void consume(
      startCouncil(
        {
          roster: c.roster,
          advisers: c.advisers,
          ...(c.intake ? { intake: c.intake } : {}),
          resume: { started: c.startedAt.slice(0, 10), items: resumeItems(c.items) },
        },
        opts(),
      ),
    ).then(() => {
      // Refused before a session began (sign in, quota, cap): back to the record, the
      // reason on screen, and Continue there to try again.
      const now = convo.current
      if (generation.current !== gen || !now || now.sessionId) return
      update({ past: true, earlier: undefined, items: now.items.slice(0, earlier), streaming: false })
    })
  }, [update, consume, opts])

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
        discussions,
        openDiscussion,
        continueDiscussion,
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
