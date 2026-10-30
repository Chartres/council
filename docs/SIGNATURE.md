# Mastermind Council — signature
The part of Mastermind Council that could only have come from Pavol. Nothing in "Signature moves" is built before Pavol has picked it.

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
| The florilegium / commonplace book (*loci communes*; Erasmus, *Adagia*, 1500–1536) | 1500–1536 | Proposal only (below): what the classics wrote, gathered under the question a reader brings, each line with its source. |

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
| Quaestio view | Proposal card as *Question · It seems not, because… · On the contrary · I answer · What must hold* (the journal entry omits *On the contrary*); with no objection, "No one argued against this yet", and **Test it** on a live proposal. | Aquinas | `key_action` `tested`. To instrument: objection count on `conversion` (it carries only `{v, roster}` today) | approved 2026-10-30 (keep as is); live (#16) |
| Tonight's examination | On the Journal from the evening hour she sets (default 17:30, on the Journal), when something is due: Seneca's three questions, Done / Not yet / Drop per commitment. | Seneca, *De Ira* III.36 | `key_action` `examined` | approved 2026-10-30 (keep as is; hour user-set, default 17:30); live (#16, #26) |
| Letters, not notifications | The reminder email as a short letter with one verified line from Seneca's Letters and the three outcome links. | Seneca, *Letters* | To instrument: no event fires on `/c/:id?outcome=` yet (candidate: `key_action` `outcome_link`) | live (gateway, flywheel), awaiting Pavol |
| In your power | "In your power?" with Epictetus' line under the next action; "Partly" opens it for the user to keep only their part. | Epictetus, *Enchiridion* 1 | `key_action` `committed` with `rewritten: true` (true whenever Partly was used, edited or not) | live (#16, 2026-10-28), awaiting Pavol |
| Today's question | The day's shared question at the top of the start screen; one tap opens it as a council. A "Why?" button opens one line: Plato's *Apology* 38a, "the unexamined life is not worth living" (Jowett). | Plato, *Apology* | `key_action` `daily_opened` | approved 2026-10-30 (with the Plato note); live (#16, #26) |
| The classics on… (public reading pages) | Crawlable pages of verified lines grouped by the question a reader brings: `/on/` + ten topics, `/advisers/` + seven advisers, `/how-it-works/`. | Florilegium / commonplace book | `page_view` on the pages, then `key_action` `convened` from them | approved 2026-10-30 (option 1, as built); live (#17) |

Status: proposed → approved (dated) → live → or changed / reverted.

### Proposal: The classics on… (public reading pages)
#17 built 20 static pages: `/on/` + ten topics (time, fear, money, work, failure, risk, relationships, habit, death, power), `/advisers/` + seven advisers, and `/how-it-works/`. Every quoted line is a bank line the gateway verifies, with its letter/book/verse and a link to the public-domain edition; `scripts/prerender.test.mjs` fails on any line that is not. They would be the only public content while the beta password is on. Screenshots: `docs/review/2026-10-28/`.

- **Option A — topic and adviser pages as built (20 URLs).** `opt1-on-index-*.png`, `opt1-on-time-*.png`, `opt1-advisers-seneca-*.png`, `opt1-how-it-works-*.png`. Cost: none left to build; upkeep is re-running `scripts/quotes.mjs` + `scripts/prerender.mjs` when the banks change. Risk: 30–40 quotes per page reads as a quote dump, not one answer.
- **Option B — one page of questions, quotes inline, no per-topic URLs.** `opt2-questions-mock-*.png` (a mock assembled from the same pages). Cost: small (one generator template). Gives up per-question search entry points; one long page competes for nothing in particular.
- **Option C — neither.** `opt3-live-root-*.png`: today a visitor from search meets the password door. Cost: zero. No public surface until the beta opens.

What Zbrojní's 837 question pages taught: static HTML, one claim per page, the source quoted on the page. Search and answer engines cite a page that answers one question with its source, not a page that lists many.

**Decided 2026-10-30: option 1 (A), as built** — see the decision log. The earlier recommendation was **Option A, trimmed to that lesson before it ships** — each topic page opens with the question a reader brings ("What if I keep putting it off?") and the single strongest verified line with its source, then the rest; adviser pages and `/how-it-works/` ship with them. It rests on the florilegium: the commonplace book arranged lines under the question, always with the author and place. Merged 2026-10-30 as #17.

## Visual signature
The Renaissance printed book: EB Garamond (a revival of Claude Garamond's 16th-century types); rubrics — section words in clay-red small capitals, the colour used for nothing else; the source under a quote as a reference line, as in the Loeb and the printed *Summa*. Marble-on-ink palette, four-step type scale, 44 px targets and the fold and contrast gates are unchanged (`flywheel/docs/standards/taste.md`, `mobile-ux.md`).

## Founder lens
Constitution articles that bind it: II, VI, VIII.

## Decision log
| Date | Options shown | Pavol chose | Note |
|---|---|---|---|
| 2026-10-27 | Stoics and philosophers vs. trend gurus | Stoics and philosophers | The founding quote above. |
| 2026-10-28 | Five live moves: keep / change / revert each | pending | Built before the review-first rule for signature moves (charter, 2026-10-28); default taken: keep, pending review. |
| 2026-10-28 | Public pages: A as built, B one questions page, C neither | pending | Default taken: not merged; recommendation A, trimmed to one claim up top. |
| 2026-10-30 | Quaestio view: keep / change / revert | keep | "keep as it is". |
| 2026-10-30 | Tonight's examination: keep / change / revert | keep | "keep as it is". |
| 2026-10-30 | Evening examination hour: fixed 17:00 / user-set | user-set | "User-set", "Default 17:30". Built: a time field on the Journal, kept on the device (`council:evening`); anyone who never set it gets 17:30. |
| 2026-10-30 | Today's question on the start screen: keep / change / revert | keep, with a note | "I like it, give it a little on-hover or onclick explanation that this comes from Plato." Built: "Why?" opens one line citing *Apology* 38a in Jowett's translation, on tap, hover or keyboard focus. |
| 2026-10-30 | Public pages: 1 topic and adviser pages (20) / 2 one questions page / 3 neither | 1 | "Topic and adviser pages: /on/<topic>/ and /advisers/<name>/, 20 pages of verified quotes". As built, not trimmed; `/how-it-works/` was one of the 20 and ships with them. |
| 2026-10-30 | Directory and registry submissions | prepare entries; Pavol submits or confirms the policy | "Prepare entries, Pavol submits or confirms the policy". Entries and the policy proposal: `docs/distribution/directory-entries.md`. Nothing submitted. |
| 2026-10-30 | Anonymous allowance | unchanged: 5 starts per /24 per day | "Revisit once we start hitting limits too much". |
| 2026-10-30 | Free-tier share of the monthly budget | unchanged: 1,500 of 3,000 cents | Already set; recorded only. |
| 2026-10-30 | Letters, not notifications; In your power? | still open | He asked "What is this?". The explanations are on the decision page. Unchanged. |
| 2026-10-30 | Legacy password MCP path | still open | "Dont undrstand". Unchanged. |
| 2026-10-30 | Reusing a move approved for one product in another | allowed | "Dont just blindly copy the pattern though." |
