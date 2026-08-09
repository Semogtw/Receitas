import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReplacementCompletionScreen } from './ReplacementCompletionScreen'

const replacementUserId = '10000000-0000-4000-8000-000000000099'

function fakeClient(options: { session?: boolean; completionError?: boolean } = {}) {
  const updateUser = vi.fn(async () => ({ data: { user: { id: replacementUserId } }, error: null }))
  const invoke = vi.fn(async () => options.completionError
    ? { data: null, error: { message: 'failed' } }
    : { data: { pairId: '20000000-0000-4000-8000-000000000002' }, error: null })
  return {
    updateUser,
    invoke,
    client: {
      auth: {
        getSession: vi.fn(async () => options.session === false
          ? { data: { session: null }, error: null }
          : {
              data: {
                session: {
                  user: { id: replacementUserId, email: 'replacement@example.com' },
                },
              },
              error: null,
            }),
        updateUser,
      },
      functions: { invoke },
    },
  }
}

describe('ReplacementCompletionScreen', () => {
  it('requires an authenticated invite session before allowing activation', async () => {
    const fake = fakeClient({ session: false })
    render(<ReplacementCompletionScreen client={fake.client} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('não está mais autenticado')
    expect(screen.getByRole('button', { name: 'Ativar identidade substituta' })).toBeDisabled()
    expect(fake.updateUser).not.toHaveBeenCalled()
    expect(fake.invoke).not.toHaveBeenCalled()
  })

  it('sets the password first and then activates only the reserved replacement membership', async () => {
    const user = userEvent.setup()
    const fake = fakeClient()
    const onCompleted = vi.fn()
    render(<ReplacementCompletionScreen client={fake.client} onCompleted={onCompleted} />)

    expect(await screen.findByText(/replacement@example.com/)).toBeTruthy()
    await user.type(screen.getByLabelText('Nova senha'), 'senha-bem-forte-123')
    await user.type(screen.getByLabelText('Repetir nova senha'), 'senha-bem-forte-123')
    await user.click(screen.getByRole('button', { name: 'Ativar identidade substituta' }))

    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'senha-bem-forte-123' })
    expect(fake.invoke).toHaveBeenCalledWith('account-admin', {
      body: { action: 'complete_replacement' },
    })
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent('Identidade ativada')
  })

  it('does not call the administrative completion endpoint when password confirmation differs', async () => {
    const user = userEvent.setup()
    const fake = fakeClient()
    render(<ReplacementCompletionScreen client={fake.client} onCompleted={vi.fn()} />)

    await screen.findByText(/replacement@example.com/)
    await user.type(screen.getByLabelText('Nova senha'), 'senha-bem-forte-123')
    await user.type(screen.getByLabelText('Repetir nova senha'), 'senha-bem-forte-456')
    await user.click(screen.getByRole('button', { name: 'Ativar identidade substituta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('precisam ser iguais')
    expect(fake.updateUser).not.toHaveBeenCalled()
    expect(fake.invoke).not.toHaveBeenCalled()
  })

  it('keeps the invite session retryable if membership activation fails after password setup', async () => {
    const user = userEvent.setup()
    const fake = fakeClient({ completionError: true })
    render(<ReplacementCompletionScreen client={fake.client} onCompleted={vi.fn()} />)

    await screen.findByText(/replacement@example.com/)
    await user.type(screen.getByLabelText('Nova senha'), 'senha-bem-forte-123')
    await user.type(screen.getByLabelText('Repetir nova senha'), 'senha-bem-forte-123')
    await user.click(screen.getByRole('button', { name: 'Ativar identidade substituta' }))

    expect(fake.updateUser).toHaveBeenCalledTimes(1)
    expect(fake.invoke).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda não pôde ser ativada')
    expect(screen.getByLabelText('Nova senha')).toHaveValue('')
    expect(screen.getByLabelText('Repetir nova senha')).toHaveValue('')
  })
})
