# Council: session summary

One page, rewritten at every hand-back (AGENTS.md, "Working with the orchestrator"). Last rewrite: 2026-11-08.

## What the product is now
Mastermind Council at https://council.dravec.org, in private beta behind a password.
- You bring an idea, pick up to four historical advisers (Business or Classics), and they discuss it.
- The result is a proposal, then a journal entry and a dated commitment with an optional reminder email.
- The Discussions sheet lists every past discussion and can continue one.
- Voice in: the browser's recogniser, or Whisper through the gateway.
- Voice out: the gateway's adviser voices, with the browser voice as fallback. Talk mode is hands-free and lets you cut in.
- 20 public reading pages of verified classical quotes (`/on/`, `/advisers/`, `/how-it-works/`).
- Model work happens in the gateway (`flywheel/gateway`), not here.
- What's new sheet at 1.0.0 (#32).

## Pavol's rules in force
- 2026-11-07: follow the orchestrator's packages unless a step is risky (the list is in AGENTS.md).
- 2026-11-07: long-lived session, with this file rewritten at every hand-back.
- 2026-11-01: the directory submission policy in `docs/distribution/directory-entries.md` is confirmed. Nothing has been submitted.
- 2026-11-01: the legacy password MCP path is removed in the same change that ends the beta password.
- 2026-10-28: a signature move is built only after his pick. Decisions are logged in `docs/SIGNATURE.md`.

## Last three packages
1. **3–4 Nov, Eyal's feedback and voice.**
   - Laptop sign-in: the app asks for the emailed code, and the beta door says it isn't the account sign-in (#29, live, checked at 390 and 1280 px).
   - Voice: a gateway line now times out after 6 s and the browser voice reads it, and the next line waits for it (#30).
   - Eyal's 29 Oct report (past discussions) had already been fixed by #25.
   - Ended: hand-back `docs/review/2026-11-03.json` (#31).
2. **7 Nov, events allow-list v4.** Vendored from flywheel 24879ea, with `exam_result_reported` live. Ended: #33 merged.
3. **7–8 Nov, orchestrator rules in AGENTS.md and this file.** The first try was blocked by the permission check; Pavol confirmed on 8 Nov. Ended: this PR.

## Open threads
- Pavol closes Eyal's two feedback items with `scripts/feedback.mjs` (in flywheel).
- Not measured yet: other open feedback, voice latency, and transcription accuracy. All need SQL or gateway logs, which wait for Pavol.
- Voice is turn-based (record, transcribe, reply, speak), not real-time speech-to-speech. A real-time mode would be a gateway-side change.
- Watch whether 6 s is too short for long spoken lines.
- Directory listings wait until a stranger can sign in to MCP without the beta password. The Official MCP Registry also waits for the dravec.org TXT record.
- A terms page is needed before any ChatGPT listing.
- Proposals not picked yet:
  - topic pages trimmed to one claim
  - syncing the evening hour across devices
  - one shared persona roster
  - CIMD support in the gateway (for Smithery)

## What's next
The next orchestrator package. Nothing else is in flight in this repo.
