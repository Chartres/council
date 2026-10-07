# MOAT.md — Mastermind Council

Written at stage 3 (discovery) per `flywheel/docs/standards/moat.md`. Track: commercial.

## Hypothesis (falsifiable)

A council that **argues with itself to a verdict** produces something a single-persona chatbot
cannot: a decision with a recorded split. Two things then compound per user per week —

1. **Idea history.** Every session is kept: the idea, the transcript, the verdict, the vote split.
   After a month a user has a decision journal nobody else holds, and the council can refer to
   what it said before. Leaving means leaving that behind.
2. **A shared daily ritual.** One question a day, the same for everyone, with a share card that
   carries the split and never the user's text. It brings people back and it brings people in.

## The compounding asset, written to disk

`council_ideas` (Supabase, own-row RLS — `docs/SUPABASE.md`): `idea`, `transcript jsonb`,
`verdict jsonb`, `daily_key`, `created_at`. That table *is* the asset. Rows per user per week is
the number to watch; a user with eight weeks of rows should retain measurably better than one
with none (the stage-7 cohort split).

## Entrant-difficulty score: 2

A competent solo dev with our prompts and this code ships a lookalike in two weeks. What they
would still lack on day one: the accumulated per-user decision history, and whatever audience the
daily question has gathered. That is months of *our* data, not better execution — a 2, which is
inside the 2–3 target band and above the stage-4 kill line.

## What we deliberately do not rely on

- **Persona quality or prompt secrecy.** Production prompts are reconstructed 68 % of the time,
  and a public endpoint defeats the trade-secret test. The persona bible lives server-side for
  cost and consistency, not as IP; assume a competitor has it. If the moat needed the prompt, it
  would not be a moat.
- **The daily question as a moat on its own.** It is a growth engine (Wordle mechanic), not a
  defence — a clone of it ships in a weekend. It earns its place by feeding asset 1.

## Kill signal

If, by the stage-4 gate, users do not come back to their own history — no one reopens a past
council, nobody asks for export or continuity — the switching cost is imaginary and this is a
persona wrapper with a nice skin. Score drops to 0–1 and the product dies there.
