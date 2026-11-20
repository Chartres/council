# Council: session summary

One page, rewritten at every hand-back (AGENTS.md, "Working with the orchestrator"). Last rewrite: 2026-11-20.

## What the product is now
Mastermind Council at https://council.dravec.org, in private beta behind a password.
- You bring an idea, pick up to four historical advisers (Business or Classics), and they discuss it.
- The result is a proposal, then a journal entry and a dated commitment with an optional reminder email.
- The Discussions sheet lists every past discussion and can continue one.
- Voice in (on `voice/thread-and-candle`, not merged): "Tap and talk" opens the mic inside the tap. A thin line (the thread) moves with the real input level, the candle's flame flickers with the voice, and one sentence says what the mic is doing. A recording ends on Finish, not on a pause. The words are set in the field as they are written down, and nothing is sent until you press the screen's own button.
- Words come from the browser's recogniser on desktop Chrome and Edge, and from Whisper through the gateway everywhere else, in parts joined in order.
- Voice out: the gateway's adviser voices, with the browser voice as fallback. In Talk the room and you take turns: record, text, correct, send; Cut in stops an adviser.
- 20 public reading pages of verified classical quotes (`/on/`, `/advisers/`, `/how-it-works/`).
- Model work happens in the gateway (`flywheel/gateway`), not here.
- The look: every screen set as a book page under the printer's device (Night edition, merged as #38). What's new is 1.2.0 on main and 1.3.0 on the voice branch.

## Pavol's rules in force
- 2026-11-20: recording shows the thread and the candle; the flame flickers, it does not grow. No waiting for silence. His words are text he can correct before anything is sent. Logged in `docs/SIGNATURE.md`.
- 2026-11-17: look option 2, Night edition: "Option 2 is good, with a bit more graphics, i love the logo."
- 2026-11-07: follow the orchestrator's packages unless a step is risky (the list is in AGENTS.md).
- 2026-11-07: long-lived session, with this file rewritten at every hand-back.
- 2026-11-01: the directory submission policy in `docs/distribution/directory-entries.md` is confirmed. Nothing has been submitted.
- 2026-11-01: the legacy password MCP path is removed in the same change that ends the beta password.
- 2026-10-28: a signature move is built only after his pick. Decisions are logged in `docs/SIGNATURE.md`.

## Last three packages
1. **8 Nov, voice bar and Talk fixes.** A player bar for Talk (#36), each Talk turn timed (#35), Talk starts with the goal and the signed-in skip the beta door (#37). Ended: merged.
2. **17–18 Nov, Night edition.** Every screen as a book page, the device as the mark, the catalogue note, a 404 page, What's new 1.2.0. Ended: merged as #38.
3. **20 Nov, voice: the thread, the candle, and no waiting for silence** (orchestrator package, from Pavol's words that day).
   - One capture path for the quick idea, the intake, the reply box, feedback and Talk (`src/domain/capture.ts`, `src/components/Capture.tsx`).
   - Removed: the silence endpoint, the idle cancel, the intake's auto-advance and read-aloud questions, Talk's auto-send and its countdown, cutting in by speaking over an adviser (the Cut in button stays).
   - Controls are labelled buttons; the voice bar's icons carry words.
   - Ended: PR open on `voice/thread-and-candle`, not merged. Shots in `docs/review/2026-11-20-voice/`. No real microphone was used in any test; Pavol's own try on the preview is the check that counts.

## Open threads
- The voice PR waits for a separate review and for Pavol's try with a real microphone on a Mac and an iPhone.
- Not verified on a device: Safari's level meter after the tap, the earpiece/speaker switch on iPhone when the mic opens, Chrome's recogniser beside an open mic stream, and how Whisper handles a part cut at a 1.5 s breath.
- `mic_failed` with `reason: heard_nothing` fires after 3 s without sound, so a long think before the first word logs one too. Read it with that in mind.
- A Talk turn is now two taps (Finish, Send). If that is one too many, "Finish and send" as a second button is the smaller change.
- The intake has one "Tap and talk", at the goal; later fields are reached with Next question, not with a button of their own.
- Pavol closes Eyal's two feedback items with `scripts/feedback.mjs` (in flywheel).
- Not measured yet: voice latency and transcription accuracy. Both need SQL or gateway logs, which wait for Pavol.
- Voice bar step 2, proper next-question and back-to-question-N commands in the gateway, needs a gateway deploy from the mini.
- Directory listings wait until a stranger can sign in to MCP without the beta password. The Official MCP Registry also waits for the dravec.org TXT record. A terms page is needed before any ChatGPT listing.
- Night edition follow-ups (not built): the council map keeps Inter-era wrap widths; `ink-500` measures 2.6:1 where DESIGN.md claimed 2.9:1; the reminder letter (gateway) is not restyled.
- Proposals not picked yet: topic pages trimmed to one claim; syncing the evening hour across devices; one shared persona roster; CIMD support in the gateway (for Smithery).

## What's next
The reviewer reads the voice PR. Pavol tries the preview (`https://voice-thread-and-candle.council-4rs.pages.dev`) with a real microphone, then merge or changes.
