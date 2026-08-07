import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the recipes route as the application entry point', async () => {
    window.history.replaceState({}, '', '/recipes')
    render(<App />)

    expect(await screen.findByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Receitas' })).toBeInTheDocument()
  })
})
