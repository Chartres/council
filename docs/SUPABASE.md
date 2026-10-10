# Supabase setup — Mastermind Council

**Not applied by this repo.** An integrator with the project's credentials runs the SQL below
once, sets the two env vars, and fixes the auth identity. Until then the app works anonymously
with localStorage-only history (`src/domain/ideas.ts`).

Project: the shared one, `chgwirzbpspoaoposuwg` (build spec). Auth sharing on a shared project is
the documented escape hatch in `flywheel/docs/standards/auth-identity.md` — the per-brand sender
comes from the Send Email hook, not from the project's SMTP name.

## 1. Table + RLS

```sql
-- Mastermind Council — one row per council session, owned by the user who convened it.
create table if not exists public.council_ideas (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  app         text not null default 'council',
  idea        text not null,
  transcript  jsonb not null default '[]'::jsonb,
  verdict     jsonb,
  daily_key   date,
  created_at  timestamptz not null default now()
);

create index if not exists council_ideas_user_created_idx
  on public.council_ideas (user_id, created_at desc);

alter table public.council_ideas enable row level security;

-- Own-row only, all four verbs. The client never reads another user's ideas.
create policy "council_ideas_select_own" on public.council_ideas
  for select using (auth.uid() = user_id);
create policy "council_ideas_insert_own" on public.council_ideas
  for insert with check (auth.uid() = user_id);
create policy "council_ideas_update_own" on public.council_ideas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "council_ideas_delete_own" on public.council_ideas
  for delete using (auth.uid() = user_id);
```

`daily_key` is one column beyond the v1 spec's list: it marks a session that came from the shared
daily question, so "My ideas" can badge it and the share card can be rebuilt without re-deriving
the date from `created_at` (which is UTC, while the daily question is keyed to the visitor's own
calendar day).

## 1b. Council v4 — sessions, journal, commitments (+ RLS)

The app is the writer of record: it generates the row ids (uuid) and upserts under the
user's JWT. The gateway's reminder cron reads `council_commitments` with the service role
and stamps `email_sent_at`; nothing else server-side writes these tables.

```sql
create table if not exists public.council_sessions (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  roster      text not null check (roster in ('business', 'classics')),
  advisers    text[] not null,
  intake      jsonb,
  transcript  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists council_sessions_user_created_idx
  on public.council_sessions (user_id, created_at desc);

create table if not exists public.council_journal (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  session_id      uuid references public.council_sessions (id) on delete set null,
  decision        text not null,
  reasoning       text not null default '',
  assumptions     text[] not null default '{}',
  next_action     text not null default '',
  owner           text not null default '',
  review_trigger  text not null default '',
  confidence      smallint check (confidence between 0 and 100),
  status          text not null default 'accepted'
                  check (status in ('proposal', 'accepted', 'done', 'dropped')),
  created_at      timestamptz not null default now()
);
create index if not exists council_journal_user_created_idx
  on public.council_journal (user_id, created_at desc);

create table if not exists public.council_commitments (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  journal_id     uuid not null references public.council_journal (id) on delete cascade,
  what           text not null,
  due_date       date not null,
  remind         boolean not null default false,
  email_sent_at  timestamptz,
  outcome        text check (outcome in ('done', 'later', 'drop')),
  outcome_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists council_commitments_user_due_idx
  on public.council_commitments (user_id, due_date);
-- The reminder cron's query: due today, opted in, not yet emailed.
create index if not exists council_commitments_reminder_idx
  on public.council_commitments (due_date) where remind and email_sent_at is null;

alter table public.council_sessions    enable row level security;
alter table public.council_journal     enable row level security;
alter table public.council_commitments enable row level security;

-- Own-row only, all four verbs, on all three tables.
do $$
declare t text;
begin
  foreach t in array array['council_sessions', 'council_journal', 'council_commitments'] loop
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || '_delete_own', t);
  end loop;
end $$;
```

`email_sent_at` is writable by the owner under these policies; the cron's "never more than
one email" rule keys on it, so the worst a user can do is re-arm their own reminder.
`outcome = 'later'` keeps a commitment open (it is the "not yet — another round" answer).
The created_at column on commitments is one beyond the spec's list, for ordering.

## 2. Auth identity (`flywheel/docs/standards/auth-identity.md`)

- Add `https://council.dravec.org` (and `https://council.pages.dev` if used, plus
  `http://localhost:5173/**` for dev) to the project's redirect allowlist. The repo-side way:
  add the origin to `required_origins` in `flywheel/scripts/fleet-auth-check.mjs` and let the
  nightly sweep's `--fix` apply it. Supabase silently falls back to Site URL otherwise — that
  fallback is the autoškola bug.
- Add a `council` brand branch to `flywheel/scripts/sql/shared-send-email-hook.sql` and apply it,
  so the magic-link email reads as Mastermind Council and not as a sibling app.
- The app already passes `emailRedirectTo: window.location.origin` (`src/auth/AuthContext.tsx`).

## 3. Env vars

Cloudflare Pages build env (and GitHub repo secrets for CI's build step):

```
VITE_GATEWAY_URL=https://llm.dravec.org
VITE_SUPABASE_URL=https://chgwirzbpspoaoposuwg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Only the publishable key ever reaches the client. The gateway verifies the Supabase JWT itself
(`SUPABASE_JWKS_URL`); no service-role key exists in this repo or in Pages.

## Council v4.1: Export everything / Delete everything

The account menu's **Export everything** reads the user's own rows from `council_sessions`,
`council_journal`, `council_commitments` and `council_ideas` (own-row RLS above) and downloads
`council-export-<date>.json`. **Delete everything** calls `supabase.rpc('council_delete_me')`, a
`SECURITY DEFINER` function that deletes the caller's rows and their `auth.users` row (the
`on delete cascade` foreign keys cover the tables). The app then clears its localStorage
(keeping only the beta password) and reloads signed out. The function is created by the
integrator alongside the gateway v4.1 change; until it exists the app shows "Nothing was deleted".
