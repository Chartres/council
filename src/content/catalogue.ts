// The catalogue note (docs/SIGNATURE.md, Pavol 17 Nov 2026): the product describes itself the
// way a bookseller's catalogue describes a copy: flat, exact, defects included. The lines sit
// beside the facts and the disclosure; they do not replace either.
import whatsNew from '../../whats-new.json'
import { ROSTERS } from './personas'

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']

/** Every adviser on either roster, once. */
export const ADVISER_COUNT = new Set(Object.values(ROSTERS).flatMap((r) => r.map((p) => p.id))).size

const counted = WORDS[ADVISER_COUNT] ?? String(ADVISER_COUNT)

/** True while every adviser carries a year of death (src/content/catalogue.test.ts). */
export const NONE_LIVING = `${counted} advisers, none living.`
export const BLANK_LEAF = 'This page is blank, as issued.'
export const LEAF_WANTING = 'Leaf wanting. This page is not in our copy.'
export const NOT_SOUGHT = 'Authors’ approval: not sought. None of them has read this.'
export const PRIVATELY_PRINTED = 'Privately printed'

export const EDITION: string = whatsNew.version

/** The painted candle on the recording surface (src/components/Candle.tsx). */
export const CANDLE_CREDIT =
  'The candle: a detail of Anna Dorothea Therbusch, A Scientist Seated at a Desk by Candlelight, about 1755. Cleveland Museum of Art, CC0.'

/** The colophon, line by line. */
export const COLOPHON = [
  `Mastermind Council, edition ${EDITION}.`,
  `${counted} advisers, none living; simulated by AI.`,
  'Set in EB Garamond; the small print in Inter.',
  CANDLE_CREDIT,
]
/** Only on the start screen and the missing leaf: not under a reader's own decisions. */
export const ERRATA = ['Errata: probably.', 'Report them under Feedback.']
/** The count as a word, for copy that names it (index.html and the share card are checked against it). */
export const ADVISERS_WORD = counted
