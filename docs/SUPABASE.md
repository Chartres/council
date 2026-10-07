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
