import { useId, type ReactNode } from 'react'
import { COLOPHON } from '@/content/catalogue'

// The book's drawn furniture (docs/SIGNATURE.md "Visual signature", Pavol 17 Nov 2026): the
// printer's device, a headpiece, a tailpiece, the versal box, a manicule and the blank leaf.
// Ink line on one grid: 1.7 for outlines, 0.6–0.9 for hatching, round caps and joins. The
// device is a mark. It does not speak.

const INK = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/**
 * The printer's device: a candle standing on a closed book, in an oval. Under 48 px it is
 * drawn with four heavy shapes so it still reads; from 48 px it carries the second oval line,
 * the rays, the hatching, the book's ribbon and the initials M C.
 */
export function Device({
  size = 92,
  flicker = false,
  label,
  className = '',
}: {
  /** Width in px; the height follows (100:124). */
  size?: number
  /** The flame leans as in a draught (the "thinking" state). Still under reduced motion. */
  flicker?: boolean
  /** Names the mark for assistive tech; without it the device is decoration. */
  label?: string
  className?: string
}) {
  const fine = size >= 48
  return (
    <svg
      viewBox="0 0 100 124"
      width={size}
      height={size * 1.24}
      data-testid="device"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`block shrink-0 text-marble-300 ${flicker ? 'device-flicker' : ''} ${className}`}
      {...INK}
    >
      {fine ? (
        <>
          <path strokeWidth="2.2" d="M50 4C76 4 95 28 95 62s-19 58-45 58S5 96 5 62 24 4 50 4z" />
          <path strokeWidth=".7" d="M50 9.5c23 0 39.5 22 39.5 52.5S73 114.5 50 114.5 10.500 93 10.500 62 27 9.5 50 9.500z" />
          <path
            strokeWidth=".9"
            d="M35 21l-5-6M65 21l5-6M29 33l-8-3M71 33l8-3M41 13l-2-7M59 13l2-7M32 27l-3-2M68 27l3-2M38 17l-2-3M62 17l2-3M28 41h-5M72 41h5"
          />
          <g className="device-flame">
            <path fill="var(--color-candle-400)" stroke="none" d="M50 19c8 10 12 18 7.500 25-3 5-12 5-14.500 0-4-8 3-14 7-25z" />
            <path fill="var(--color-candle-200)" stroke="none" opacity=".85" d="M50.500 30c3 5 4.200 8.500 2.200 11.500-1.200 2-4.200 2-5.200 0-1.200-4 1-6.500 3-11.500z" />
            <path strokeWidth="1.300" d="M50 19c8 10 12 18 7.500 25-3 5-12 5-14.500 0-4-8 3-14 7-25z" />
          </g>
          <path strokeWidth="1.300" d="M50 50v-5" />
          <path strokeWidth="1.700" d="M44.500 82V52c3.500-2 7.500-2 11 0v30M55.500 57c3 2 3.500 7 2 10-1 2-2-1-2-3" />
          <path strokeWidth=".6" d="M52 55v26M53.700 56v25M50.300 58v6M47 68l-1.500 2.500M47 74l-1.500 2.500M47 62l-1.500 2.500" />
          <path strokeWidth="1.700" d="M33 85c11 5.500 23 5.500 34 0M37 81.500c9 3 17 3 26 0M67 85c5-1 7 3.500 2.500 5.500" />
          <path strokeWidth=".6" d="M40 86.500c7 2 13 2 20 0M56 84l6-1.500" />
          <path strokeWidth="1.700" d="M23 93c18-4.500 36-4.500 54 0v9.500c-18-4.500-36-4.500-54 0zM23 93l-3.500 3v9.500l3.500-3" />
          <path
            strokeWidth=".6"
            d="M28 96.500c14.500-3 29.500-3 44 0M28 99c14.500-3 29.500-3 44 0M19.500 99.500l3.500-2.500M19.500 102l3.500-2.500M30 107h40M35 109.500h30M41 112h18"
          />
          {/* The book's ribbon, hanging over the fore-edge. */}
          <path strokeWidth="1.100" d="M63 100.500v7.500l1.800-1.800 1.800 1.800v-7" />
          <g fill="currentColor" stroke="none" fontFamily="var(--font-display)" fontSize="14" fontWeight="500">
            <text x="14" y="70">
              M
            </text>
            <text x="75" y="70">
              C
            </text>
          </g>
        </>
      ) : (
        <>
          <path strokeWidth="5" d="M50 4C76 4 95 28 95 62s-19 58-45 58S5 96 5 62 24 4 50 4z" />
          <g className="device-flame">
            <path fill="var(--color-candle-400)" stroke="none" d="M50 14c11 13 17 24 10 34-4.500 6-15.500 6-20 0-6-11 4-20 10-34z" />
          </g>
          <path strokeWidth="5" d="M42 84V58h16v26" />
          <path strokeWidth="5" d="M22 90c18-5 38-5 56 0v13c-18-5-38-5-56 0z" />
        </>
      )}
    </svg>
  )
}

