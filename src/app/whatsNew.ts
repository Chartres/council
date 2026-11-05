// What's new (flywheel docs/standards/whats-new.md): the once-per-version sheet, mounted on the
// start screen only. Never over the beta door, a discussion, the intake, the reminder deep link
// or an embed: if this load has already left the start screen, the sheet waits for the next load.
import { useEffect, useRef } from 'react'
import release from '../../whats-new.json'
import { track } from '@/analytics'
import { mountWhatsNew } from '@/platform/whats-new'

export type Mount = typeof mountWhatsNew
type StorageLike = { getItem(k: string): string | null }

// Anything one of these holds means this browser used the council before the sheet existed.
const EARLIER_VISIT_KEYS = ['council:key', 'council:journal', 'council:discussions', 'council:ideas']

export function hadEarlierVisit(storage: StorageLike | null): boolean {
  try {
    return !!storage && EARLIER_VISIT_KEYS.some((k) => storage.getItem(k) !== null)
  } catch {
    return false
  }
}

function localStore(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

// Read when the module loads, before the beta door can write council:key on this visit.
const RETURNING_AT_LOAD = hadEarlierVisit(localStore())

const LABELS = { title: "What's new", close: 'Got it', all: 'All changes' }

const idle = (f: () => void) => {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  if (ric) ric(f)
  else setTimeout(f, 1)
}

export function useWhatsNew({
  view,
  gate,
  returning = RETURNING_AT_LOAD,
  mount = mountWhatsNew,
  later = idle,
  path = () => window.location.pathname,
  inFrame = () => window.self !== window.top,
}: {
  view: string
  gate: string
  returning?: boolean
  mount?: Mount
  later?: (f: () => void) => void
  path?: () => string
  inFrame?: () => boolean
}): void {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    if (view !== 'start') {
      done.current = true // left the start screen: a discussion may be under way
      return
    }
    if (gate !== 'ready') return // the door first
    done.current = true
    if (path() !== '/' || inFrame()) return
    later(() => mount({ release, track, returning, labels: LABELS }))
  }, [view, gate, returning, mount, later, path, inFrame])
}
