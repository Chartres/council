import { describe, expect, it } from 'vitest'
import { TAXONOMY } from './platform/flywheel-client'
import { KEY_ACTIONS } from './analytics'

// The shared events table (flywheel-core) only accepts allow-listed names; anything else is
// dropped silently by the insert policy, and the funnel goes blind without an error. This
// fails CI when code tracks a name outside the shared taxonomy.

const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const tracked = Object.entries(sources).flatMap(([file, text]) =>
  [...text.matchAll(/\btrack\(\s*['"]([^'"]+)['"]/g)].map((m) => ({ file, event: m[1] })),
)

describe('analytics contract', () => {
  it('finds the tracking calls it is guarding', () => {
    expect(tracked.length).toBeGreaterThan(3)
  })

  it('tracks only names in the shared taxonomy', () => {
    const off = tracked.filter((t) => !(TAXONOMY as readonly string[]).includes(t.event))
    expect(off).toEqual([])
  })

  it('names every key action it sends', () => {
    const actions = Object.values(sources).flatMap((text) =>
      [...text.matchAll(/\bkeyAction\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    )
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.filter((a) => !(KEY_ACTIONS as readonly string[]).includes(a))).toEqual([])
  })
})
