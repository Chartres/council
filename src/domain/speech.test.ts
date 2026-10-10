import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERSONA_IDS, PERSONAS } from '@/content/personas'
import {
  personaVoice,
  pickVoice,
  recognitionCtor,
  synthesisAvailable,
  transcriptOf,
} from './speech'

afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ['SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis'] as const) {
    delete (window as unknown as Record<string, unknown>)[k]
  }
})

const stub = (name: string, value: unknown) =>
  Object.defineProperty(window, name, { value, configurable: true, writable: true })

describe('availability guards', () => {
  it('reports no recognition when neither global exists', () => {
    expect(recognitionCtor()).toBeNull()
  })

  it('finds the standard global and the webkit one', () => {
    const Std = class {}
    stub('SpeechRecognition', Std)
    expect(recognitionCtor()).toBe(Std)
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    const Webkit = class {}
    stub('webkitSpeechRecognition', Webkit)
    expect(recognitionCtor()).toBe(Webkit)
  })

  it('reports speechSynthesis only when the browser has it', () => {
    expect(synthesisAvailable()).toBe(false)
    stub('speechSynthesis', { speak: () => {}, cancel: () => {}, getVoices: () => [] })
    expect(synthesisAvailable()).toBe(true)
  })
})

describe('transcriptOf', () => {
  it('joins final and interim alternatives in order', () => {
    const results = [
      Object.assign([{ transcript: 'Leaving my job ' }], { isFinal: true }),
      Object.assign([{ transcript: 'to build a tool' }], { isFinal: false }),
    ]
    expect(transcriptOf({ results })).toBe('Leaving my job to build a tool')
  })
})

describe('personaVoice', () => {
  it('is deterministic per persona id', () => {
    expect(personaVoice('seneca')).toEqual(personaVoice('seneca'))
  })

  it('stays inside a human range', () => {
    for (const p of PERSONAS) {
      const { pitch, rate } = personaVoice(p.id)
      expect(pitch).toBeGreaterThanOrEqual(0.8)
      expect(pitch).toBeLessThanOrEqual(1.2)
      expect(rate).toBeGreaterThanOrEqual(0.9)
      expect(rate).toBeLessThanOrEqual(1.1)
    }
  })

  it('gives the default three audibly different settings', () => {
    const settings = DEFAULT_PERSONA_IDS.map((id) => JSON.stringify(personaVoice(id)))
    expect(new Set(settings).size).toBe(DEFAULT_PERSONA_IDS.length)
  })
})

describe('pickVoice', () => {
  it('prefers an English voice and gives up gracefully', () => {
    expect(pickVoice([{ lang: 'sk-SK' }, { lang: 'en-GB' }])).toEqual({ lang: 'en-GB' })
    expect(pickVoice([{ lang: 'sk-SK' }])).toBeUndefined()
    expect(pickVoice([])).toBeUndefined()
  })

  it('ranks human-sounding voices above the robotic default', () => {
    const voices = [
      { lang: 'en-US', name: 'Fred' },
      { lang: 'en-US', name: 'Samantha' },
      { lang: 'en-US', name: 'Google US English' },
      { lang: 'en-GB', name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)' },
      { lang: 'de-DE', name: 'Anna' },
    ]
    expect(pickVoice(voices)?.name).toMatch(/Natural/)
    expect(pickVoice(voices.slice(0, 3))?.name).toBe('Google US English')
    expect(pickVoice(voices.slice(0, 2))?.name).toBe('Samantha')
    expect(pickVoice(voices.slice(0, 1))?.name).toBe('Fred')
  })
})
