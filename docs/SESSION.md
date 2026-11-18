# Council: session summary

One page, rewritten at every hand-back (AGENTS.md, "Working with the orchestrator"). Last rewrite: 2026-11-18.

## What the product is now
Mastermind Council at https://council.dravec.org, in private beta behind a password.
- You bring an idea, pick up to four historical advisers (Business or Classics), and they discuss it.
- The result is a proposal, then a journal entry and a dated commitment with an optional reminder email.
- The Discussions sheet lists every past discussion and can continue one.
- Voice in: the browser's recogniser, or Whisper through the gateway.
- Voice out: the gateway's adviser voices, with the browser voice as fallback. Talk mode is hands-free and lets you cut in.
- 20 public reading pages of verified classical quotes (`/on/`, `/advisers/`, `/how-it-works/`).
- Model work happens in the gateway (`flywheel/gateway`), not here.
- What's new sheet at 1.1.0 on main; 1.2.0 on `design/night-edition`.
- The look on `design/night-edition`: every screen set as a book page under the printer's device (Night edition, not merged).

## Pavol's rules in force
- 2026-11-17: look option 2, Night edition: "Option 2 is good, with a bit more graphics, i love the logo." Logged in `docs/SIGNATURE.md`.
- 2026-11-07: follow the orchestrator's packages unless a step is risky (the list is in AGENTS.md).
- 2026-11-07: long-lived session, with this file rewritten at every hand-back.
- 2026-11-01: the directory submission policy in `docs/distribution/directory-entries.md` is confirmed. Nothing has been submitted.
- 2026-11-01: the legacy password MCP path is removed in the same change that ends the beta password.
- 2026-10-28: a signature move is built only after his pick. Decisions are logged in `docs/SIGNATURE.md`.

## Last three packages
1. **7–8 Nov, orchestrator rules in AGENTS.md and this file.** Ended: #34 merged.
2. **8 Nov, voice bar and Talk fixes.** A player bar for Talk (Pavol's option A, #36), each Talk turn timed (#35), Talk starts with the goal and the signed-in skip the beta door (#37). Ended: merged.
3. **17–18 Nov, Night edition** (orchestrator package; Pavol picked option 2 on 17 Nov).
   - Body, labels and buttons in EB Garamond; running head and text tabs; rubrics, versals, glosses; the roster with years of death; the colophon.
   - The device as the mark (door, colophon, 404, thinking state, favicon, share card), with a headpiece, tailpiece, manicule and blank leaf in `src/components/Furniture.tsx`.
   - The catalogue note on the boring surfaces (`src/content/catalogue.ts`); a 404 page ("Leaf wanting"); the 20 reading pages restyled; What's new 1.2.0.
   - 18 Nov: an independent design review came back "merge after fixes"; its 23 items are applied (see the PR body), three of them as orchestrator defaults listed there under "Decisions for Pavol".
   - Ended: PR open on `design/night-edition`, not merged, not deployed. After-shots in `docs/review/2026-11-17-night/`. Pavol's look is the gate.

## Open threads
- Pavol closes Eyal's two feedback items with `scripts/feedback.mjs` (in flywheel).
- Not measured yet: other open feedback, voice latency, and transcription accuracy. All need SQL or gateway logs, which wait for Pavol.
- Voice is turn-based (record, transcribe, reply, speak), not real-time speech-to-speech. A real-time mode would be a gateway-side change (Pavol asked for its price on 8 Nov).
- From 8 Nov each Talk turn logs its wait to the first word (`key_action` `voice_turn`); admins see it in the voice bar. Read the numbers once there are real turns.
- Voice bar (Pavol picked option A, 8 Nov): step 1 is client-only. Step 2, proper next-question and back-to-question-N commands in the gateway, needs a gateway deploy from the mini.
- Gateway timing logs for /v1/stt and /v1/tts: the patch was sent to the "on-mini" session on 8 Nov to land and deploy (this session can't push to flywheel).
- Watch whether 6 s is too short for long spoken lines.
- Directory listings wait until a stranger can sign in to MCP without the beta password. The Official MCP Registry also waits for the dravec.org TXT record.
- A terms page is needed before any ChatGPT listing.
- Night edition follow-ups (not built): the council map keeps Inter-era wrap widths; `ink-500` measures 2.6:1 where DESIGN.md claimed 2.9:1; the reminder letter (gateway) is not restyled.
- Proposals not picked yet:
  - topic pages trimmed to one claim
  - syncing the evening hour across devices
  - one shared persona roster
  - CIMD support in the gateway (for Smithery)

## What's next
Pavol looks at the Night edition preview and the after-shots, then merge or changes. The approval door (#39, merged 18 Nov) is styled in the same branch: device, "Privately printed", Check again as the slab.
