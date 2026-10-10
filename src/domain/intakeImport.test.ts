import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_PROMPT,
  LINKEDIN_HINT,
  URL_HINT,
  classifyInput,
  extractIntake,
  fileProblem,
  parseHeadings,
} from './intakeImport'

describe('parseHeadings', () => {
  it('maps our headings to fields, case-insensitive, values spanning lines', () => {
    const reply = [
      'Sure, here it is.',
      '',
      'ROLE: Head of product, 8 years in B2B SaaS.',
      'organization: A 40-person software company',
      'serving logistics firms.',
      '**Goal:** decide whether to pilot a premium tier',
      'Situation: UNKNOWN',
      'WORKING_STYLE: challenge me',
    ].join('\n')
    expect(parseHeadings(reply)).toEqual({
      role: 'Head of product, 8 years in B2B SaaS.',
      organization: 'A 40-person software company\nserving logistics firms.',
      goal: 'decide whether to pilot a premium tier',
      working_style: 'challenge me',
    })
  })

  it('accepts "working style" with a space and caps each field at 1,000 characters', () => {
    const out = parseHeadings(`Role: CFO\nWorking style: explore\nSuccess: ${'x'.repeat(1500)}`)
    expect(out?.working_style).toBe('explore')
    expect(out?.success).toHaveLength(1000)
  })

  it('returns null for text that does not follow the headings', () => {
    expect(parseHeadings('I run product at a SaaS company. Role: unclear.')).toBeNull()
    expect(parseHeadings('Goal: one heading is not a reply')).toBeNull()
  })
})

describe('classifyInput', () => {
  it('empty text does nothing', () => {
    expect(classifyInput('   ')).toEqual({ kind: 'empty' })
  })

  it('a LinkedIn URL gets the save-to-PDF hint, no request', () => {
    expect(classifyInput('https://www.linkedin.com/in/someone/')).toEqual({ kind: 'hint', message: LINKEDIN_HINT })
    expect(classifyInput('linkedin.com/in/someone')).toEqual({ kind: 'hint', message: LINKEDIN_HINT })
  })

  it('any other bare URL gets the generic hint', () => {
    expect(classifyInput(' https://example.com/about ')).toEqual({ kind: 'hint', message: URL_HINT })
    expect(classifyInput('www.example.org')).toEqual({ kind: 'hint', message: URL_HINT })
  })

  it('headed text parses locally; anything else goes to the gateway', () => {
    expect(classifyInput('ROLE: CFO\nGOAL: cut churn')).toEqual({ kind: 'parsed', intake: { role: 'CFO', goal: 'cut churn' } })
    expect(classifyInput('I am a CFO and want to cut churn.')).toEqual({ kind: 'extract', text: 'I am a CFO and want to cut churn.' })
  })
})

describe('fileProblem', () => {
  it('accepts PDF, DOCX and TXT up to 5 MB', () => {
    expect(fileProblem({ name: 'cv.pdf', size: 1000 })).toBeNull()
    expect(fileProblem({ name: 'CV.DOCX', size: 1000 })).toBeNull()
    expect(fileProblem({ name: 'notes.txt', size: 5 * 1024 * 1024 })).toBeNull()
  })
  it('refuses other types and bigger files', () => {
    expect(fileProblem({ name: 'photo.png', size: 10 })).toMatch(/PDF, DOCX or TXT/)
    expect(fileProblem({ name: 'cv.pdf', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
  })
})

describe('AI_PROMPT', () => {
  it('names the seven headings and the rules', () => {
    for (const h of ['ROLE:', 'ORGANIZATION:', 'GOAL:', 'SITUATION:', 'SUCCESS:', 'CONSTRAINTS:', 'WORKING_STYLE:']) {
      expect(AI_PROMPT).toContain(h)
    }
    expect(AI_PROMPT).toContain('Write UNKNOWN rather than guessing.')
    expect(AI_PROMPT).toContain('Keep each under 1,000 characters.')
    expect(AI_PROMPT).toContain('Describe companies and people in general terms, no names.')
  })
})

describe('extractIntake', () => {
  const opts = { gatewayUrl: 'https://gw.test', councilKey: 'k', token: null }
  afterEach(() => vi.unstubAllGlobals())

  const respond = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue(new Response(body === null ? null : JSON.stringify(body), { status }))

  it('posts text as JSON with the council key and keeps only known, non-empty fields', async () => {
    const fetch = respond(200, { intake: { role: 'CFO', goal: 'UNKNOWN', hack: 'x', success: 42 }, unknown: ['goal'] })
    vi.stubGlobal('fetch', fetch)
    await expect(extractIntake('I am a CFO', opts)).resolves.toEqual({ role: 'CFO' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://gw.test/v1/intake/extract')
    expect(init.headers['x-council-key']).toBe('k')
    expect(init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ text: 'I am a CFO' })
  })

  it('posts a file as multipart, letting the browser set the boundary', async () => {
    const fetch = respond(200, { intake: { role: 'Engineer' }, unknown: [] })
    vi.stubGlobal('fetch', fetch)
    const file = new File(['hello'], 'cv.txt', { type: 'text/plain' })
    await expect(extractIntake(file, opts)).resolves.toEqual({ role: 'Engineer' })
    const init = fetch.mock.calls[0][1]
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
    expect(init.headers['content-type']).toBeUndefined()
  })

  it('maps 429, no_converter and the password door to named failures', async () => {
    vi.stubGlobal('fetch', respond(429, { reason: 'quota' }))
    await expect(extractIntake('x', opts)).rejects.toMatchObject({ code: 'quota' })
    vi.stubGlobal('fetch', respond(503, { error: 'no_converter' }))
    await expect(extractIntake('x', opts)).rejects.toMatchObject({ code: 'no_converter' })
    vi.stubGlobal('fetch', respond(401, { reason: 'password' }))
    await expect(extractIntake('x', opts)).rejects.toMatchObject({ code: 'password' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(extractIntake('x', opts)).rejects.toMatchObject({ code: 'gateway' })
  })
})
