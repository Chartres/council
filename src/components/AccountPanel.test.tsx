import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountPanel } from './AccountPanel'

const user = { id: 'u1', email: 'me@example.com' }

describe('AccountPanel delete', () => {
  it('asks for DELETE before calling council_delete_me, then clears local state', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const onDeleted = vi.fn()
    localStorage.setItem('council:journal', '{}')
    localStorage.setItem('council:key', 'pw')
    render(<AccountPanel sb={{ rpc } as never} user={user} onSignOut={() => {}} onDeleted={onDeleted} />)

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
    render(<AccountPanel sb={{ rpc } as never} user={user} onSignOut={() => {}} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }))
    await userEvent.type(screen.getByLabelText(/Type DELETE to confirm/), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }))
    expect(await screen.findByText(/Nothing was deleted/)).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(localStorage.getItem('council:journal')).toBe('{}')
  })
})
