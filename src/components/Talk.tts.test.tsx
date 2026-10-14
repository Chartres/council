import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Item } from '@/domain/mastermind'
import { cancel } from '@/domain/tts'
import { Talk } from './Talk'

// Talk against the real tts queue: only the network, the player and the recogniser are fakes.

class Rec {
  static all: Rec[] = []
  continuous = false
  interimResults = false
  results: { transcript: string }[][] = []
  onresult: ((e: { results: unknown[] }) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    Rec.all.push(this)
  }
  say(text: string) {
    this.results.push([{ transcript: text }])
    this.onresult?.({ results: this.results.map((r) => Object.assign([...r], { isFinal: true })) })
  }
}

class Player {
  static all: Player[] = []
  srcs: string[] = []
  playbackRate = 1
  defaultPlaybackRate = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    Player.all.push(this)
  }
  set src(v: string) {
    this.srcs.push(v)
  }
  get src() {
    return this.srcs[this.srcs.length - 1] ?? ''
  }
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)))
const audio = () => ({ ok: true, headers: { get: () => 'audio/mpeg' }, blob: () => Promise.resolve(new Blob(['mp3'])) })

let n = 0
let pending: ((v: unknown) => void)[] = []
beforeEach(() => {
  Rec.all = []
  pending = []
  Object.defineProperty(window, 'SpeechRecognition', { value: Rec, configurable: true })
  vi.stubGlobal('Audio', Player)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} })
  vi.stubEnv('VITE_GATEWAY_URL', 'https://gw.test')
  // Downloads wait until the test releases them (a server that ignores the abort).
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => pending.push(() => resolve(audio())))))
})
afterEach(() => {
  cancel()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
})

const player = () => Player.all[0]!
const lines = () => player().srcs.filter((s) => s.startsWith('blob:'))

describe('Talk with the real speaker queue', () => {
  it('unlocks the shared player in the tap, and barge-in silences the line still downloading', async () => {
    let items: Item[] = []
    const view = () => <Talk on onChange={() => {}} items={items} streaming onSay={() => {}} />
    const { rerender } = render(view())
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    // Synchronously inside the tap, on the element every line will use.
    expect(player().play).toHaveBeenCalledTimes(1)
    expect(player().src).toMatch(/^data:audio\/wav/)

    items = [{ kind: 'contribution', speaker: 'drucker', text: 'Start with the customer. Who benefits? ', streaming: true }]
    rerender(view())
    await flush()
    expect(pending).toHaveLength(2) // both sentences downloading, nothing playing yet
    expect(screen.getByRole('status')).toHaveTextContent('Drucker is talking…')

    act(() => Rec.all[0]!.say('hold on'))
    pending.forEach((release) => release(undefined)) // the downloads land after the cut
    await flush()
    await flush()
    expect(lines()).toHaveLength(0)
    expect(Player.all).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Thinking…')
  })
})
