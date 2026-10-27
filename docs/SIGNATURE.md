# Signature — Mastermind Council

2026-10-27. Pavol: "I'm not about the latest whoever, Tim Ferriss — I'm going back to the Stoics
and the philosophers." The Council does not imitate a podcast-era mastermind. It takes the
forms that thinkers used for two thousand years to examine a decision and keep to it, and
puts a small modern machine under them: verified quotes, a journal you own, a reminder that
arrives on the day.

## Lineage

| Source | What it gives us | changes: |
|---|---|---|
| Thomas Aquinas, *Summa Theologiae* (1265–1274), the *quaestio* form of the scholastic *disputatio*: question, objections ("it seems that…"), on the contrary (*sed contra*), I answer (*respondeo*), replies to the objections. <https://www.newadvent.org/summa/1002.htm> | A decision is not examined until the strongest case against it has been stated and answered. | The decision record reads as a quaestio: the question, the objections an adviser actually raised, one verified line on the contrary, the answer, and what still has to hold. A decision nobody objected to is shown as not yet examined. |
| Seneca, *De Ira* III.36 (c. 45 AD), the evening self-examination he learned from Sextius: "quod hodie malum tuum sanasti? cui vitio obstitisti? qua parte melior es?" <https://www.thelatinlibrary.com/sen/sen.ira3.shtml> | A short review at the end of the day, about what you did, not how you felt. | The Journal holds an evening examination: today's and overdue commitments, Seneca's three questions, and one tap per commitment — done, not yet, drop. |
| Seneca, *Epistulae Morales ad Lucilium* (c. 65 AD), trans. Gummere (Loeb, 1917–1925). <https://en.wikisource.org/wiki/Moral_letters_to_Lucilius> | Counsel kept up by letter: a greeting, one point, one line worth keeping, a farewell. | The commitment reminder is a short letter in that form, carrying one verified line from the Letters (e.g. Letter 1: "While we are postponing, life speeds by."). The subject line stays generic. |
| Epictetus, *Enchiridion* 1 (c. 125 AD), trans. Carter: "Some things are in our control and others not." <https://classics.mit.edu/Epictetus/epicench.html> | The only useful next action is one that is in your power. | The next action is checked against that line before it becomes a commitment: if it depends on someone else, the user rewrites the part that is theirs. |
| Plato, *Apology* 38a (399 BC): the unexamined life. <https://www.gutenberg.org/ebooks/1656> | Examination as a daily practice, in company. | One shared question a day for everyone, the same one, opened as a council on the start screen. |

## Refused

- Guru-of-the-month advisers and productivity slogans. Every adviser is a thinker with a body
  of work, and anything in quotation marks has been checked against that work (row 13 of the
  charter; `flywheel/gateway/src/verify.ts`).
- Streaks, badges, confetti, mascots, "✨". The evening examination does not count days in a
  row and does not scold a missed night.
- Engagement bought with flattery. The facilitator does not tell the user the idea is great,
  and the record shows the objections that were raised against it.
- The generic AI-app look: no gradients, no blobs, no chat bubbles with avatars. Advisers are
  monograms; there are no portraits and no imitated voices (provenance rules).
- Absolution. The council does not tell the user a past act was fine (gateway rule).

## Signature mechanics

| Mechanic | What the user sees | From | How we will know it works |
|---|---|---|---|
| **The question, examined** | The proposal card and the journal entry, read as a quaestio: *Question* · *It seems not, because…* (each objection, with who raised it) · *On the contrary* (a verified line from the session, with its source) · *I answer* (decision and reasoning) · *What must hold* (the assumptions). With no objection: "No one argued against this yet" and a one-tap "Test it" control. | Aquinas | Share of accepted entries with at least one objection (from the map's `challenges` edges); `key_action` `action: "tested"` per session. Target: half of accepted entries carry an objection. |
| **The evening examination** | On the Journal screen after 17:00 local time, when something is due: Seneca's three questions and today's commitments with Done / Not yet / Drop. | Seneca, *De Ira* III.36 | `key_action` `action: "examined"`; share of commitments with an outcome within 24 h of their due date. Target: above 40 %. |
| **Letters, not notifications** | The reminder email: "From your council, greetings." The commitment, one line from Seneca's Letters with its letter number, the three outcome links, "Farewell." | Seneca, *Letters* | Outcome-link clicks per reminder sent (the `/c/:id?outcome=` route). Baseline: today's plain reminder. |
| **In your power** | Under the next action, before committing: "In your power?" with Epictetus' line. "Partly" opens the field to rewrite the part that is the user's. | Epictetus, *Enchiridion* 1 | Share of commitments marked fully in the user's power, and their completion rate against the rest. |
| **Today's question** | On the start screen, the day's question, the same for everyone; one tap opens it as a council with the Classics roster. | Plato, *Apology* | `key_action` `convened` with `daily: true`, and visitors who come back on a second day. |

## Visual signature

The Renaissance printed book. The display face is already EB Garamond, a revival of
Claude Garamond's 16th-century types. The quaestio and the letters take two more habits from
the printed editions of the *Summa* and the Loeb classics:

- **Rubrics.** Section words (*Question*, *Objection 1*, *On the contrary*, *I answer*) are set
  in small capitals in the clay red already in the palette, the way rubricated headings marked
  the parts of an article. Red is used for these labels and nowhere else.
- **Marginal references.** A quote's source (letter, book and chapter) sits under the quote as
  a reference line, not as a link chip.

Nothing else changes: the marble-on-ink palette, the four-step type scale, 44 px targets, the
fold and contrast gates stay as they are (`flywheel/docs/standards/taste.md`, `mobile-ux.md`).

## Founder lens

- **II (the order).** The evening examination is a few minutes and closes itself. Nothing in
  the Council asks for attention in the morning or at night beyond the one reminder the user
  set.
- **VI (the moat is distribution, reputation, frozen judgment, relationships).** The frozen
  judgment is the quote verification and the user's own record of decisions and outcomes. The
  quaestio and the examination are what make that record worth keeping. Distribution comes
  from the daily question and from crawlable pages of what the thinkers actually wrote.
- **VIII (never lie, cheat or trick).** Only checked quotes appear in quotation marks; an
  unverified line is shown as paraphrase. No fake urgency in reminders, no dark patterns in
  sign-up or pricing.

Differentiation that follows: competitors (`docs/research/competition-2026-10.md`) give you a
board that argues (SynthBoard, Moot) or a quote a day (Stoic apps). None writes the decision
up in a form that keeps the objections, holds the quotes to the source, and follows up in the
evening and by letter.
