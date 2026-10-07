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

## Screenshots

`e2e/shots/` — `home`, `session-streaming`, `verdict`, `daily-card`, `daily-share`,
`sign-in-gate`, `fold-phone`, all at 390 px, committed and meant to be looked at.
