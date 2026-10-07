# AGENTS.md — Mastermind Council

The build/test/release contract for this repo. An agent (or the overnight ralph loop) should be
able to read only this file and ship correctly. Keep every command copy-pasteable and current.
Taste rules that apply to every flywheel product live in the hub: `flywheel/docs/standards/taste.md`.

> One-liner: Bring an idea; seven historical thinkers debate it among themselves and return a
> verdict with one next action.
> Stack/template: Vite + React 19 + TS + Tailwind 4 (web-static) · Track: commercial
> Portfolio record: `flywheel/data/products/council.json`
> Product spec (binding): `flywheel/docs/expansion/council-build.md`

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
Stub controls: `POST /__reset` clears the one anonymous allowance; an idea containing `QUOTA`
returns 429, one containing `CAP` returns 503.

Perf/size asks name a number (bundle kB, p95 ms, suite seconds), re-measure each round, stop at
target. Multi-finding reviews use the clean-room split (flywheel `skills/flywheel/references/sweep.md`).

## Run / verify a change in the real app
```bash
npm run stub         # terminal 1 — the fake gateway on :8787
VITE_GATEWAY_URL=http://localhost:8787 npm run dev   # terminal 2 — http://localhost:5173
```
Primary journeys: home → type an idea → convene → turns stream in → verdict card → reply box;
today's question → convene → share the split; My ideas → reopen a past council.
Phone first: check at 390 px. The fold gate (`e2e/fold.spec.ts`) asserts the idea field sits in
the top 120 px, no x-overflow at 320/375/430, and 44 px nav targets.

## Environment
| Var | What breaks without it |
|---|---|
| `VITE_GATEWAY_URL` | no council — every convene fails with the gateway message |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` | sign-in and cloud history off; app still works anonymously with localStorage |

The client never holds an Anthropic key. All model work happens in the gateway Worker
(`flywheel/gateway/`, `llm.dravec.org`).

## Release (the finish line — produces a storefront link)
- **Web** → Cloudflare Pages → `https://council.dravec.org`. Deploy is the Pages Git integration
  on `main` (hub workflow *Connect Pages*, `gh workflow run connect-pages.yml -f slug=council`).
  Nothing in this repo deploys.
- Supabase: `council_ideas` table + RLS — SQL in `docs/SUPABASE.md`, applied by the integrator.
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
