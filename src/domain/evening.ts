// The hour the evening examination opens on the Journal (docs/SIGNATURE.md, Pavol 30 Oct:
// "User-set", "Default 17:30"). Kept on this device as "HH:MM", local time.

export const EVENING_STORAGE = 'council:evening'
export const DEFAULT_EVENING = '17:30'

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** A stored or typed value → "HH:MM"; anything unreadable, or nothing, is the default. */
export function eveningOf(v: string | null | undefined): string {
  return v && HHMM.test(v) ? v : DEFAULT_EVENING
}

/** True from that minute of the local day onwards. */
export function isEvening(now: Date, hhmm: string): boolean {
  const [h, m] = eveningOf(hhmm).split(':').map(Number)
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m
}

export function readEvening(storage: Storage = localStorage): string {
  try {
    return eveningOf(storage.getItem(EVENING_STORAGE))
  } catch {
    return DEFAULT_EVENING
  }
}

export function writeEvening(hhmm: string, storage: Storage = localStorage) {
  try {
    storage.setItem(EVENING_STORAGE, eveningOf(hhmm))
  } catch {
    // Private mode: the hour holds for this visit only.
  }
}
