import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => ({
  listRecipePhotos: vi.fn(),
  cacheGet: vi.fn(),
  registerListener: vi.fn((_listener: { crudUpdate(): void }) => vi.fn()),
}))

vi.mock('../data/photo-read-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/photo-read-repository')>()
  return {
    ...actual,
    PhotoReadRepository: class {
      listRecipePhotos = fakes.listRecipePhotos
    },
  }
})

vi.mock('../browser/media-blob-cache', () => ({
  BrowserMediaBlobCache: class {
    get = fakes.cacheGet
  },
}))

vi.mock('./BlobImage', () => ({
  BlobImage: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}))

import type { MediaUploadJob } from '../data/media-upload-queue'
import { RecipePhotosPanel } from './RecipePhotosPanel'

const pending: MediaUploadJob = {
  version: 1,
  id: 'photo-local',
  pairId: 'pair-a',
  ownerType: 'recipe',
  ownerId: 'recipe-a',
  mimeType: 'image/webp',
  extension: 'webp',
  width: 800,
  height: 600,
  sizeBytes: 100,
  position: 1,
  caption: 'Local',
  createdAt: '2026-08-07T20:00:00.000Z',
  state: 'pending',
  attempts: 0,
  lastError: null,
}

function runtimeFixture(jobs: MediaUploadJob[] = [pending]) {
  return {
    listUploads: vi.fn(async () => jobs),
    queuePhoto: vi.fn(async () => pending),
    drainUploads: vi.fn(async () => ({ uploadedCount: 0, stoppedOnFailure: false })),
    retryUpload: vi.fn(async () => ({ uploadedCount: 1, stoppedOnFailure: false })),
    resolveBlob: vi.fn(async () => new Blob(['remote'], { type: 'image/webp' })),
  }
}

describe('RecipePhotosPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakes.listRecipePhotos.mockResolvedValue([
      { id: 'photo-synced', storagePath: 'synced.webp', position: 0, caption: 'Sincronizada', createdAt: '2026-08-07T19:00:00.000Z' },
    ])
    fakes.cacheGet.mockResolvedValue(new Blob(['local'], { type: 'image/webp' }))
  })

  it('shows synced and pending local photos together with explicit upload state', async () => {
    const runtime = runtimeFixture()
    render(
      <RecipePhotosPanel
        database={{ registerListener: fakes.registerListener } as never}
        pairId="pair-a"
        actorUserId="user-a"
        recipeId="recipe-a"
        runtime={runtime as never}
      />,
    )

    expect(await screen.findByRole('img', { name: 'Sincronizada' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Local' })).toBeInTheDocument()
    expect(screen.getByText('Aguardando upload')).toBeInTheDocument()
  })

  it('deduplicates a queued job once the same photo id appears in synced metadata', async () => {
    fakes.listRecipePhotos.mockResolvedValue([
      { id: pending.id, storagePath: 'uploaded.webp', position: 1, caption: 'Local', createdAt: pending.createdAt },
    ])
    const runtime = runtimeFixture()
    render(
      <RecipePhotosPanel
        database={{ registerListener: fakes.registerListener } as never}
        pairId="pair-a"
        actorUserId="user-a"
        recipeId="recipe-a"
        runtime={runtime as never}
      />,
    )

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))
    expect(screen.queryByText('Aguardando upload')).not.toBeInTheDocument()
  })

  it('queues a selected file immediately and attempts a drain when online', async () => {
    const user = userEvent.setup()
    const runtime = runtimeFixture([])
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    render(
      <RecipePhotosPanel
        database={{ registerListener: fakes.registerListener } as never}
        pairId="pair-a"
        actorUserId="user-a"
        recipeId="recipe-a"
        runtime={runtime as never}
      />,
    )

    const file = new File(['image'], 'bolo.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Arquivo da foto'), file)
    await user.type(screen.getByLabelText('Legenda da foto'), 'Depois de assar')
    await user.click(screen.getByRole('button', { name: 'Adicionar foto' }))

    await waitFor(() => expect(runtime.queuePhoto).toHaveBeenCalledWith(expect.objectContaining({
      file,
      pairId: 'pair-a',
      ownerType: 'recipe',
      ownerId: 'recipe-a',
      caption: 'Depois de assar',
    })))
    expect(runtime.drainUploads).toHaveBeenCalled()
  })

  it('offers explicit retry for failed local uploads', async () => {
    const user = userEvent.setup()
    const failed = { ...pending, state: 'failed' as const, attempts: 1, lastError: 'offline' }
    const runtime = runtimeFixture([failed])
    render(
      <RecipePhotosPanel
        database={{ registerListener: fakes.registerListener } as never}
        pairId="pair-a"
        actorUserId="user-a"
        recipeId="recipe-a"
        runtime={runtime as never}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Tentar novamente Local' }))
    expect(runtime.retryUpload).toHaveBeenCalledWith(failed.id)
  })
})
