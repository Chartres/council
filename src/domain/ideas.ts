import type { SupabaseClient } from '@supabase/supabase-js'
import type { Turn, Verdict } from './council'

// "My ideas" — signed in, rows live in Supabase `council_ideas` (own-row RLS, SQL in
// docs/SUPABASE.md). Anonymous, they live in this browser only.

export interface SavedIdea {
  id: string
  idea: string
  transcript: Turn[]
  verdict: Verdict | null
  created_at: string
  /** The daily question this came from, if any — makes the share card re-openable. */
  daily_key?: string | null
}

const KEY = 'council:ideas'
const LIMIT = 50 // ponytail: a flat capped list; paginate if someone ever hits 50.

export function loadLocal(storage: Storage = localStorage): SavedIdea[] {
  try {
    const raw = storage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as SavedIdea[]) : []
  } catch {
    return []
  }
}

/** Newest first, de-duplicated by id, capped. Pure — the storage write is the caller's. */
export function mergeIdea(existing: SavedIdea[], idea: SavedIdea): SavedIdea[] {
  return [idea, ...existing.filter((i) => i.id !== idea.id)].slice(0, LIMIT)
}

export function saveLocal(idea: SavedIdea, storage: Storage = localStorage): SavedIdea[] {
  const next = mergeIdea(loadLocal(storage), idea)
  try {
    storage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode / quota — history is a convenience, never a blocker.
  }
  return next
}

export async function loadRemote(
  supabase: SupabaseClient,
  userId: string,
): Promise<SavedIdea[]> {
  const { data, error } = await supabase
    .from('council_ideas')
    .select('id, idea, transcript, verdict, created_at, daily_key')
    .eq('user_id', userId)
    .eq('app', 'council')
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (error || !data) return []
  return data as SavedIdea[]
}

export async function saveRemote(
  supabase: SupabaseClient,
  userId: string,
  idea: SavedIdea,
): Promise<void> {
  await supabase.from('council_ideas').upsert({
    id: idea.id,
    user_id: userId,
    app: 'council',
    idea: idea.idea,
    transcript: idea.transcript,
    verdict: idea.verdict,
    daily_key: idea.daily_key ?? null,
    created_at: idea.created_at,
  })
}