/** Headpiece: an interlaced band between two rules, set out from the middle of the measure. */
export function Headpiece({ className = '' }: { className?: string }) {
  const id = `hp${useId().replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg
      width="100%"
      height="22"
      aria-hidden="true"
      data-testid="headpiece"
      className={`block text-marble-400 ${className}`}
      strokeWidth="1.2"
      {...INK}
    >
      <defs>
        <pattern id={id} width="44" height="22" patternUnits="userSpaceOnUse">
          <path d="M0 11c7-13 15-13 22 0s15 13 22 0M0 11c7 13 15 13 22 0s15-13 22 0" />
          <path
            fill="currentColor"
            stroke="none"
            d="M22 8l3 3-3 3-3-3zM0 8l3 3-3 3-3-3zM44 8l3 3-3 3-3-3zM11 3.500a1.300 1.300 0 1 0 .01 0zM11 16a1.300 1.300 0 1 0 .01 0zM33 3.500a1.300 1.300 0 1 0 .01 0zM33 16a1.300 1.300 0 1 0 .01 0z"
          />
        </pattern>
      </defs>
      <svg x="50%" overflow="visible">
        <rect x="-2200" y="0" width="4400" height="22" fill={`url(#${id})`} stroke="none" />
      </svg>
      <path strokeWidth="1" d="M0 .7h4400M0 21.300h4400" />
    </svg>
  )
}

/** Tailpiece: an aldine leaf between two short rules. Closes a proposal and the colophon. */
export function Tailpiece({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 24" width="64" height="24" aria-hidden="true" data-testid="tailpiece" className={`mx-auto block text-marble-400 ${className}`} {...INK}>
      {/* The leaf lies on its side, tip to the right, its stem curling back over it. */}
      <path strokeWidth="1.300" d="M43 12C39 5.500 31 2.500 27 5.500c-3.500 2.500-1.500 6.500 1 6.500-2.500 0-4.500 4-1 6.500 4 3 12 0 16-6.500z" />
      <path strokeWidth=".8" d="M28 12h11M32 12l3-3M32 12l3 3M35.500 12l2.500-2M35.500 12l2.500 2" />
      <path strokeWidth="1.100" d="M28 12c-3.500 0-6.500-2-6.500-5 0-2.800 3-3.800 4.800-2" />
      <path strokeWidth="1" d="M2 12h12M50 12h12" />
      <circle cx="17" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="47" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Manicule: the reader's pointing hand, as the bullet for what must hold. */
export function Manicule({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 32" width="30" height="15" aria-hidden="true" data-testid="manicule" className={`inline-block shrink-0 text-clay-400 ${className}`} strokeWidth="2.400" {...INK}>
      <path d="M3 8h9v17H3zM12 11c4-2 8-3 13-3 3-4 9-4 12-1h20c5 0 5 7 0 7H38" />
      <path d="M38 14c6 0 6 5 0 5h-3M36 19c5 0 5 5 0 5h-4M33 24c4 0 4 4 0 4h-8c-5 0-9-1-13-3" />
      <path strokeWidth="1.300" d="M6 12v1M6 20v1M25 8c1 2 3 3 6 3M50 9v3" />
    </svg>
  )
}

/**
 * The question with its versal: the first letter in clay red inside a small foliate square,
 * as a woodcut initial. The text stays whole for a screen reader and for find-in-page; the
 * box is decoration. A question that does not open on a capital is set plain.
 */
export function Versal({ children: text, className = '' }: { children: string; className?: string }) {
  if (!/^\p{Lu}/u.test(text)) return <span className={`block ${className}`}>{text}</span>
  return (
    <span className="block flow-root">
      <span aria-hidden="true" className="versal-box" data-letter={text[0]} data-testid="versal">
        <svg viewBox="0 0 60 60" className="absolute inset-[5px] h-[calc(100%-10px)] w-[calc(100%-10px)] opacity-60" strokeWidth="1.100" {...INK}>
          <path d="M4 57C4 30 14 8 34 8c12 0 19 8 19 17 0 9-7 15-15 15-6 0-10-4-10-9 0-4 3-7 7-7" />
          <path d="M57 55C40 58 22 52 16 40M57 55c-3-8-1-14 0-20M12 28c-7-2-9-8-8-13 6 1 9 6 8 13zM40 51c6 5 12 4 16-1-5-4-11-4-16 1zM46 9c4-6 9-6 12-3-3 5-8 6-12 3zM22 16c-1-6 2-10 6-12 2 5 0 9-6 12zM24 46c-5 3-10 2-13-2 5-3 10-2 13 2zM50 30c5-2 8 0 9 4-4 2-8 0-9-4z" />
          <path strokeWidth=".7" d="M5 17c3 3 5 6 6 10M43 50c4 1 8 0 12-1M48 7c3 0 6-1 9-1M23 14c2-3 3-6 4-9" />
          <circle cx="50" cy="42" r="1.500" />
          <circle cx="9" cy="50" r="1.500" />
          <circle cx="14" cy="6" r="1.500" />
          <circle cx="37" cy="4" r="1.200" />
        </svg>
      </span>
      <span className={`versal-boxed block ${className}`}>{text}</span>
    </span>
  )
}

/** A blank leaf with its corner turned: the empty journal and the missing page. */
export function BlankLeaf({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`leaf ${className}`} data-testid="blank-leaf">
      <svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true" className="absolute -right-px -top-px text-ink-500" strokeWidth="1" {...INK}>
        <path d="M-1 -1H35V35z" fill="var(--color-ink-950)" stroke="none" />
        <path d="M0 .5L33.500 34V34H.5V.5z" fill="var(--color-ink-850)" />
        <path strokeWidth=".7" d="M5 14v15M10 19v10M15 24v5M5 29h20" opacity=".8" />
      </svg>
      <div>{children}</div>
    </div>
  )
}

/** The colophon at the foot of a page: the device, the edition, the face, the errata. */
export function Colophon({ className = '' }: { className?: string }) {
  return (
    <footer data-testid="colophon" className={`mx-auto max-w-xl px-4 pb-6 text-center ${className}`}>
      <Device size={64} className="mx-auto" />
      <p className="t-note mt-2">
        {COLOPHON.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
    </footer>
  )
}
