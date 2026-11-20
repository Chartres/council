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

Type: **EB Garamond** for the whole page: body, labels, buttons, headings (Night edition,
17 Nov 2026). **Inter** only where 13 px demands it: the legal and disclosure line (`.t-fine`),
the admin bar, and the AI prompt a user copies out. Radius 4 px — a bound page, not a chrome card.

## Type, contrast, accent, space (bold by scale, v4.2)

Bold comes from scale, weight and contrast, not from more colour. Utilities in `src/index.css`.

| Step | Class | Face | Size / leading | Use |
|---|---|---|---|---|
| Display | `.t-display` | EB Garamond 500 | 28/32 (36/40 from 768 px) | the question, the decision, the verdict, the floor question |
| Title | `.t-title` | EB Garamond 500 | 22/28 | adviser names, screen titles, journal decisions |
| Body | `.t-body` | EB Garamond 400 | 19/27 | adviser lines, answers, inputs |
| Label | `.t-label`, `.rubric` | EB Garamond 500/600, small capitals, 0.08em | 17/22 | section labels (marble), rubrics (clay red) |

The steps were re-derived on 17 Nov 2026 for Garamond's x-height (about 0.40 em against Inter's
0.55): 19 px Garamond reads at the size 15 px Inter did, so Body moved 17 → 19, Title 20 → 22 and
the label from 13 px capitals to 17 px small capitals. Display stays.

A 17 px secondary size is allowed: `.t-note` (hints, upright; the catalogue note and the colophon add italic),
`.t-ref` (small capitals: a reference under a quotation, a date), chips (18 px italic) and the
facilitator line. `.t-fine` is Inter 13/18 for the legal line. Nothing under 13 px.

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
  `.chip`s (italic in a thin ruled box, marble-500 edge at 3.9:1, 40 px; disabled: marble-400 text on an
  ink-600 edge, no opacity) in one scrolling row,
  plus "More ›" for the rest.

## The book page (Night edition, 17 Nov 2026)

Pavol picked option 2 of three ("Option 2 is good, with a bit more graphics, i love the logo";
`docs/SIGNATURE.md`). Each screen is set as a page:

- **Running head** (`.running-head`, `Header.tsx`): the book's title or the open part ("Journal",
  "The first question", "Quaestio") in spaced small capitals over a double rule (`.dbl`).
- **Foot** (`.tabs-foot`, `BottomNav.tsx`): Council · Journal · Verdict as words; the open one
  under a 2 px clay rule. No icons.
