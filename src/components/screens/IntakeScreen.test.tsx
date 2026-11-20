import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntakeScreen } from './IntakeScreen'

const begin = vi.fn()
vi.mock('@/app/CouncilContext', () => ({ GATEWAY_URL: 'https://gw.test', useCouncil: () => ({ go: vi.fn(), councilKey: 'k', lockDoor: vi.fn() }) }))
vi.mock('@/app/MastermindContext', () => ({ useMastermind: () => ({ begin, lastIntake: null }) }))
const speak = vi.fn()
vi.mock('@/components/Listen', () => ({ speak: (...a: unknown[]) => speak(...a), cancel: vi.fn() }))
vi.mock('@/analytics', () => ({ keyAction: vi.fn() }))
const fake = await vi.hoisted(async () => (await import('@/test/fakeCapture')).fakeCaptures())
vi.mock('@/domain/capture', async (orig) => ({ ...(await orig<object>()), openCapture: fake.openCapture }))
vi.mock('@/domain/stt', async (orig) => ({ ...(await orig<object>()), recordingSupported: () => true }))
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ token: null }) }))

const reply = (intake: object) => new Response(JSON.stringify({ intake }), { status: 200 })

describe('IntakeScreen shortcuts', () => {
  it('puts the two shortcuts under the goal, before the primary button, once each; talking is a button of its own', () => {
    render(<IntakeScreen />)
    const row = screen.getByRole('group', { name: 'Shortcuts' })
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['Let your AI fill this in', 'Drop files'])
    const goal = screen.getByLabelText('What would you like the group to help you achieve?')
    const go = screen.getByRole('button', { name: 'Bring it to the group' })
    expect(goal.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.compareDocumentPosition(go) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const name of ['Ask your AI', 'Pick a file', 'Talk it through', 'Skip']) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Tap and talk' })).toHaveLength(1)
  })

  it('"Let your AI fill this in" opens the copyable prompt', async () => {
    render(<IntakeScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Let your AI fill this in' }))
    expect(screen.getByTestId('ai-prompt')).toHaveTextContent('Write UNKNOWN rather than guessing.')
  })

  it('"Drop files" opens a picker that takes several files', async () => {
    render(<IntakeScreen />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    await userEvent.click(screen.getByRole('button', { name: 'Drop files' }))
    expect(click).toHaveBeenCalled()
    expect(input.multiple).toBe(true)
  })

  it('files dropped on the goal are read in turn, merged, and the overflow lands in Materials', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ role: 'a'.repeat(900), goal: 'cut churn' }))
      .mockResolvedValueOnce(reply({ role: 'b'.repeat(300), situation: 'flat sales' }))
    vi.stubGlobal('fetch', fetch)
    render(<IntakeScreen />)
    const files = [
      new File(['x'], 'cv.pdf', { type: 'application/pdf' }),
      Object.defineProperty(new File(['x'], 'huge.pdf'), 'size', { value: 6e6 }),
      new File(['x'], 'plan.txt', { type: 'text/plain' }),
    ]
    fireEvent.drop(screen.getByLabelText('What would you like the group to help you achieve?'), { dataTransfer: { files } })
    await waitFor(() =>
      expect(screen.getByTestId('intake-note')).toHaveTextContent(
        'Read 2 files. Filled 3 of 7; the rest went to Materials. Skipped huge.pdf: over 5 MB.',
      ),
    )
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Who are you professionally?')).toHaveValue(`${'a'.repeat(900)}\n\n${'b'.repeat(98)}`)
    expect(screen.getByLabelText('Materials')).toHaveValue(`Role: ${'b'.repeat(202)}`)
    await userEvent.click(screen.getByRole('button', { name: 'Bring it to the group' }))
    expect(begin.mock.calls[0][0]).toMatchObject({ goal: 'cut churn', materials: `Role: ${'b'.repeat(202)}` })
    vi.unstubAllGlobals()
  })

  const goal = () => screen.getByLabelText('What would you like the group to help you achieve?')
  const pdf = (name: string) => new File(['x'], name, { type: 'application/pdf' })
  const fail = (status: number, body: object) => new Response(JSON.stringify(body), { status })

  it('keeps what she types while a file is read, and ignores a second drop mid-read', async () => {
    let release!: (r: Response) => void
    const fetch = vi.fn().mockReturnValueOnce(new Promise<Response>((r) => (release = r)))
    vi.stubGlobal('fetch', fetch)
    render(<IntakeScreen />)
    fireEvent.drop(goal(), { dataTransfer: { files: [pdf('cv.pdf')] } })
    await waitFor(() => expect(screen.getByTestId('intake-note')).toHaveTextContent('Reading…'))
    fireEvent.drop(goal(), { dataTransfer: { files: [pdf('again.pdf')] } })
    fireEvent.change(screen.getByLabelText('What is happening today?'), { target: { value: 'typed meanwhile' } })
    release(reply({ role: 'CFO' }))
    await waitFor(() => expect(screen.getByLabelText('Who are you professionally?')).toHaveValue('CFO'))
    expect(screen.getByLabelText('What is happening today?')).toHaveValue('typed meanwhile')
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('a file that cannot be read is skipped by name and the rest are still read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(fail(503, { error: 'no_converter' })).mockResolvedValueOnce(reply({ role: 'CFO' })))
    render(<IntakeScreen />)
    fireEvent.drop(goal(), { dataTransfer: { files: [pdf('scan.pdf'), pdf('cv.pdf')] } })
    await waitFor(() =>
      expect(screen.getByTestId('intake-note')).toHaveTextContent('Filled 1 of 7. Check them below. Skipped scan.pdf: could not be read.'),
    )
    expect(screen.getByLabelText('Who are you professionally?')).toHaveValue('CFO')
    vi.unstubAllGlobals()
  })

  it('quota stops the batch', async () => {
    const fetch = vi.fn().mockResolvedValue(fail(429, { reason: 'quota' }))
    vi.stubGlobal('fetch', fetch)
    render(<IntakeScreen />)
    fireEvent.drop(goal(), { dataTransfer: { files: [pdf('a.pdf'), pdf('b.pdf')] } })
    await waitFor(() => expect(screen.getByTestId('intake-note')).toHaveTextContent('That is enough reading for today.'))
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('says so when Materials is cut at 8,000', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ role: 'CFO', materials: 'x'.repeat(5000) })))
    render(<IntakeScreen />)
    fireEvent.drop(goal(), { dataTransfer: { files: [pdf('a.pdf'), pdf('b.pdf')] } })
    await waitFor(() => expect(screen.getByTestId('intake-note')).toHaveTextContent('Materials was cut at 8,000 characters.'))
    expect((screen.getByLabelText('Materials') as HTMLTextAreaElement).value).toHaveLength(8000)
    vi.unstubAllGlobals()
  })
})

