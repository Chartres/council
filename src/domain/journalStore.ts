import type { SupabaseClient } from '@supabase/supabase-js'
import type { Commitment, Intake, JournalEntry, JournalState, Outcome } from './mastermind'

// Where the v4 journal lives. Signed in: Supabase `council_sessions` / `council_journal` /
// `council_commitments` under the user's JWT (own-row RLS, SQL in docs/SUPABASE.md).
// Anonymous: this browser only, one localStorage key, as v3's "My ideas" does.

export const JOURNAL_STORAGE = 'council:journal'

export interface Stored extends JournalState {
  lastIntake: Intake | null
}

const EMPTY: Stored = { entries: [], commitments: [], lastIntake: null }

export function loadLocalJournal(storage: Storage = localStorage): Stored {
  try {
    const parsed = JSON.parse(storage.getItem(JOURNAL_STORAGE) ?? 'null') as Partial<Stored> | null
    return {
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
      commitments: Array.isArray(parsed?.commitments) ? parsed.commitments : [],
      lastIntake: parsed?.lastIntake ?? null,
    }
  } catch {
    return EMPTY
  }
}

export function saveLocalJournal(value: Stored, storage: Storage = localStorage): void {
  try {
    storage.setItem(JOURNAL_STORAGE, JSON.stringify(value))
  } catch {
    // Private mode / quota — the journal still works for this visit.
  }
}

// ponytail: last 50 entries/commitments; paginate when someone has more.
export async function loadRemoteJournal(sb: SupabaseClient, userId: string): Promise<Stored> {
  const [entries, commitments, session] = await Promise.all([
    sb.from('council_journal').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    sb.from('council_commitments').select('*').eq('user_id', userId).order('due_date', { ascending: true }).limit(50),
    sb.from('council_sessions').select('intake').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
  ])
  return {
    entries: (entries.data ?? []) as JournalEntry[],
    commitments: (commitments.data ?? []) as Commitment[],
    lastIntake: (session.data?.[0]?.intake as Intake | null) ?? null,
  }
}

// supabase-js resolves with {error} instead of throwing; surface it so callers' logError sees it.
function check(res: { error: unknown }) {
  if (res.error) throw res.error
}

export async function saveRemoteSession(
  sb: SupabaseClient,
  userId: string,
  row: { id: string; roster: string; advisers: string[]; intake: Intake | null; transcript: unknown; ended_at?: string | null },
) {
  check(await sb.from('council_sessions').upsert({ ...row, user_id: userId }))
}

export async function saveRemoteEntry(sb: SupabaseClient, userId: string, entry: JournalEntry) {
  // Explicit columns: gateway extras (e.g. `date`) must not reach PostgREST.
  const { id, session_id, decision, reasoning, assumptions, next_action, owner, review_trigger, confidence, status, created_at } = entry
  check(
    await sb.from('council_journal').upsert({
      id, user_id: userId, session_id, decision, reasoning, assumptions, next_action, owner, review_trigger, confidence, status, created_at,
    }),
  )
}

export async function saveRemoteCommitment(sb: SupabaseClient, userId: string, c: Commitment) {
  const { id, journal_id, what, due_date, remind, outcome, outcome_at } = c
  check(await sb.from('council_commitments').upsert({ id, user_id: userId, journal_id, what, due_date, remind, outcome, outcome_at }))
}

/** Writes the outcome back; the entry's status follows (done / dropped / still accepted). */
export async function saveRemoteOutcome(
  sb: SupabaseClient,
  id: string,
  outcome: Outcome,
  at: string,
): Promise<void> {
  const { data } = await sb
    .from('council_commitments')
    .update({ outcome, outcome_at: at })
    .eq('id', id)
    .select('journal_id')
    .maybeSingle()
  const status = outcome === 'done' ? 'done' : outcome === 'drop' ? 'dropped' : 'accepted'
  if (data?.journal_id) await sb.from('council_journal').update({ status }).eq('id', data.journal_id)
}
