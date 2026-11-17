import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountPanel } from './AccountPanel'

const user = { id: 'u1', email: 'me@example.com' }

/** The gateway's DELETE /v1/council/access (the approval record), answering `status`. */
let gateway = vi.fn()
const answer = (status: number) => {
  gateway = vi.fn(async () => new Response(null, { status }))
  vi.stubGlobal('fetch', gateway)
}
beforeEach(() => answer(204))
afterEach(() => vi.unstubAllGlobals())

async function confirmDelete() {
  await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }))
  await userEvent.type(screen.getByLabelText(/Type DELETE to confirm/), 'DELETE')
  await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }))
}

describe('AccountPanel delete', () => {
  it('asks for DELETE before calling council_delete_me, then clears local state', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const onDeleted = vi.fn()
    localStorage.setItem('council:journal', '{}')
    localStorage.setItem('council:key', 'pw')
    render(<AccountPanel sb={{ rpc } as never} user={user} token="jwt" onSignOut={() => {}} onDeleted={onDeleted} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }))
    const confirm = screen.getByRole('button', { name: 'Delete everything' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Type DELETE to confirm/), 'delete')
    expect(confirm).toBeDisabled()
    await userEvent.clear(screen.getByLabelText(/Type DELETE to confirm/))
    await userEvent.type(screen.getByLabelText(/Type DELETE to confirm/), 'DELETE')
    await userEvent.click(confirm)

    expect(rpc).toHaveBeenCalledWith('council_delete_me')
    expect(onDeleted).toHaveBeenCalled()
    expect(localStorage.getItem('council:journal')).toBeNull()
    expect(localStorage.getItem('council:key')).toBe('pw')
  })

  it('keeps everything and says so when the RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('nope') })
    const onDeleted = vi.fn()
    localStorage.setItem('council:journal', '{}')
    render(<AccountPanel sb={{ rpc } as never} user={user} token="jwt" onSignOut={() => {}} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }))
    await userEvent.type(screen.getByLabelText(/Type DELETE to confirm/), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }))
    expect(await screen.findByText(/Nothing was deleted/)).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(localStorage.getItem('council:journal')).toBe('{}')
  })

  it('deletes the approval record at the gateway first, with the bearer', async () => {
    const order: string[] = []
    gateway.mockImplementation(async () => (order.push('gateway'), new Response(null, { status: 204 })))
    const rpc = vi.fn(async () => (order.push('rpc'), { error: null }))
    render(<AccountPanel sb={{ rpc } as never} user={user} token="jwt" onSignOut={() => {}} onDeleted={() => {}} />)
    await confirmDelete()
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(order).toEqual(['gateway', 'rpc'])
    expect(gateway).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/council\/access$/),
      expect.objectContaining({ method: 'DELETE', headers: { authorization: 'Bearer jwt' } }),
    )
  })

  it('goes on when an older gateway does not know the route (404)', async () => {
    answer(404)
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const onDeleted = vi.fn()
    render(<AccountPanel sb={{ rpc } as never} user={user} token="jwt" onSignOut={() => {}} onDeleted={onDeleted} />)
    await confirmDelete()
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('council_delete_me')
  })

  it('stops, deleting nothing, when the gateway fails or cannot be reached', async () => {
    for (const fail of [() => answer(500), () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))]) {
      fail()
      const rpc = vi.fn().mockResolvedValue({ error: null })
      const onDeleted = vi.fn()
      const { unmount } = render(<AccountPanel sb={{ rpc } as never} user={user} token="jwt" onSignOut={() => {}} onDeleted={onDeleted} />)
      await confirmDelete()
      expect(await screen.findByText(/Nothing was deleted/)).toBeInTheDocument()
      expect(rpc).not.toHaveBeenCalled()
      expect(onDeleted).not.toHaveBeenCalled()
      unmount()
    }
  })
})