- **Rubrics** (`.rubric`): clay-red small capitals for section words on every screen. Clay-400 on
  ink-950 measures 7.3:1 (6.6:1 on the proposal card's tint), so the token did not move.
- **Versal** (`Versal` in `Furniture.tsx`): the first letter of today's question and of the
  quaestio's question in clay red inside a foliate square: 58 px with the text running round it when
  the question wraps, 40 px beside it when it fits one line. The intake's question has a raised
  red initial (`.versal-raised`), since a box would crowd the field. The text node stays whole; the
  box is `aria-hidden`. A question that does not open on a capital is set plain.
- **Roster**: name, dotted leader, year of death (`died` in `src/content/personas.ts`).
- **Glosses**: her margin notes under a 2 px clay rule, the stance as a rubric, her line in italic.
- **Furniture** (`src/components/Furniture.tsx`, all inline SVG, ink line 1.7 with 0.6–0.9
  hatching): `Device`, `Headpiece`, `Tailpiece`, `Manicule`, `Versal`, `BlankLeaf`, `Colophon`.
  The device is coarse under 60 px (oval, flame, candle, a book of two boards, spine and
  fore-edge) and fine from 60 px. The device's static copies (`public/device.svg`, `device-tile.svg`, `favicon.svg`) are written by
  `WRITE_ASSETS=1 npx vitest run scripts/device-asset.test.mjs`; the same test fails when they are
  stale. The share card: flywheel `scripts/og-image.mjs --icon public/device-tile.svg`.
- **The catalogue note** (`src/content/catalogue.ts`): one voice bit on the boring surfaces. It
  sits beside the facts and the disclosure and replaces neither.
- **Page edge**: from 768 px a double hairline down each side of the 36 rem column (`.page`), the
  tab rule kept to the column, a folio at the foot. The reading pages draw the same frame.
- **Italic** is for text buttons, chips, glosses, the facilitator, the year of death and the
  catalogue voice (blank leaf, colophon). Hints and notes are upright.
- **Motion**: the device's flame leans while the group thinks (`.device-flicker`, 1.8 s); under
  `prefers-reduced-motion` it stands still (`e2e/night.spec.ts`).

## The thread and the candle (20 Nov 2026)

Pavol tried three recording samples (`lab/voice-capture`) and kept two things: "the wave from
option 3 … let's just keep the thread-like line", and the candle, with a correction: "it's strange
that the flame grows rather than flickers when you speak. It should be like catching your breath a
little bit." He refused the silence endpoint: "against the idea of me being thoughtful with my
responses." Everything here is `src/components/Capture.tsx`.

- **The thread**: one line, 1.5 px, candle-400 on a 40 px canvas, drawn from the real input level
  (an `AnalyserNode` on the open mic). Flat means no sound is arriving. It is the recording
  surface's live line in the accent budget.
- **The candle**: the device (`Device`, 64 px; 60 px in the voice bar) stands left of the thread.
  The flame does not grow with volume. With the voice it flickers by at most 5 % and leans by at
  most 5°, about its foot, and settles when he is quiet (`flameTransform`). Under
  `prefers-reduced-motion` the flame is still; the thread still moves, because it is information.
- **The sentence**: one line under the thread says the state in words (Body size, marble-200;
  clay-400 when something is wrong). The sentences are listed in AGENTS.md, "Voice in".
- **Controls**: in a recording journey every control is a labelled button: an icon with its word
  ("Tap and talk", "Back", "Pause") or a word alone ("Finish", "Send", "Next question"). One filled
  action per state: "Tap and talk" while the field is empty, "Finish" while it records, then the
  screen's own action ("Bring it to the group", "Send"). The others are outlines (`.slab-off`).
  The reply box's send is a word button, "Say it", in marble.
- **The words**: his words are set in the ordinary field as they are written down, added after
  what is there. Words the browser has not settled on yet show in italic under the thread;
  "Writing it down…" shows while the gateway has a part. Nothing is sent until he presses the
  screen's action himself.
- **The voice bar** (what changed on 20 Nov): the four round icons became icons with words (Back,
  Pause, Next, End); his turn adds a text field, and under it the candle and the thread while it
  records; the countdown ("Sending in n s") is gone. The bar is taller during his turn (about
  250 px at 390 px wide, was about 110).
- **Fonts**: `index.html` asks for EB Garamond 400/500/600 and italic 400/500 with
  `display=swap`; `EB Garamond Fallback` (Georgia with `size-adjust: 86%`) holds the line
  breaks until it arrives.
- Measured but not changed: `ink-500` is 2.6:1 on ink-950, under the 3:1 this file claimed for
  control edges. New edges here use marble-500 (3.9:1).

## Rules this product adds

- **Monograms, never portraits.** A persona is initials in a ring on a filled disc (`Monogram.tsx`;
  44 px, 52 px on the start screen; lit = 2 px candle ring). No
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
- **Voice is a button, not a mode.** "Tap and talk" sits under the field it fills; "Listen" sits
  beside "← New idea". Each is absent where the browser has no path for it: no explanation, no
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
`fold-phone`, the recording states in `docs/review/2026-11-20-voice/`, `night-*` (the book page: start, colophon, empty journal, 404, door, gloss), and v4's `v4-start`, `v4-intake`, `v4-conversation`, `v4-commit`, `v4-journal`,
`v4-last-time`, `v4-last-time-opener`, all at 390 px, committed and meant to be looked at.
