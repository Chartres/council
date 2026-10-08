# AGENTS.md — Mastermind Council

The build/test/release contract for this repo. An agent (or the overnight ralph loop) should be
able to read only this file and ship correctly. Keep every command copy-pasteable and current.
Taste rules that apply to every flywheel product live in the hub: `flywheel/docs/standards/taste.md`.

> One-liner: Bring an idea; seven historical thinkers debate it among themselves and return a
> verdict with one next action.
> Stack/template: Vite + React 19 + TS + Tailwind 4 (web-static) · Track: commercial
> Portfolio record: `flywheel/data/products/council.json`
> Product spec (binding): `flywheel/docs/expansion/council-v4.md` (v4, the main flow at `/`);
> `flywheel/docs/expansion/council-build.md` (v3 quick verdict, kept at `/quick`)

## Build
```bash
npm ci
npm run build        # tsc -b && vite build
```

## Test (TDD required; persona-journey test per primary journey)
```bash
npm run typecheck    # tsc -b --noEmit
npm test             # vitest run
npm run e2e          # playwright: starts the stub gateway + a preview build, writes e2e/shots/
```
Gate: typecheck · test · build must pass (CI is `.github/workflows/ci.yml`, stamped from
`flywheel/docs/standards/ci.template.yml`). E2E runs on every push too.

E2E never calls a real model: `scripts/stub-gateway.mjs` speaks the gateway contract with canned
turns, and `playwright.config.ts` builds the app with `VITE_GATEWAY_URL=http://localhost:8787`.
Stub controls: `POST /__reset` clears the one anonymous allowance and the `ROTATE` trigger below;
`GET /v1/council/key` answers 204/401 the same way every other route does; an idea containing
`QUOTA` returns 429, one containing `CAP` returns 503, one containing `ROTATE` returns 401
`{reason:"password"}` once (simulating a password rotated mid-session) then behaves normally;
`STUB_PASSWORD=x` makes it demand `x-council-key: x` (401 `{reason:"password"}` without it) and
`STUB_TIER` sets the default session tier (overridden per-request by `x-council-tier`, the
admin-only free/premium switch — see below). `GET /v1/admin/usage` returns running cost/session
totals.

v4 routes (stub, canned): `POST /v1/council/start` streams a facilitator opener ("Last
time…" when `memory` has entries/commitments, an intake recap when `intake.goal` is set,
else a welcome), two contributions and a `floor` question; `/turn` and `/control` stream
2–3 contributions + floor, and the session's 3rd turn (start counts) also streams a
`proposal`; `/control` understands `pause`, `back_to:<id>`, `let:<a>,<b>`, `disagree`,
`concrete`, `test`, `wrap_up`; `/capture` returns `{entry}`; `/commit` echoes
`{commitment}` keeping the client's id; `GET /journal` returns what this process captured
(signed-in only). `/start` shares the one anonymous allowance with v3's `/session`. Event
shapes are documented at the top of `src/domain/mastermind.ts` — the gateway codes to the
same list. Playwright runs with the password on and seeds `council:key` through `storageState`, so
every journey goes through the real header path; `e2e/gate.spec.ts` clears it to meet the door.

### Admin bar (cost + tier switch)
Visible only to the emails in `ADMIN_EMAILS` (`src/domain/admin.ts`): a 44 px bar under the
header with today/week/month LLM cost and session counts (`GET /v1/admin/usage`, refreshed on
mount and after each session's `done`) and a free/premium toggle (`council:tier` in
localStorage, sent as `x-council-tier` on `/v1/council/session` and `/reply` — admins only, a
non-admin session never sends this header). The `session` SSE event's `tier`/`model` are shown
next to the toggle once a session starts.

`VITE_E2E_ADMIN=1` is a build-time escape hatch (`isAdmin` in `src/domain/admin.ts`) so Playwright
can reach the bar without a real Supabase session. **Never set it in the Cloudflare Pages build
env** — it is simply absent there, which is what makes it a no-op in production.
`playwright.config.ts` builds a *second*, separate preview (`dist-e2e-admin/`, port 4174) with
this var baked in, so the plain build at :4173 — and every other spec — never carries it;
`e2e/admin-bar.spec.ts` is the only file that points at :4174.

