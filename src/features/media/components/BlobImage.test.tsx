import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BlobImage } from './BlobImage'

describe('BlobImage', () => {
  it('creates an object URL for a loaded blob and revokes it on unmount', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo-a')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const load = vi.fn(async () => new Blob(['image'], { type: 'image/webp' }))

    const view = render(<BlobImage alt="Bolo pronto" load={load} />)

    expect(await screen.findByAltText('Bolo pronto')).toHaveAttribute('src', 'blob:photo-a')
    expect(createObjectURL).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-a')
  })

  it('renders an explicit unavailable state instead of a broken image', async () => {
    render(<BlobImage alt="Foto do preparo" load={async () => null} />)

    await waitFor(() => expect(screen.getByText('Foto indisponível neste dispositivo.')).toBeInTheDocument())
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders a recoverable error message when loading fails', async () => {
    render(<BlobImage alt="Foto" load={async () => { throw new Error('offline') }} />)
    expect(await screen.findByText('Não foi possível carregar a foto agora.')).toBeInTheDocument()
  })
})
