# Council: session summary

One page, rewritten at every hand-back (AGENTS.md, "Working with the orchestrator"). Last rewrite: 2026-11-21.

## What the product is now
Mastermind Council at https://council.dravec.org, in private beta behind a password.
- You bring an idea, pick up to four historical advisers (Business or Classics), and they discuss it.
- The result is a proposal, then a journal entry and a dated commitment with an optional reminder email.
- The Discussions sheet lists every past discussion and can continue one.
- Voice in (merged as #40): one capture path; the thread and the painted candle; a recording ends on Finish; words from the browser's recogniser on desktop Chrome and Edge, from Whisper through the gateway elsewhere.
- The conversation (on `feat/the-floor`, not merged): one bar at the bottom, "the floor", with the animated candle, one status line and one main button. His words are a dashed message in the conversation; a tap corrects them. Read aloud (was "Talk") reads each answer sentence by sentence, marked, with dots. Swipe a message right, or tap Reply, to answer one adviser. Painted buttons.
- 20 public reading pages of verified classical quotes (`/on/`, `/advisers/`, `/how-it-works/`).
- Model work happens in the gateway (`flywheel/gateway`), not here. The gateway now picks a voice turn's speaker (flywheel PR #217).
- What's new is 1.4.0 on the floor branch.

## Pavol's rules in force
- 2026-11-20 (late): buttons option i ("Ink outline", Painted volume); flow option A ("The floor"); the candle animated in the bar; messaging-like, with replies to one adviser ("don't take my word for it" on the swipe). Everything less straight, in the painted style. Seeing and correcting the text stays essential.
- 2026-11-20: the thread and the painted candle (Therbusch, about 1755, CC0); the flame moves like a breath, no halo. No waiting for silence. The mic works again after leaving the page.
- 2026-11-17: look option 2, Night edition.
- 2026-11-07: follow the orchestrator's packages unless a step is risky (the list is in AGENTS.md); this file rewritten at every hand-back.
- 2026-11-01: directory policy confirmed, nothing submitted; the legacy password MCP path goes with the beta password.
- 2026-10-28: a signature move is built only after his pick (`docs/SIGNATURE.md`).

## Last three packages
1. **17–18 Nov, Night edition.** Merged as #38.
2. **20 Nov, voice: the thread, the candle, and no waiting for silence.** Merged as #40.
3. **21 Nov, the floor** (orchestrator package from Pavol's picks and his session's bugs). One bar replaces the reply box and the voice bar; painted buttons; reading along with dots; answering one adviser; fixes: one speaker per turn picked by the gateway (#217 in flywheel), read text equals shown text in one voice per message, no audio unlock in the mic's tap on Android plus one automatic reopen after a mute, `stt_ms` measured and the writing-down status counted. Ended: PR open, not merged. Shots in `docs/review/2026-11-21-floor/`.

## Open threads
- Not verified on a phone: the swipe against iOS Safari's and Android's back gestures (it starts 28 px from the left edge and needs sideways movement), the Android mute cause (a suspicion from the code and the log), whether Android plays the first adviser line without the tap's unlock.
- The opening question is still its own screen (the intake); making it the conversation's first turn needs a new start protocol in the gateway.
- Replies to one adviser go at once; Agree and Push back marks wait for the next message. Push back no longer takes words of its own (Answer does that).
- Read aloud is the one read-aloud switch while a discussion is open; Listen reads only an ended one.
- The opening round (welcome and the advisers' first statements) is not read aloud, even with Read aloud on; reading starts with the first answer after his first turn (Pavol, 22 Nov 2026).
- Earlier threads still open: voice latency and accuracy not measured; voice bar step 2 (gateway next/back commands); directory listings wait for sign-in without the password; Night edition follow-ups; unpicked proposals.

## What's next
A separate reviewer reads the council PR and flywheel #217; Pavol tries the preview on his phone, then merge or changes.