Perf/size asks name a number (bundle kB, p95 ms, suite seconds), re-measure each round, stop at
target. Multi-finding reviews use the clean-room split (flywheel `skills/flywheel/references/sweep.md`).

## Run / verify a change in the real app
```bash
npm run stub         # terminal 1 — the fake gateway on :8787
VITE_GATEWAY_URL=http://localhost:8787 npm run dev   # terminal 2 — http://localhost:5173
```
Run the dev gateway with `STUB_PASSWORD=tallow-candle npm run stub` to see the door.
Primary journeys (v4, `/`): roster (Business/Classics) → pick ≤4 → Begin → 7-step intake
(skippable, mic per step, "same context?" when a last intake exists) → conversation (speaker
cards, floor question, reply box, control chips) → proposal → Accept → journal → commitment
with a due date and an opt-in email reminder → Journal tab (outcomes, export). Returning: the
"Last time" card on `/` and a "Last time…" opener. Reminder emails link to
`/c/:commitmentId?outcome=done|later|drop`.
v3 journeys (`/quick`): password → home → type (or dictate) an idea → convene → turns stream in →
verdict card → reply box; today's question → convene → share the split; My ideas → reopen a
past council. Voice is browser-only (Web Speech API in, `speechSynthesis` out): no server,
no cost, and both controls are absent where the API is missing.
Phone first: check at 390 px. The fold gate (`e2e/fold.spec.ts`) asserts the idea field sits in
the top 120 px, no x-overflow at 320/375/430, and 44 px nav targets.

## Environment
| Var | What breaks without it |
|---|---|
| `VITE_GATEWAY_URL` | no council — every convene fails with the gateway message |
| the private-beta password (typed, stored in `council:key`) | the gateway 401s `{reason:"password"}`; the app shows the door instead of the home screen |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` | sign-in and cloud history off; app still works anonymously with localStorage |
| `VITE_E2E_ADMIN` | test-only; grants the admin bar with no real session. Never set outside `e2e/admin-bar.spec.ts`'s own build |

The client never holds an Anthropic key. All model work happens in the gateway Worker
(`flywheel/gateway/`, `llm.dravec.org`).

## Release (the finish line — produces a storefront link)
- **Web** → Cloudflare Pages → `https://council.dravec.org`. Deploy is the Pages Git integration
  on `main` (hub workflow *Connect Pages*, `gh workflow run connect-pages.yml -f slug=council`).
  Nothing in this repo deploys.
- Supabase: `council_ideas` (v3) and `council_sessions` / `council_journal` /
  `council_commitments` (v4) + own-row RLS — SQL in `docs/SUPABASE.md`, applied by the
  integrator. Signed in, the app writes these rows itself (supabase-js, user JWT, client
  uuids); anonymous, the journal is `council:journal` in localStorage.
- Auth identity: Site URL / redirect allowlist must include `https://council.dravec.org`
  (`flywheel/scripts/fleet-auth-check.mjs` `required_origins`); the app passes
  `emailRedirectTo: window.location.origin`.

## Analytics (Common Platform)
Vendored client: `src/platform/flywheel-client.ts`, wrapped by `src/analytics.ts`. First-party,
cookieless, fire-and-forget. Events: `page_view`, `council_convened`, `council_replied`,
`council_blocked` (with the gateway's reason), `signup_started`/`signup_completed`, `error`, and
`conversion` on a completed verdict — the aha moment, and `activation_event` in the portfolio record.

## Content rules (legal record, not style)
Every screen carries the fictional-interpretation + AI disclosure line. No portraits, ever —
personas render as monograms (`src/components/Monogram.tsx`). The Montessori non-affiliation line
sits in the picker and in `llms.txt`. Refusals (hate, self-harm, medical) and the
no-absolution rule are enforced in the gateway, not here.

## Done means
Green CI · deployed to council.dravec.org · portfolio record updated (stage/gate/links)
· storefront link live · (outward promotion only after Pavol's sign-off).
