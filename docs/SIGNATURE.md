# Mastermind Council — signature
The part of the Council that could only have come from Pavol. Nothing in "Signature moves" is built before Pavol has picked it.

Pavol, 2026-10-27: "I'm not about the latest whoever, Tim Ferriss — I'm going back to the Stoics
and the philosophers." The Council takes the forms thinkers used for two thousand years to
examine a decision and keep to it, and puts a small modern machine under them: verified quotes,
a journal you own, a reminder that arrives on the day.

## Lineage
| Source | Year | changes: |
|---|---|---|
| Thomas Aquinas, *Summa Theologiae*, the *quaestio* (question, objections, *sed contra*, *respondeo*). <https://www.newadvent.org/summa/1002.htm> | 1265–1274 | The decision record reads as a quaestio: the objections an adviser actually raised, one verified line on the contrary, the answer, what still has to hold. A decision nobody objected to is shown as not yet examined. |
| Seneca, *De Ira* III.36, the evening self-examination learned from Sextius. <https://www.thelatinlibrary.com/sen/sen.ira3.shtml> | c. 45 | The Journal holds an evening examination: today's and overdue commitments, Seneca's three questions, one tap each — done, not yet, drop. |
| Seneca, *Epistulae Morales ad Lucilium*, trans. Gummere. <https://en.wikisource.org/wiki/Moral_letters_to_Lucilius> | c. 65 | The commitment reminder is a short letter: greeting, the commitment, one verified line from the Letters with its number, farewell. |
| Epictetus, *Enchiridion* 1: "Some things are in our control and others not." <https://classics.mit.edu/Epictetus/epicench.html> | c. 125 | Before committing, the next action is checked against that line; "Partly" lets the user keep only the part that is theirs. |
| Plato, *Apology* 38a, the unexamined life. <https://www.gutenberg.org/ebooks/1656> | 399 BC | One shared question a day, the same for everyone, opened as a council from the start screen. |
| The florilegium / commonplace book (*loci communes*; Erasmus, *Adagia*, 1500–1536) | medieval–1536 | Proposal only (below): what the classics wrote, gathered under the question a reader brings, each line with its source. |

## Refused
- Guru-of-the-month advisers and productivity slogans. Every adviser has a body of work, and anything in quotation marks has been checked against it; a line that cannot be found is removed, not paraphrased (`flywheel/gateway/src/verify.ts`).
- Streaks, badges, confetti, mascots, "✨". The examination does not count days in a row or scold a missed night.
- Engagement bought with flattery. The facilitator does not call the idea great; the record keeps the objections.
- The generic AI-app look: no gradients, blobs or chat bubbles with avatars. Monograms, no portraits, no imitated voices.
- Absolution. The council does not tell the user a past act was fine (gateway rule).
- Dark patterns: no fake urgency in reminders, no tricks in sign-up or pricing.

## Signature moves
| Move | What the user sees | From | Metric (event in kpi_event_map) | Status |
|---|---|---|---|---|
| Quaestio view | Proposal card and journal entry as *Question · It seems not, because… · On the contrary · I answer · What must hold*; with no objection, "No one argued against this yet" and **Test it**. | Aquinas | `key_action` `tested`; share of accepted entries (`conversion`) with ≥1 objection | live (#16, 2026-10-28), awaiting Pavol: keep / change / revert |
| Tonight's examination | On the Journal after 17:00, when something is due: Seneca's three questions, Done / Not yet / Drop per commitment. | Seneca, *De Ira* III.36 | `key_action` `examined` | live (#16, 2026-10-28), awaiting Pavol |
| Letters, not notifications | The reminder email as a short letter with one verified line from Seneca's Letters and the three outcome links. | Seneca, *Letters* | outcome-link opens of `/c/:id?outcome=` per reminder sent | live (gateway, flywheel), awaiting Pavol |
| In your power | "In your power?" with Epictetus' line under the next action; "Partly" rewrites it to the user's part. | Epictetus, *Enchiridion* 1 | `key_action` `committed` with `rewritten: true` | live (#16, 2026-10-28), awaiting Pavol |
| Today's question | The day's shared question at the top of the start screen; one tap opens it as a council. | Plato, *Apology* | `key_action` `daily_opened` | live (#16, 2026-10-28), awaiting Pavol |
| The classics on… (public reading pages) | Crawlable pages of verified lines grouped by the question a reader brings. | Florilegium / commonplace book | `page_view` on the pages, then `key_action` `convened` from them | proposed (#17, branch `claude/evergreen-pages`) |

Status: proposed → approved (dated) → live → or changed / reverted.

### Proposal: The classics on… (public reading pages)
#17 built 20 static pages: `/on/` + ten topics (time, fear, money, work, failure, risk, relationships, habit, death, power), `/advisers/` + seven advisers, and `/how-it-works/`. Every quoted line is a bank line the gateway verifies, with its letter/book/verse and a link to the public-domain edition; `scripts/prerender.test.mjs` fails on any line that is not. They are the only public content while the beta password is on. Screenshots: `docs/review/2026-10-28/`.

- **Option 1 — topic and adviser pages as built (20 URLs).** `opt1-on-index-*.png`, `opt1-on-time-*.png`, `opt1-advisers-seneca-*.png`, `opt1-how-it-works-*.png`. Cost: none left to build; upkeep is re-running `scripts/quotes.mjs` + `scripts/prerender.mjs` when the banks change. Risk: 30–40 quotes per page reads as a quote dump, not one answer.
- **Option 2 — one page of questions, quotes inline, no per-topic URLs.** `opt2-questions-mock-*.png` (a mock assembled from the same pages). Cost: small (one generator template). Gives up per-question search entry points; one long page competes for nothing in particular.
- **Option 3 — neither.** `opt3-live-root-*.png`: today a visitor from search meets the password door. Cost: zero. No public surface until the beta opens.

What Zbrojní's 837 question pages taught: static HTML, one claim per page, the source quoted on the page. Search and answer engines cite a page that answers one question with its source, not a page that lists many.

**Recommendation: Option 1, trimmed to that lesson before it ships** — each topic page opens with the question a reader brings ("What if I keep putting it off?") and the single strongest verified line with its source, then the rest; adviser pages and `/how-it-works/` ship with them. It rests on the florilegium: the commonplace book arranged lines under the question, always with the author and place. Default taken this round: nothing merged; #17 stays merge-ready on its branch.

## Visual signature
The Renaissance printed book: EB Garamond (a revival of Claude Garamond's 16th-century types); rubrics — section words in clay-red small capitals, the colour used for nothing else; the source under a quote as a reference line, as in the Loeb and the printed *Summa*. Marble-on-ink palette, four-step type scale, 44 px targets and the fold and contrast gates are unchanged (`flywheel/docs/standards/taste.md`, `mobile-ux.md`).

## Founder lens
Constitution articles that bind it: II, VI, VIII.

## Decision log
| Date | Options shown | Pavol chose | Note |
|---|---|---|---|
| 2026-10-27 | Stoics and philosophers vs. trend gurus | Stoics and philosophers | The founding quote above. |
| 2026-10-28 | Five live moves: keep / change / revert each | pending | Built before rule 7; default taken: keep, pending review. |
| 2026-10-28 | Public pages: (1) as built, (2) one questions page, (3) neither | pending | Default taken: not merged; recommendation Option 1 trimmed to one claim up top. |
