# Funnel — what each step sends

Events go to the shared `events` table in flywheel-core through `src/platform/flywheel-client.ts`.
The insert policy accepts only the shared taxonomy, so every step below uses a taxonomy name.
`src/analytics.contract.test.ts` fails CI if code tracks anything else. The KPI puller
(`flywheel/scripts/pull-kpis.mjs`) reads them through `kpi_event_map` in
`flywheel/data/products/council.json`.

| Step | Event | Props | Fires when |
|---|---|---|---|
| Visit | `page_view` | `view` | Each screen is shown (`App.tsx`) |
| Start a council | `key_action` | `action: "convened"`, roster, advisers, `v` | `/start` (v4) or `/session` (v3, `/quick`) is sent |
| Reply | `key_action` | `action: "replied"`, `voice` | A typed or spoken turn is sent |
| Talk mode on | `key_action` | `action: "talk_on"` | The Talk control is switched on |
| Today's question | `key_action` | `action: "daily_opened"`, `day` | The day's question is opened as a council |
| Test it | `key_action` | `action: "tested"` | "Test it" on a proposal no one has argued against |
| Evening examination | `key_action` | `action: "examined"`, `outcome` | An outcome is tapped in Tonight's examination |
| Hit a gate | `key_action` | `action: "blocked"`, `reason` | sign_in, quota, turns, captures, cap, password, gateway |
| **Activation** | `conversion` | roster, `v` | A proposal is accepted into the journal (v4); a verdict arrives (v3) |
| Capture in own words | `key_action` | `action: "captured"` | Free-text capture returns an entry |
| Commit | `key_action` | `action: "committed"`, `remind`, `rewritten` | A commitment with a due date is saved (`rewritten`: she kept only the part in her power) |
| Sign-up started | `signup_started` | — | The email is submitted |
| Sign-up completed | `signup_completed` | `method` | The person arrives signed in (first `SIGNED_IN` per user per browser) |

Before 2026-10-27 the start/reply/blocked steps were sent as `council_*` names and dropped by
the insert policy, and `signup_completed` fired when the email was sent. Earlier "sign-ups"
counts are emails requested, not accounts.

Not seen by these events: councils run through the MCP endpoint (the gateway logs them as
`user: mcp:*` or an OAuth user id) and the commitment reminder emails (gateway cron).
