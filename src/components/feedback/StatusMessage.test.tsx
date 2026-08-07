import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusMessage } from './StatusMessage'

describe('StatusMessage', () => {
  it('announces errors without relying on color alone', () => {
    render(<StatusMessage tone="error">Falha ao sincronizar</StatusMessage>)
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao sincronizar')
    expect(screen.getByText('Erro')).toBeInTheDocument()
  })

  it('uses a polite status role for non-error information', () => {
    render(<StatusMessage tone="success">Sincronizado</StatusMessage>)
    expect(screen.getByRole('status')).toHaveTextContent('Sincronizado')
  })
})