// Pavol, 20 Nov: "the primary journey here is you come in… I just start talking." And: "The
// functionality of seeing the text and correcting it is super important."
describe('IntakeScreen: tap and talk', () => {
  const GOAL = 'What would you like the group to help you achieve?'
  const goal = () => screen.getByLabelText(GOAL) as HTMLTextAreaElement
  const mic = () => screen.getByTestId('mic')
  beforeEach(() => {
    fake.reset()
    speak.mockClear()
    begin.mockClear()
  })

  it('one tap on the first screen opens the mic inside the tap; the question is not read aloud first', () => {
    fake.state.hold = true
    render(<IntakeScreen />)
    expect(mic()).toHaveTextContent('Tap and talk')
    expect(mic()).not.toHaveClass('slab-off') // the screen's one action while the goal is empty
    fireEvent.click(mic())
    expect(fake.openCapture).toHaveBeenCalledTimes(1) // before the click returned, not in a later effect
    expect(speak).not.toHaveBeenCalled()
    expect(screen.getByTestId('capture-status')).toHaveTextContent('Waiting for the microphone. Nothing is recorded yet.')
  })

  it('his words land in the goal as they arrive; nothing moves on by itself and nothing is sent', async () => {
    vi.useFakeTimers()
    render(<IntakeScreen />)
    fireEvent.click(mic())
    await act(async () => {})
    act(() => fake.last().say('Decide whether to pilot the tier'))
    expect(goal().value).toBe('Decide whether to pilot the tier')
    act(() => vi.advanceTimersByTime(120_000)) // he thinks
    expect(fake.last().finish).not.toHaveBeenCalled()
    expect(fake.last().retarget).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Bring it to the group' })).toBeDisabled()
    vi.useRealTimers()

    await act(async () => fireEvent.click(mic())) // Finish
    expect(fake.last().finish).toHaveBeenCalledTimes(1)
    expect(begin).not.toHaveBeenCalled()

    // The text is an ordinary field: he corrects it, and the corrected text is what goes.
    fireEvent.change(goal(), { target: { value: 'Decide whether to pilot the premium tier' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bring it to the group' }))
    expect(begin).toHaveBeenCalledWith(expect.objectContaining({ goal: 'Decide whether to pilot the premium tier' }))
  })

  it('Next question moves the same open mic to the next empty field', async () => {
    render(<IntakeScreen />)
    fireEvent.click(mic())
    await act(async () => {})
    act(() => fake.last().say('Cut churn'))
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(fake.openCapture).toHaveBeenCalledTimes(1)
    expect(fake.last().retarget).toHaveBeenCalledTimes(1)
    act(() => fake.last().say('Churn is four percent'))
    expect(goal().value).toBe('Cut churn')
    expect((screen.getByLabelText('What is happening today?') as HTMLTextAreaElement).value).toBe('Churn is four percent')
    expect(screen.getAllByTestId('mic')).toHaveLength(1) // one Finish, beside the field being filled
    expect(screen.getByTestId('voice-bar')).toHaveTextContent('What is happening today?')
  })

  it('the mic taken away at a later question: the next tap carries on at that question', async () => {
    render(<IntakeScreen />)
    fireEvent.click(mic())
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    await act(async () => fake.last().lose())
    expect(screen.getByRole('alert')).toHaveTextContent('The microphone stopped when you left the page. Tap to carry on.')
    expect(screen.getByTestId('voice-bar')).toHaveTextContent('What is happening today?')
    fireEvent.click(mic())
    await act(async () => {})
    act(() => fake.last().say('Churn is four percent'))
    expect((screen.getByLabelText('What is happening today?') as HTMLTextAreaElement).value).toBe('Churn is four percent')
    expect(goal().value).toBe('')
  })

  it('"Writing it down…" stays under the field the part belongs to, and Next question visits an answered field', async () => {
    render(<IntakeScreen />)
    fireEvent.change(screen.getByLabelText('What is happening today?'), { target: { value: 'Churn is four percent.' } })
    fireEvent.click(mic())
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(screen.getByTestId('voice-bar')).toHaveTextContent('What is happening today?') // answered, and still visited
    act(() => fake.last().ev.onPending(1))
    await act(async () => fireEvent.click(mic())) // Finish, with a part still out
    expect(screen.getByTestId('voice-bar')).toHaveTextContent('What is happening today?')
    expect(screen.getByTestId('capture-writing')).toBeInTheDocument()
    act(() => fake.last().say('It was three in March'))
    expect((screen.getByLabelText('What is happening today?') as HTMLTextAreaElement).value).toBe('Churn is four percent. It was three in March')
  })

  it('recording again adds to a goal he already wrote', async () => {
    render(<IntakeScreen />)
    fireEvent.change(goal(), { target: { value: 'Cut churn.' } })
    expect(mic()).toHaveClass('slab-off') // now "Bring it to the group" is the one action
    fireEvent.click(mic())
    await act(async () => {})
    act(() => fake.last().say('Without discounting'))
    expect(goal().value).toBe('Cut churn. Without discounting')
  })
})

describe('IntakeScreen order', () => {
  it('lists About you in the order the walk asks it', () => {
    render(<IntakeScreen />)
    const list = screen.getByRole('list', { name: 'Your context' })
    expect(within(list).getAllByRole('textbox').map((t) => t.getAttribute('aria-label')).filter(Boolean)).toEqual([
      'What is happening today?',
      'What would a successful outcome look like?',
      'What constraints should the group understand?',
      'Who are you professionally?',
      'Where do you work?',
      'How would you like the group to work with you?',
    ])
  })
})
