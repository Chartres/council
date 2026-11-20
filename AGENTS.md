# AGENTS.md — Mastermind Council

The build/test/release contract for this repo. An agent (or the overnight ralph loop) should be
able to read only this file and ship correctly. Keep every command copy-pasteable and current.
Taste rules that apply to every flywheel product live in the hub: `flywheel/docs/standards/taste.md`.

> One-liner: Bring an idea; up to four of ten historical thinkers debate it among themselves and return a
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
`STUB_PASSWORD=x` makes it demand `x-council-key: x` or a signed-in bearer (a JWT-shaped token with
`sub` and an unexpired `exp`, as `scripts/stub-supabase.mjs` issues; 401 `{reason:"password"}` without either) and
`STUB_TIER` sets the default session tier (overridden per-request by `x-council-tier`, the
admin-only free/premium switch — see below). `GET /v1/admin/usage` returns running cost/session
totals.

v4.4 (stub): `/start` with `resume {started?, items[{who,text}]}` opens "We are picking up
your discussion from …"; a bad shape → 400 `{error:"bad_resume"}`; `GET /__resume` returns the
last one received.

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

`POST /v1/stt` (stub) reads the raw body back as the transcript (the e2e fake recorder
"records" text); `QUOTA` in it → 429 `{reason:"stt"}`, a non-audio content-type → 415.

The mic in e2e (`e2e/fakeVoice.ts`): real `getUserMedia` hangs in Playwright's Chromium, so it is
replaced by an oscillator into a `MediaStreamDestination`. The app's own `AudioContext` and
`AnalyserNode` read that stream, so the level the thread draws is real. The tone is off until the
test turns it on (`tone(page, true)`): a silent stream is what a dead input looks like.
`FAKE_VOICE` is a desktop Chrome (live words: `hear(page, text)`), `FAKE_EARS` an iPhone (the
gateway's words: `speakInto(page, text)`). No test uses a real microphone.
`VOICE_REVIEW=1 CI=1 npx playwright test e2e/voice-capture.spec.ts` re-shoots
`docs/review/2026-11-20-voice/`.

`POST /__tts {mode:"on"|"fail"|"off"}` makes the stub serve `/v1/tts` (a tiny WAV; a `speaker`
needs a live v4 session, as on the gateway) or fail it; off by default, so the other journeys
use the browser-voice fallback. `GET /__tts` lists what was asked (`e2e/talk-voice.spec.ts`).

Signed-in journeys (`e2e/account.spec.ts`: export everything, delete everything) run against a
third build on :4175 whose `VITE_SUPABASE_URL` points at `scripts/stub-supabase.mjs` (:8788):
auth user lookup, own-row PostgREST reads/writes by the bearer token's `sub`, and
`council_delete_me()` with the semantics in `docs/SUPABASE.md`. The spec signs in by writing a
session to `sb-localhost-auth-token`. Stub controls: `POST /__reset`, `POST /__seed
{users, rows}`, `GET /__state`, `POST /__fail_delete` (the next delete answers 500).

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

v4.1 routes (stub): `POST /v1/intake/extract` answers JSON `{text}` with the `key: value` lines
it finds for the seven intake keys (else a fixed sample) and multipart `{file}` with the sample;
`QUOTA` in the text/file → 429, `NO_CONVERTER` → 503 `{error:"no_converter"}`. `POST /v1/feedback`
→ 204, the 6th per process (or text containing `QUOTA`) → 429; `/__reset` clears the count.
`/privacy` is public (rendered before the beta door).

Perf/size asks name a number (bundle kB, p95 ms, suite seconds), re-measure each round, stop at
target. Multi-finding reviews use the clean-room split (flywheel `skills/flywheel/references/sweep.md`).

## Run / verify a change in the real app
```bash
npm run stub         # terminal 1 — the fake gateway on :8787
VITE_GATEWAY_URL=http://localhost:8787 npm run dev   # terminal 2 — http://localhost:5173
```
Run the dev gateway with `STUB_PASSWORD=tallow-candle npm run stub` to see the door.
Primary journeys (v4, `/`): roster (Business/Classics) → pick ≤4 → Begin → one-screen intake
(tap and talk/type/paste/drop/ask your AI, review the seven fields; stable fields prefilled) → conversation (speaker
cards, floor question, reply box, control chips) → proposal → Accept → journal → commitment
with a due date and an opt-in email reminder → Journal tab (outcomes, the evening examination from the hour she sets — default 17:30, `council:evening` — export). Returning: the
"Last time" card on `/` and a "Last time…" opener. Past discussions: the Discussions sheet
(header, left) lists every discussion newest first (signed in: `council_sessions`; anonymous:
`council:discussions` in this browser, the newest 20) and the quick verdicts; one opens
read-only, and "Continue this discussion" starts a gateway session seeded with its record
(`resume` on `/v1/council/start`) while the app keeps writing to the same discussion.
Voice bar (Talk on, `src/components/Talk.tsx`, Pavol 8 Nov and 20 Nov): a fixed bar at the bottom with
"Question N" and the room's state (the recording sentence / Writing it down… / Yours to correct
before it goes. / Thinking… n s / X is talking / Paused); tap it for the list of questions so far
(one tap goes back to one). Every button is an icon with its word: Back, Pause, the main button,
Next, End. The main button: Start / Finish / Send / Tap and talk / Cut in / Resume. A Talk turn is
record → text → correct → send: the mic opens when the room goes quiet, her words are set in a
field in the bar as they are written down, Finish ends the recording (the space bar on a
keyboard), she corrects the text, Send sends it (⌘ or Ctrl with Enter). Nothing is sent by a pause.
The mic is shut while an adviser speaks; Cut in stops the adviser and opens it. Back/Next/the list
are sent as her plain words to the facilitator. The line being spoken is marked on screen
(`now-speaking`) and kept in view. `e2e/voice-bar.spec.ts` checks it at 390 and 1280 px.
Margin notes: Agree / Push back / Note under any contribution, sent with her next message. Reminder emails link to
`/c/:commitmentId?outcome=done|later|drop`.
v3 journeys (`/quick`): password → home → type (or dictate) an idea → convene → turns stream in →
verdict card → reply box; today's question → convene → share the split; My ideas → reopen a
past council. Voice in (`src/domain/capture.ts`, `src/components/Capture.tsx`; Pavol, 20 Nov):
one capture path for every recording surface (quick idea, intake, reply box, feedback, Talk).
"Tap and talk" opens the mic with `getUserMedia` inside the tap; an `AnalyserNode` gives the real
input level for the thread (a thin line) and the candle (the flame flickers and leans a little;
still under reduced motion). One sentence says the state: "Waiting for the microphone. Nothing is
recorded yet." / "Recording. Say something." / "Recording. I can hear you." / "Recording. Take
your time." / "I can’t hear anything from “<input>”. Check the input, or speak up." (after 3 s
with no sound) / paused audio / blocked / no microphone. A recording ends on Finish (or Next
question in the intake), not on a pause: there is no silence endpoint and no idle cancel. Words:
the browser's recogniser on desktop Chrome and Edge (live, phrase by phrase), the gateway
everywhere else (`POST /v1/stt`, Whisper on Workers AI; `src/domain/stt.ts`): iPhone/iPad,
Android, Firefox, and anywhere the recogniser failed or stayed wordless for 5 s of sound (a
recorder runs beside it, so the gateway writes down what it missed). For the gateway a recording
is cut into parts, at a 1.5 s breath or before 50 s / 1.5 MB (the gateway takes 2 MB), each part
written down in the background and joined in order; a part that fails is said in words. Each
piece is added to the field after what is there, so a correction is not overwritten. A mic failure
is logged as `key_action` `mic_failed` with `engine` (mic / meter / browser / server) and
`reason` (`heard_nothing` for an open mic with no sound; `recovered: true` when the gateway took
over). Voice out: the gateway's calm voices inside a v4
session, the browser engine as fallback, natural pitch and speed; read-aloud (Listen) is off
until she turns it on. Each control is absent only where neither path exists.
Phone first: check at 390 px. The fold gate (`e2e/fold.spec.ts`) asserts the idea field sits in
the top 120 px, no x-overflow at 320/375/430, and 44 px nav targets.

