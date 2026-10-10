import { describe, expect, it, vi } from 'vitest'
import { EXPORT_TABLES, clearLocalState, exportFilename, fetchExport, shapeExport } from './account'

describe('account export', () => {
  it('shapes one JSON document with every table, empty arrays when a table had nothing', () => {
    const doc = shapeExport(
      { council_sessions: [{ id: 's1' }], council_journal: null, council_commitments: [], council_ideas: [{ id: 'i1' }] },
      'me@example.com',
      new Date('2026-10-10T12:00:00Z'),
    )
    expect(doc).toEqual({
      app: 'Mastermind Council',
      exported_at: '2026-10-10T12:00:00.000Z',
      email: 'me@example.com',
      sessions: [{ id: 's1' }],
      journal: [],
      commitments: [],
      ideas: [{ id: 'i1' }],
    })
  })

  it('names the file by date', () => {
    expect(exportFilename(new Date('2026-10-10T23:00:00Z'))).toBe('council-export-2026-10-10.json')
  })

  it('reads the four tables filtered to the user', async () => {
    const eq = vi.fn((_col: string, _id: string) => Promise.resolve({ data: [{ id: 'row' }], error: null }))
    const from = vi.fn(() => ({ select: () => ({ eq }) }))
    const rows = await fetchExport({ from } as never, 'u1')
    expect(from.mock.calls.map((c) => (c as unknown[])[0])).toEqual([...EXPORT_TABLES])
    expect(eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(rows.council_ideas).toEqual([{ id: 'row' }])
  })

  it('fails loudly when a table read fails, so nobody downloads a partial export', async () => {
    const from = vi.fn(() => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('rls') }) }) }))
    await expect(fetchExport({ from } as never, 'u1')).rejects.toThrow('rls')
  })
})

describe('clearLocalState', () => {
  it('clears everything but the beta password', () => {
    localStorage.setItem('council:key', 'pw')
    localStorage.setItem('council:journal', '{}')
    localStorage.setItem('sb-x-auth-token', 't')
    clearLocalState()
    expect(localStorage.length).toBe(1)
    expect(localStorage.getItem('council:key')).toBe('pw')
  })
})
