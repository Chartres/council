import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { hadEarlierVisit, useWhatsNew, type Mount } from './whatsNew'

function storage(init: Record<string, string> = {}) {
  return { getItem: (k: string) => init[k] ?? null }
}

describe('hadEarlierVisit — the first sheet reaches people who used the council before it existed', () => {
  it('nothing of ours stored: a new reader', () => {
    expect(hadEarlierVisit(storage())).toBe(false)
    expect(hadEarlierVisit(storage({ 'fw:whats-new': '1.0.0' }))).toBe(false)
  })
  it.each(['council:key', 'council:journal', 'council:discussions', 'council:ideas'])('%s stored: returning', (key) => {
    expect(hadEarlierVisit(storage({ [key]: 'x' }))).toBe(true)
  })
  it('blocked storage: not returning (the kit then shows nothing anyway)', () => {
    expect(hadEarlierVisit(null)).toBe(false)
    expect(
      hadEarlierVisit({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe(false)
  })
})

type Props = { view: string; gate: string }

function setup(initial: Props, opts: { path?: string; inFrame?: boolean } = {}) {
  const mount: Mount = vi.fn(() => ({ shown: true, close: () => {} }))
  const later = (f: () => void) => f()
  const hook = renderHook((p: Props) => useWhatsNew({ ...p, returning: true, mount, later, path: () => opts.path ?? '/', inFrame: () => !!opts.inFrame }), {
    initialProps: initial,
  })
  return { mount, ...hook }
}

describe('useWhatsNew — only on the start screen, never over a discussion or the door', () => {
  it('mounts once on the start screen past the door, with the returning flag and English labels', () => {
    const { mount, rerender } = setup({ view: 'start', gate: 'ready' })
    expect(mount).toHaveBeenCalledTimes(1)
    expect(mount).toHaveBeenCalledWith(
      expect.objectContaining({ returning: true, labels: { title: "What's new", close: 'Got it', all: 'All changes' } }),
    )
    rerender({ view: 'journal', gate: 'ready' })
    rerender({ view: 'start', gate: 'ready' })
    expect(mount).toHaveBeenCalledTimes(1)
  })
  it('waits at the beta door, then mounts once the door opens on the start screen', () => {
    const { mount, rerender } = setup({ view: 'start', gate: 'ask' })
    expect(mount).not.toHaveBeenCalled()
    rerender({ view: 'start', gate: 'ready' })
    expect(mount).toHaveBeenCalledTimes(1)
  })
  it.each(['intake', 'conversation', 'session', 'journal', 'home', 'ideas', 'privacy'])('never on %s', (view) => {
    const { mount } = setup({ view, gate: 'ready' })
    expect(mount).not.toHaveBeenCalled()
  })
  it('once this load has left the start screen (a discussion may be going on), not until the next load', () => {
    const { mount, rerender } = setup({ view: 'start', gate: 'ask' })
    rerender({ view: 'conversation', gate: 'ask' })
    rerender({ view: 'start', gate: 'ready' })
    expect(mount).not.toHaveBeenCalled()
  })
  it('not on the reminder deep link (/c/:id lands on the start view to record an outcome)', () => {
    const { mount } = setup({ view: 'start', gate: 'ready' }, { path: '/c/abc' })
    expect(mount).not.toHaveBeenCalled()
  })
  it('not inside a frame', () => {
    const { mount } = setup({ view: 'start', gate: 'ready' }, { inFrame: true })
    expect(mount).not.toHaveBeenCalled()
  })
})
