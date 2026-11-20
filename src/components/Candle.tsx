import { useImperativeHandle, useRef, type Ref } from 'react'
import painting from '@/assets/candle-therbusch-1755.jpg'

// The candle on the recording surface, behind one boundary: this file is the only one that
// knows how the candle is shown and how its flame moves. Another candle replaces this file and
// keeps `Candle` and `CandleHandle`.
//
// The picture (Pavol, 20 Nov 2026: "I really like the painted candle"): a detail of Anna
// Dorothea Therbusch, "A Scientist Seated at a Desk by Candlelight", about 1755, Cleveland
// Museum of Art, open access (CC0). 280 × 860 px, enough for 2x up to 140 px wide.
// Two masked layers of the same image: the painting with the flame left out, and the flame
// alone on top, so the flame can move with nothing behind it. An SVG turbulence filter makes
// the flame waver; a damped spring driven by the onsets of his voice pushes it over and down a
// little and lets it recover ("like catching your breath"); a wide faint light follows a slowly
// smoothed level. No clip-path and no brightness filter on the flame: those drew the halo he
// disliked. The drawn device (Furniture.tsx) stays the mark everywhere else.

/** Every motion constant, in one place. He has not seen this version of the flame yet. */
export const FLAME = {
  /** The spring that brings the flame back: stiffness, damping, and how hard an onset pushes. */
  stiffness: 70,
  damping: 9,
  push: 140,
  onsetGain: 60,
  /** How far a full push leans the flame (degrees) and shortens it (share of height). */
  leanDeg: 5,
  dip: 0.05,
  /** With a steady voice the flame stands this much taller: 3 %, not growth with volume. */
  lift: 0.03,
  /** At rest: a slow lean (degrees) and a slow breath (share of height). */
  restLeanDeg: 0.8,
  restBreath: 0.012,
  /** How fast the slow level follows the voice (per second). */
  slowRate: 1.6,
  /** The waver filter: base frequency x and y with their drift, and displacement at rest, per level, per push. */
  waver: { fx: 0.015, fxDrift: 0.003, fy: 0.035, fyDrift: 0.006, scale: 2, perLevel: 5, perPush: 7 },
  /** The light on the dark around the flame: opacity at rest, per level, drift; size per level, drift. */
  light: { opacity: 0.72, perLevel: 0.28, drift: 0.05, grow: 0.06, breathe: 0.015, still: 0.8 },
} as const

export interface FlameState {
  /** The flame's displacement from rest (-1..1) and its velocity. */
  x: number
  vel: number
  /** The slowly smoothed level (0..1). */
  slow: number
}
export const FLAME_REST: FlameState = { x: 0, vel: 0, slow: 0 }

/**
 * One frame of the breath: `raw` is the input level now, `level` the smoothed one (RMS, 0..1).
 * A sound louder than the level just before it (an onset) pushes the flame; the spring recovers.
 */
export function flameStep(s: FlameState, raw: number, level: number, dt: number): FlameState {
  const l = Math.min(1, Math.sqrt(Math.max(0, level)) * 1.8)
  const onset = Math.max(0, raw - level) * FLAME.onsetGain
  const vel = s.vel + (-FLAME.stiffness * s.x - FLAME.damping * s.vel + onset * FLAME.push) * dt
  const x = Math.max(-1, Math.min(1, s.x + vel * dt))
  return { x, vel, slow: s.slow + (l - s.slow) * Math.min(1, dt * FLAME.slowRate) }
}

/** The flame's pose: a lean and a few percent of height. `t` in seconds. */
export function flameTransform(s: FlameState, t: number): string {
  const skew = Math.sin(t * 1.3) * FLAME.restLeanDeg + s.x * FLAME.leanDeg
  const tall = 1 + Math.sin(t * 2.1) * FLAME.restBreath - Math.abs(s.x) * FLAME.dip + s.slow * FLAME.lift
  return `skewX(${skew.toFixed(2)}deg) scaleY(${tall.toFixed(4)})`
}

export interface CandleHandle {
  /** Every frame while the mic is open: the input level now and smoothed (RMS, 0..1), and the frame's time (ms). */
  flicker(raw: number, level: number, now: number): void
  /** The mic closed: the flame rests. */
  rest(): void
}