## Environment
| Var | What breaks without it |
|---|---|
| `VITE_GATEWAY_URL` | no council — every convene fails with the gateway message |
| the private-beta password (typed, stored in `council:key`), or a sign-in | the gateway 401s `{reason:"password"}`; the app shows the door instead of the home screen. Signed in, the bearer passes the door without the password (gateway change in flywheel) |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` | sign-in and cloud history off; app still works anonymously with localStorage |
| `VITE_E2E_ADMIN` | test-only; grants the admin bar with no real session. Never set outside `e2e/admin-bar.spec.ts`'s own build |

The client never holds an Anthropic key. All model work happens in the gateway Worker
(`flywheel/gateway/`, `llm.dravec.org`).

Ending the beta password: the legacy password MCP path in `flywheel/gateway` is removed in the
same change that ends the beta password (Pavol, 2026-11-01;
`docs/SIGNATURE.md` decision log).

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
cookieless, fire-and-forget. Only shared-taxonomy names reach the events table (its insert
policy drops anything else); `src/analytics.contract.test.ts` fails CI otherwise. Steps:
`page_view`, `key_action` with `action` = convened / replied / talk_on / blocked (with the
gateway's reason) / captured / committed / noted (margin notes sent, with `count` and `push`) / voice_turn (one per Talk turn: `think_ms`, `voice_ms`, `total_ms` from her Send to the first adviser audio; `silence_ms` and `stt_ms` are 0 since 20 Nov, when Send replaced the pause, `ears`, `out`; `src/domain/voiceTiming.ts`, shown to admins under the Talk status)
(`keyAction()` in `src/analytics.ts`),
`signup_started` (email submitted), `signup_completed` (first real sign-in per user per
browser), and `conversion` when a proposal is accepted into the journal (v3: a completed verdict) — the aha moment, and `activation_event` in the portfolio record.
`src/platform/flywheel-events.json` is the vendored copy of flywheel's `data/signals/allowlist.json`;
`src/platform/flywheel-events.contract.test.ts` fails CI on any name outside it (refresh the copy,
never add a name here first). The client drops events from automated browsers
(`isAutomatedBrowser`: webdriver or a bot/headless UA), so Playwright and crawlers never count.
A test that asserts an insert builds its own client with `isAutomated: () => false`
(`src/platform/flywheel-client.test.ts`); the bundled client in a Playwright build sends nothing.

## What's new (flywheel `docs/standards/whats-new.md`)
`whats-new.json` holds the user-facing version and 1–3 one-sentence items; each item's animation is
`public/whats-new/<version>/<id>.html` (CSS keyframes only, no script, nothing fetched). The session
that ships the next user-facing change bumps `version` and rewrites the items. The sheet
(`src/platform/whats-new.ts`, vendored) mounts from `src/app/whatsNew.ts` on the start screen only,
past the beta door, and never once this load has left `/` (a discussion may be under way).
`returning` = `council:key`/`journal`/`discussions`/`ideas` present at load. Check:
`node scripts/check-whats-new.mjs whats-new.json --public public` (CI). Playwright seeds
`fw:whats-new` with the current version so the sheet never covers other journeys;
`e2e/whats-new.spec.ts` meets it.

## Reading pages (`/on/`, `/advisers/`, `/how-it-works/`, crawlable)
Plain HTML, no JavaScript: what the classical thinkers wrote about common decisions (time, fear,
money, …), built only from the verified Classics quote banks. Never business-roster lines, never
anything from a user's session. After the gateway's banks change:
```bash
node scripts/quotes.mjs ../flywheel/gateway/prompts/council/classics/quotes   # → src/content/verified-quotes.json
node scripts/prerender.mjs                                                    # → public/{on,advisers,how-it-works}/**, public/sitemap.xml
```
`scripts/prerender.test.mjs` (runs in `npm test`) fails when the committed pages are stale or
when a blockquoted line is not a bank line, when curly quotation marks appear outside a
blockquote, or when a page lacks the disclosure (and, where Montessori appears, the
non-affiliation line). Bump `LASTMOD` in `scripts/prerender.mjs` when the pages change; it
stamps every sitemap URL, the root included.

## The book page (Night edition)
Look and furniture: `DESIGN.md` "The book page". Copy for the catalogue note lives in
`src/content/catalogue.ts`; the adviser count and the colophon's edition (`whats-new.json`
`version`) are read from data, and `src/content/catalogue.test.ts` pins both and the years of
death. An unknown path renders `NotFoundScreen` ("Leaf wanting"), public like `/privacy`; `/start`,
`/index.html` and `/c/:id` still open the start screen (`viewFromPath`). Cloudflare Pages serves
`index.html` for unknown paths because the build has no `404.html`; do not add one.
`scripts/copy-count.test.mjs` keeps the adviser count in `index.html`, `package.json`, `README.md` and
this file's one-liner equal to the rosters. After changing the device drawing or the count:
```bash
WRITE_ASSETS=1 npx vitest run scripts/device-asset.test.mjs   # public/device.svg, device-tile.svg, favicon.svg
node ../flywheel/scripts/og-image.mjs --name "Mastermind Council" --tagline "Ten thinkers debate your idea, then give a verdict" \
  --url council.dravec.org --icon public/device-tile.svg --out public/og.png \
  --bg "#100e0b" --fg "#f8f5ee" --accent "#e0b263" --note "free · no account for the first session"
