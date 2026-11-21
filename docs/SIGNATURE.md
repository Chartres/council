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
| The catalogue note (Night edition) | Every screen set as a book page (running head, rubrics, versal on the quaestio, speakers in small capitals, glosses, a roster with leaders to each adviser's year of death, colophon) under the printer's device. On the boring surfaces the product describes itself as a bookseller's catalogue describes a copy: "Ten advisers, none living." (Classics roster and the colophon) · "This page is blank, as issued." (empty journal, empty My ideas) · "Leaf wanting. This page is not in our copy." (404) · "Authors' approval: not sought. None of them has read this." (once, beside the AI disclosure at the foot of the start screen; not inside a conversation) · "Errata: probably. Report them under Feedback." (colophon on the start screen and the 404 only; not under the reader's own decisions) · "Privately printed" (the door). The lines sit beside the facts and the disclosure and replace neither; the adviser count comes from the data. | The printed book of the 16th century; the bookseller's catalogue entry | `page_view` with `view: notfound` for the missing leaf. To instrument: nothing else fires on the furniture | approved 2026-11-17 ("Option 2 is good, with a bit more graphics, i love the logo"); built on `design/night-edition`, awaiting his look |
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
The Renaissance printed book, on the ink ground (Night edition, 2026-11-17). EB Garamond (a revival of Claude Garamond's 16th-century types) sets body, labels and buttons; Inter is kept for the 13 px legal line, the admin bar and the AI prompt to copy. The source under a quote is a reference line in small capitals, as in the Loeb and the printed *Summa*.

- **Rubrication.** Clay red (`clay-400`, 7.3:1 on ink) marks every rubric (section words in small capitals, on every screen), the versal on the quaestio's question, the objection numbers, the manicule, the open tab's rule and the rule beside the reader's glosses and the evening examination. It is used for nothing decorative beyond rubrication. Two earlier uses stay: the error line and a vote against in the quick verdict.
- **The device.** The product's mark is a printer's device: a candle standing on a closed book, in an oval with a second inner line, the initials M C either side, rays, hatching and a ribbon. Ink line, the flame the only colour (candle, with a highlight). Under 60 px it is drawn coarse: the oval, the flame, the candle, and the book as two boards with a rounded spine and a fore-edge. It appears on the password door, in the colophon, on the missing leaf, beside "The group is talking…" (the flame leans; it stands still under reduced motion), as the favicon and on the share card. It is a mark. It does not speak, and it is not a guide or a mascot.
- **Furniture.** A headpiece (a triple rule with two leaves about a lozenge at its centre and a lozenge at each end) on the start screen, the journal and the quick verdict; from 768 px a double hairline down each side of the column and a folio at the foot; a double rule under the running head; a woodcut-style versal box; a pilcrow before each rubric of the quaestio and a manicule at what must hold; an aldine leaf as tailpiece; a leaf with a curled corner for blank pages. All drawn in `src/components/Furniture.tsx`. No portraits, no gradients, no badges.
- **Roster.** A contents list: name, dotted leader, year of death. Years from the English Wikipedia biographies (summaries and infoboxes, read 2026-11-17; no other source was read): Socrates 399 BC, Confucius 479 BC (Wikipedia marks it "c."), Seneca AD 65, Marcus Aurelius AD 180, Franklin 1790, Montessori 1952, Drucker 2005, Jobs 2011, Grove 2016. The Buddha's death is disputed; the roster prints both scholarly dates, "c. 483 or 400 BC" (Cousins 1996; Norman 1997; Prebish 2008, as cited in Wikipedia's "The Buddha").
- **Scale.** Four steps, re-derived for Garamond's smaller x-height: Display 28/32 (36/40 from 768 px), Title 22/28, Body 19/27, Label 17/22 in small capitals. A 17 px secondary size for notes and chips. 44 px targets and the fold and contrast gates are unchanged (`flywheel/docs/standards/taste.md`, `mobile-ux.md`).
- **Reading pages.** The 20 public pages share the tokens, the rubrics, a versal on the lede and the device. They carry no catalogue jokes: a page whose claim is that each line was checked does not print "Errata: probably".

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
| 2026-11-01 | Directory submission policy: confirm as written / edit | confirm as written | "Confirm it as written". Recorded in `docs/distribution/directory-entries.md`. Nothing submitted. |
| 2026-11-17 | Look: 1 Errata slip (quiet) / 2 Night edition (medium) / 3 First edition (loud, paper) | 2, with more drawn furniture | "Option 2 is good, with a bit more graphics, i love the logo." The logo is the drawn printer's device. Built: option 2 on the ink ground with a headpiece, versal box, manicule, tailpiece and turned-leaf from option 3's kind of furniture; not option 3's paper palette. Options page: claude.ai/artifact/3MiPktU3aSveHwRE6PjNne. After-shots: `docs/review/2026-11-17-night/`. |
| 2026-11-18 | After an independent design review, three calls taken by the orchestrator as defaults, for Pavol to reverse | pending | (a) "Ten advisers, none living." beside the roster on Classics only, since Drucker, Jobs and Grove died within living memory; (b) "Authors' approval: not sought…" once at the foot of the start screen, not inside a conversation; (c) "Set in EB Garamond; the small print in Inter." Also: the errata line only on the start screen and the 404. |
| 2026-11-20 | Recording: three samples (1 voice memo with bars / 2 the candle, hands-free, a pause ends the answer / 3 hold to talk, a thread-like line) | the thread from 3, the candle from 2, no silence endpoint | "what I like is the wave from option 3 … let's just keep the thread-like line. And I actually really liked the candle design"; "it's strange that the flame grows rather than flickers when you speak. It should be like catching your breath a little bit"; "I did not like this stressful thing that waits for silence … That's against the idea of me being thoughtful with my responses." Same evening: "The functionality of seeing the text and correcting it is super important." Built on `voice/thread-and-candle`: tap and talk, Finish, text to correct, then his own send. Shots: `docs/review/2026-11-20-voice/`. |
| 2026-11-20 | The candle on the recording surface: A an engraved emblem (Wither, 1635) / B a painted candle (Therbusch, about 1755) / C the drawn candle under a Plato headpiece | B, the painted candle; the emblem kept "for other parts of the site" | "I really like the painted candle, although work a little bit more to make the glow and the animation a bit more sophisticated. There is some kind of artificial halo that shows when I speak." Built in `src/components/Candle.tsx`: a detail of Anna Dorothea Therbusch, *A Scientist Seated at a Desk by Candlelight*, about 1755, Cleveland Museum of Art, CC0; the flame moves on a spring driven by his voice, no halo. He has not seen this second version of the motion yet. The drawn device stays the mark; the emblem is not in this change. |
| 2026-11-01 | Legacy password MCP path: remove now / remove before the password goes / keep | remove before the password goes | The legacy path is removed in the same change that ends the beta password. Not removed now; the code is in `flywheel/gateway`. |

- 2026-11-21: today's question loses its versal; on Pavol's iPhone the boxed H read as a cropped headline ("the headline is cropped"). The quaestio keeps its versal. The start screen gains a two-sentence note of what the app is (`WHAT_IT_IS`, catalogue.ts), under today's question so the fold rule holds.