const RATIO = 860 / 280
const FLAME_AT = 'radial-gradient(ellipse 34% 25% at 53.5% 27%, #000 50%, transparent 100%)'
const NOT_FLAME = 'radial-gradient(ellipse 30% 22% at 53.5% 27%, transparent 55%, #000 100%)'
const VIGNETTE = 'radial-gradient(ellipse 50% 50% at 52% 46%, #000 35%, transparent 96%)'
const mask = (m: string) => ({ maskImage: m, WebkitMaskImage: m })
const layer = 'absolute inset-0 h-full w-full max-w-none select-none'

export function Candle({
  size = 72,
  crop = 1,
  ref,
}: {
  /** Width in px; the height follows the painting (280:860). */
  size?: number
  /** The share of the height shown, from the top (the voice bar shows the flame and the candle's shoulder). */
  crop?: number
  ref?: Ref<CandleHandle>
}) {
  const flame = useRef<HTMLImageElement>(null)
  const light = useRef<HTMLDivElement>(null)
  const turb = useRef<SVGFETurbulenceElement>(null)
  const disp = useRef<SVGFEDisplacementMapElement>(null)
  // Reduced motion: the flame and the light stand still (the thread beside it still moves: it is information).
  const still = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useImperativeHandle(ref, () => {
    let s = FLAME_REST
    let last = 0
    return {
      flicker(raw, level, now) {
        if (still) return
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
        last = now
        s = flameStep(s, raw, level, dt)
        const t = now / 1000
        const { waver: w, light: g } = FLAME
        if (flame.current) flame.current.style.transform = flameTransform(s, t)
        turb.current?.setAttribute('baseFrequency', `${(w.fx + Math.sin(t * 0.7) * w.fxDrift).toFixed(4)} ${(w.fy + Math.sin(t * 1.1) * w.fyDrift).toFixed(4)}`)
        disp.current?.setAttribute('scale', (w.scale + s.slow * w.perLevel + Math.abs(s.x) * w.perPush).toFixed(1))
        if (light.current) {
          light.current.style.opacity = String(g.opacity + s.slow * g.perLevel + Math.sin(now / 1900) * g.drift)
          light.current.style.transform = `scale(${(1 + s.slow * g.grow + Math.sin(now / 2600) * g.breathe).toFixed(3)})`
        }
      },
      rest() {
        s = FLAME_REST
        last = 0
        if (flame.current) flame.current.style.transform = ''
      },
    }
  }, [still])

  const height = size * RATIO
  const glow = size * 2.8
  return (
    <div data-testid="candle" className="relative shrink-0" style={{ width: size, height: height * crop }}>
      {/* Cropped (the voice bar) there is no room for light to fall: it would end at a hard edge. */}
      {crop === 1 && <div
        ref={light}
        aria-hidden="true"
        data-testid="candle-light"
        className="pointer-events-none absolute rounded-full"
        style={{
          left: '50%',
          top: height * 0.3,
          width: glow,
          height: glow,
          margin: -glow / 2,
          opacity: FLAME.light.still,
          background: 'radial-gradient(circle, rgba(232,150,70,.20) 0, rgba(200,110,50,.08) 35%, transparent 68%)',
        }}
      />}
      <div className="absolute inset-0 overflow-hidden" style={crop < 1 ? mask('linear-gradient(#000 72%, transparent)') : undefined}>
        <div className="relative" style={{ width: size, height, ...mask(VIGNETTE) }}>
          <img src={painting} alt="A painted candle burning in a brass holder" draggable={false} className={layer} style={mask(NOT_FLAME)} />
          <img
            ref={flame}
            src={painting}
            alt=""
            draggable={false}
            data-testid="candle-flame"
            className={layer}
            style={{ ...mask(FLAME_AT), transformOrigin: '53.5% 47.5%', filter: still ? undefined : 'url(#candle-waver)', willChange: 'transform' }}
          />
        </div>
      </div>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <filter id="candle-waver" x="-30%" y="-10%" width="160%" height="70%" colorInterpolationFilters="sRGB">
          <feTurbulence ref={turb} type="fractalNoise" baseFrequency="0.015 0.035" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap ref={disp} in="SourceGraphic" in2="n" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </div>
  )
}
