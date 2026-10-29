import type { SupabaseClient } from '@supabase/supabase-js'
import type { RosterId } from '@/content/personas'
import type { Intake, Item, JournalEntry } from './mastermind'

// Past discussions (Eyal, 29 Oct: "I can only see the first one"). Signed in, they are the
// `council_sessions` rows the app already writes; anonymous, the newest few live in this
// browser. A discussion can be read again, and continued: the gateway starts a new session
// seeded with its record (`resume` on /v1/council/start), and the app keeps writing to the
// same discussion.

export type SavedDiscussion = {
  id: string
  roster: RosterId
  advisers: string[]
  intake: Intake | null
  items: Item[]
  created_at: string
  ended: boolean
}

export const DISCUSSIONS_STORAGE = 'council:discussions'
/** Anonymous: how many discussions this browser keeps (localStorage is a few MB). */
export const MAX_LOCAL = 20
/** Signed in: how many the list loads. ponytail: paginate when someone has more. */
export const MAX_REMOTE = 30

/** Replace by id (keeping when it began) and move it to the top. */
export function upsertDiscussion(list: SavedDiscussion[], d: SavedDiscussion): SavedDiscussion[] {
  const old = list.find((x) => x.id === d.id)
  return [{ ...d, created_at: old?.created_at ?? d.created_at }, ...list.filter((x) => x.id !== d.id)]
}

export function loadLocalDiscussions(storage: Storage = localStorage): SavedDiscussion[] {
  try {
    const parsed = JSON.parse(storage.getItem(DISCUSSIONS_STORAGE) ?? '[]') as unknown
    return Array.isArray(parsed) ? (parsed as SavedDiscussion[]).filter((d) => d && typeof d.id === 'string') : []
  } catch {
    return []
  }
}

export function saveLocalDiscussion(d: SavedDiscussion, storage: Storage = localStorage): SavedDiscussion[] {
  const next = upsertDiscussion(loadLocalDiscussions(storage), d).slice(0, MAX_LOCAL)
  try {
    storage.setItem(DISCUSSIONS_STORAGE, JSON.stringify(next))
  } catch {
    // Private mode / quota: the list still works for this visit.
  }
  return next
}

export async function loadRemoteDiscussions(sb: SupabaseClient, userId: string): Promise<SavedDiscussion[]> {
  const res = await sb
    .from('council_sessions')
    .select('id, roster, advisers, intake, transcript, created_at, ended_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_REMOTE)
  if (res.error) throw res.error
  return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    roster: r.roster as RosterId,
    advisers: (r.advisers as string[]) ?? [],
    intake: (r.intake as Intake | null) ?? null,
    items: Array.isArray(r.transcript) ? (r.transcript as Item[]) : [],
    created_at: String(r.created_at),
    ended: Boolean(r.ended_at),
  }))
}

/** The question, else her first words, else a plain label. */
export function titleOf(d: SavedDiscussion): string {
  const goal = d.intake?.goal?.trim()
  if (goal) return goal
  const first = d.items.find((it) => it.kind === 'user')
  return first?.kind === 'user' ? first.text : 'Open question'
}

/** The newest decision she accepted in this discussion. */
export function decisionOf(d: SavedDiscussion, entries: JournalEntry[]): string | null {
  const mine = entries.filter((e) => e.session_id === d.id && e.status !== 'proposal')
  return mine[0]?.decision ?? null
}

const MAX_ITEMS = 80
const MAX_TEXT = 2000

/** The record the gateway continues from: who said what, the last 80 lines. */
export function resumeItems(items: Item[]): { who: string; text: string }[] {
  const out: { who: string; text: string }[] = []
  for (const it of items) {
    const line =
      it.kind === 'user'
        ? { who: 'you', text: it.text }
        : it.kind === 'contribution'
          ? { who: it.speaker, text: it.text }
          : it.kind === 'facilitator'
            ? { who: 'facilitator', text: it.text }
            : it.kind === 'floor'
              ? { who: 'floor', text: it.question }
              : {
                  who: 'facilitator',
                  text: `${it.state === 'accepted' || it.state === 'committed' ? 'Decision accepted' : it.state === 'declined' ? 'Proposal declined' : 'Proposal'}: ${it.entry.decision}. Next action: ${it.entry.next_action}`,
                }
    const text = line.text.trim().slice(0, MAX_TEXT)
    if (text) out.push({ who: line.who, text })
  }
  return out.slice(-MAX_ITEMS)
}
