# DESIGN.md — Mastermind Council

Invariants for every flywheel product (contrast, focus, landmarks, 375 px, no cookie banner)
live in `flywheel/docs/standards/taste.md` and `mobile-ux.md`. This file records only what is
this product's own.

## The idea

A candle-lit study after everyone has gone home. Warm ink for the room, marble for the type, one
tallow flame of light. The console's cool gunmetal and the kviz family's brass are deliberately
not reused — a council is a place you sit down in, not an instrument panel.

## Tokens (`src/index.css`, `@theme`)

| Group | Values | Where it is used |
|---|---|---|
| `ink` 950–600 | `#100e0b` → `#4a4133` | page, panels, borders. Warm black, never neutral grey |
| `marble` 50–500 | `#f8f5ee` → `#776f61` | body text, secondary text, veining |
| `candle` 200–500 | `#f7e3b8` → `#c08f3d` | the single accent: live surfaces, primary action, verdict frame |
| `laurel` / `clay` | `#9ab896` / `#cf9179` | a vote for / against. Muted to the room's light, never traffic-light green and red |

Type: **EB Garamond** for anything a person says or a heading (the council speaks in a serif),
**Inter** for UI and body. Radius 4 px — a bound page, not a chrome card.

Contrast: body text is marble-100/200 on ink-950 (≥ 12:1); the smallest secondary text uses
marble-400 on ink-950 (≈ 6:1). `candle-400` on `ink-950` is ≈ 9:1; `ink-950` on `candle-400` (the
primary button) is the same pair inverted.

## Rules this product adds

- **Monograms, never portraits.** A persona is initials in a thin ring (`Monogram.tsx`). No
  generated faces, no likenesses — a legal guardrail first and a taste choice second.
- **One lit thing per screen.** `.lit` (the candle glow) goes on the live surface only: the
  enabled primary action and the verdict frame. A disabled primary action is an outline, not a
  dimmed amber slab — amber at 40 % opacity reads as mud on warm black.
- **The debate is the content.** Turns are plain text with a monogram and a name. No chat
  bubbles, no typing animation beyond a single 320 ms fade-up per turn (skipped under
  `prefers-reduced-motion`).
- **The picker is one row until opened.** A `<details>` whose closed state is the summary
  ("Socrates · Marcus Aurelius · Seneca — 3/4"), per the control-chrome budget in `mobile-ux.md`.
- **Fold:** the idea field, not a button, is the landing screen's first control, and it sits in
  the top 120 px at 390 px (`e2e/fold.spec.ts`). The primary button is below it, where the thumb
  lands after typing.
- **Two tabs, two jobs:** convene a council, revisit one. The session screen hides the tab bar —
  it is a place you are in, not a tab.
- **The share card carries no private text.** Date, question, vote split. Asserted in
  `e2e/council.spec.ts` by reading the clipboard.
- **The door is the whole app.** In private beta the password panel replaces the screens and
  the tab bar — an app greyed out behind a dialog is worse than no app.
- **Which council sat, never which model.** One quiet marble-500 line under the verdict:
  "Free council" or "Premium council". Model names are the gateway's business.
- **Voice is a button, not a mode.** The mic sits beside the field it fills; "Listen" sits
  beside "← New idea". Both vanish where the Web Speech API is missing — no explanation, no
  disabled control. One voice per persona, derived from the id so it never changes.

- **v4: the conversation is the content.** Facilitator lines are small italic marble; an
  adviser is monogram + name (+ a quiet confidence pill when given); the floor question is
  the one candle-coloured line. Controls are chips under the reply box, never a toolbar.
- **Proposals are cards, decisions are the user's.** Nothing reaches the journal until
  "Accept → journal"; the decision and next action are editable before that. A reminder is
  an unchecked box — opt-in per commitment, never a default.
- **"Simulation inspired by …"** sits under each non-public-domain adviser's name in the
  picker, and the Business roster carries its own disclosure line.

## Screenshots

`e2e/shots/` — `home`, `session-streaming`, `verdict`, `daily-card`, `daily-share`,
`sign-in-gate`, `password-gate`, `password-rejected`, `voice-dictation`, `voice-listening`,
`fold-phone`, and v4's `v4-start`, `v4-intake`, `v4-conversation`, `v4-commit`, `v4-journal`,
`v4-last-time`, `v4-last-time-opener`, all at 390 px, committed and meant to be looked at.