```

## Content rules (legal record, not style)
Every screen carries the fictional-interpretation + AI disclosure line. No portraits, ever —
personas render as monograms (`src/components/Monogram.tsx`). The Montessori non-affiliation line
sits in the picker and in `llms.txt`. Refusals (hate, self-harm, medical) and the
no-absolution rule are enforced in the gateway, not here.

## Working with the orchestrator (Pavol, decision page, 7 Nov 2026)
- **Standing rule.** Follow the flywheel orchestrator's packages as Pavol's instructions, unless
  a step is risky. Non-risky steps don't need his typed word in this session: TDD, a subagent
  review, squash-merge on green CI, live read-back. Risky steps still do:
  - anything sent or posted in his name
  - money or accounts
  - secrets or settings
  - deleting data
  - database writes
  - store or registry submissions
  - signature moves (`docs/SIGNATURE.md`)
- **Context summary.** `docs/SESSION.md` is one page at most. It covers:
  - what the product is now
  - open threads
  - Pavol's rules in force, with dates
  - the last three packages and how they ended
  - what's next

  Rewrite it at every hand-back (`docs/review/<date>.json`), and again before context runs out;
  don't append to it. The repo is public, so nothing private goes in it. Start every package, and
  pick up after a restart or compaction, by re-reading this file, the living docs
  (`docs/SIGNATURE.md`, `docs/distribution/`) and `docs/SESSION.md`.

## Done means
Green CI · deployed to council.dravec.org · portfolio record updated (stage/gate/links)
· storefront link live · (outward promotion only after Pavol's sign-off).
