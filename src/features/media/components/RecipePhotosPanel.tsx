import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { BrowserMediaBlobCache } from '../browser/media-blob-cache'
import type { MediaUploadJob } from '../data/media-upload-queue'
import { PhotoReadRepository, type PhotoMetadata } from '../data/photo-read-repository'
import type { MediaRuntime } from '../media-runtime'
import { BlobImage } from './BlobImage'

interface RecipePhotosPanelProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  recipeId: string
  runtime: MediaRuntime
}

function statusLabel(job: MediaUploadJob): string {
  if (job.state === 'pending') return 'Aguardando upload'
  if (job.state === 'uploading') return 'Enviando…'
  return 'Falhou'
}

export function RecipePhotosPanel({ database, pairId, recipeId, runtime }: RecipePhotosPanelProps) {
  const repository = useMemo(() => new PhotoReadRepository(database, pairId), [database, pairId])
  const localCache = useMemo(() => new BrowserMediaBlobCache(), [])
  const [synced, setSynced] = useState<PhotoMetadata[]>([])
  const [jobs, setJobs] = useState<MediaUploadJob[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [nextSynced, allJobs] = await Promise.all([
        repository.listRecipePhotos(recipeId),
        runtime.listUploads(),
      ])
      setSynced(nextSynced)
      setJobs(allJobs.filter((job) => job.ownerType === 'recipe' && job.ownerId === recipeId && job.pairId === pairId))
      setError(null)
    } catch {
      setError('Não foi possível atualizar as fotos desta receita.')
    }
  }, [pairId, recipeId, repository, runtime])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const listener = database.registerListener({
      crudUpdate: () => void refresh(),
    } as Parameters<PowerSyncDatabase['registerListener']>[0]) as unknown
    return () => {
      if (typeof listener === 'function') listener()
    }
  }, [database, refresh])

  async function addPhoto(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!file) {
      setError('Escolha uma foto antes de adicionar.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const occupiedPositions = [
        ...synced.map((photo) => photo.position),
        ...jobs.map((job) => job.position),
      ]
      const position = occupiedPositions.length === 0 ? 0 : Math.max(...occupiedPositions) + 1
      await runtime.queuePhoto({
        file,
        pairId,
        ownerType: 'recipe',
        ownerId: recipeId,
        position,
        caption,
      })
      setFile(null)
      setCaption('')
      await refresh()
      if (navigator.onLine) {
        await runtime.drainUploads()
        await refresh()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar a foto.')
    } finally {
      setSaving(false)
    }
  }

  async function retry(job: MediaUploadJob): Promise<void> {
    setError(null)
    try {
      await runtime.retryUpload(job.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível tentar o upload novamente.')
    }
  }

  const syncedIds = new Set(synced.map((photo) => photo.id))
  const localOnlyJobs = jobs.filter((job) => !syncedIds.has(job.id))

  return (
    <section className="recipe-photos" aria-labelledby="recipe-photos-title">
      <div className="recipe-photos__heading">
        <div>
          <p className="route-kicker">Fotos</p>
          <h2 id="recipe-photos-title">Como ficou</h2>
        </div>
      </div>

      {(synced.length > 0 || localOnlyJobs.length > 0) ? (
        <div className="recipe-photos__grid">
          {synced.map((photo) => (
            <figure key={photo.id} className="recipe-photo">
              <BlobImage
                alt={photo.caption || 'Foto da receita'}
                load={() => runtime.resolveBlob(photo.id, photo.storagePath)}
              />
              {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
            </figure>
          ))}
          {localOnlyJobs.map((job) => (
            <figure key={job.id} className="recipe-photo recipe-photo--local">
              <BlobImage
                alt={job.caption || 'Foto da receita aguardando upload'}
                load={() => localCache.get(job.id)}
              />
              <figcaption>
                {job.caption ? <span>{job.caption}</span> : null}
                <strong>{statusLabel(job)}</strong>
                {job.state === 'failed' && job.lastError ? <span>{job.lastError}</span> : null}
                {job.state === 'failed' ? (
                  <button type="button" className="button button--quiet" aria-label={`Tentar novamente ${job.caption || 'foto'}`} onClick={() => void retry(job)}>
                    Tentar novamente
                  </button>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="recipe-photos__empty">Nenhuma foto adicionada ainda.</p>}

      <form className="recipe-photos__add" onSubmit={(event) => void addPhoto(event)}>
        <label>
          <span>Foto</span>
          <input
            aria-label="Arquivo da foto"
            type="file"
            accept="image/*"
            onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
          />
        </label>
        <label>
          <span>Legenda</span>
          <input aria-label="Legenda da foto" value={caption} maxLength={200} onChange={(event) => setCaption(event.currentTarget.value)} />
        </label>
        <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Adicionando…' : 'Adicionar foto'}</button>
      </form>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </section>
  )
}
