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

## Type, contrast, accent, space (bold by scale, v4.2)

Bold comes from scale, weight and contrast, not from more colour. Utilities in `src/index.css`.

| Step | Class | Face | Size / leading | Use |
|---|---|---|---|---|
| Display | `.t-display` | EB Garamond 500 | 28/32 (36/40 from 768 px) | the question, the decision, the verdict, the floor question |
| Title | `.t-title` | EB Garamond 500 | 20/26 | adviser names, screen titles, journal decisions |
| Body | `.t-body` | Inter 400 | 17/26 | adviser lines, answers, inputs |
| Label | `.t-label` | Inter 500, caps, 0.06em | 13/18 | section labels, metadata |

A 15 px secondary size is allowed for chips, text buttons, the facilitator line and proposal
metadata. Nothing under 13 px.

- **Contrast floor:** marble-400 (5.9:1 on ink-950) is the dimmest text colour, labels included.
  marble-500 draws rules and the monogram ring only, never text. A control edge that must be seen
  uses `ink-500` (≈ 2.9:1).
- **No borders on fields.** A field is `.field`: a filled ink-850 surface, no border; focus is a
  2 px candle rule along its foot.
- **Accent budget: two touches per screen, both large.** The one action (`.slab`, filled
  candle-400) and the one live line (the floor question with its 3 px bar, or the field being
  dictated into). Names, text buttons (`.text-btn`), links (`.link`), the wordmark and the nav are
  marble. The proposal card's 7 % candle tint is the surface that carries the candle, not a third
  touch. A disabled action is `.slab-off`: an ink-500 outline with marble-300 text.
- **Three gaps:** 8 px within an item, 24 between items, 48 between sections.
- **Three chips:** the conversation shows "I disagree", "Make this concrete" and "Wrap up" as
  `.chip`s (filled ink-850, no border, 40 px) in one scrolling row, plus "More ›" for the rest.

## Rules this product adds

- **Monograms, never portraits.** A persona is initials in a ring on a filled disc (`Monogram.tsx`;
  44 px, 64 px on the start screen; lit = 2 px candle ring). No
  generated faces, no likenesses — a legal guardrail first and a taste choice second.
- **One accent per screen (v4.1).** The candle colour fills the single primary action; every
  secondary action is a text button. No textures, no glows, no boxed panels where a hairline
  rule and a line of text do the job. A disabled primary action is an outline, not a dimmed
  amber slab (amber at 40 % opacity reads as mud on warm black).
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
- **Which council sat, never which model.** One quiet marble-400 line under the verdict:
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
