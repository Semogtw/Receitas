import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { TrashRepository } from '../../trash/trash-repository'
import { SUPPORTED_SOURCE_IMAGE_ACCEPT } from '../browser/prepare-image'
import type { MediaUploadJob, MediaUploadOwnerType } from '../data/media-upload-queue'
import { PhotoReadRepository, type PhotoMetadata } from '../data/photo-read-repository'
import type { MediaRuntime } from '../media-runtime'
import { BlobImage } from './BlobImage'

interface OwnerPhotosPanelProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  ownerType: MediaUploadOwnerType
  ownerId: string
  runtime: MediaRuntime
  kicker: string
  title: string
  emptyText: string
}

function statusLabel(job: MediaUploadJob): string {
  if (job.state === 'pending') return 'Aguardando upload'
  if (job.state === 'uploading') return 'Enviando…'
  return 'Falhou'
}

function photoEntityType(ownerType: MediaUploadOwnerType): 'recipe_photos' | 'cooking_session_photos' {
  return ownerType === 'recipe' ? 'recipe_photos' : 'cooking_session_photos'
}

export function OwnerPhotosPanel({
  database,
  pairId,
  actorUserId,
  ownerType,
  ownerId,
  runtime,
  kicker,
  title,
  emptyText,
}: OwnerPhotosPanelProps) {
  const repository = useMemo(() => new PhotoReadRepository(database, pairId), [database, pairId])
  const trash = useMemo(
    () => new TrashRepository(database, { pairId, actorUserId }),
    [actorUserId, database, pairId],
  )
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [synced, setSynced] = useState<PhotoMetadata[]>([])
  const [jobs, setJobs] = useState<MediaUploadJob[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [nextSynced, allJobs] = await Promise.all([
        ownerType === 'recipe'
          ? repository.listRecipePhotos(ownerId)
          : repository.listCookingSessionPhotos(ownerId),
        runtime.listUploads(),
      ])
      setSynced(nextSynced)
      setJobs(allJobs.filter((job) => job.ownerType === ownerType && job.ownerId === ownerId && job.pairId === pairId))
      setError(null)
    } catch {
      setError('Não foi possível atualizar estas fotos.')
    }
  }, [ownerId, ownerType, pairId, repository, runtime])

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
        ownerType,
        ownerId,
        position,
        caption,
      })
      setFile(null)
      setCaption('')
      if (fileInputRef.current) fileInputRef.current.value = ''
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

  async function cancel(job: MediaUploadJob): Promise<void> {
    if (job.state === 'uploading') return
    setError(null)
    try {
      await runtime.cancelUpload(job.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar esta foto local.')
    }
  }

  async function moveSyncedToTrash(photo: PhotoMetadata): Promise<void> {
    setError(null)
    try {
      await trash.softDelete(photoEntityType(ownerType), photo.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível mover a foto para a lixeira.')
    }
  }

  const syncedIds = new Set(synced.map((photo) => photo.id))
  const localOnlyJobs = jobs.filter((job) => !syncedIds.has(job.id))
  const headingId = `${ownerType}-${ownerId}-photos-title`

  return (
    <section className="recipe-photos" aria-labelledby={headingId}>
      <div className="recipe-photos__heading">
        <div>
          <p className="route-kicker">{kicker}</p>
          <h2 id={headingId}>{title}</h2>
        </div>
      </div>

      {(synced.length > 0 || localOnlyJobs.length > 0) ? (
        <div className="recipe-photos__grid">
          {synced.map((photo) => (
            <figure key={photo.id} className="recipe-photo">
              <BlobImage
                alt={photo.caption || 'Foto'}
                load={() => runtime.resolveBlob(photo.id, photo.storagePath)}
              />
              <figcaption>
                {photo.caption ? <span>{photo.caption}</span> : null}
                <button
                  type="button"
                  className="button button--quiet"
                  aria-label={`Mover foto ${photo.caption || 'sem legenda'} para a lixeira`}
                  onClick={() => void moveSyncedToTrash(photo)}
                >Mover para a lixeira</button>
              </figcaption>
            </figure>
          ))}
          {localOnlyJobs.map((job) => (
            <figure key={job.id} className="recipe-photo recipe-photo--local">
              <BlobImage
                alt={job.caption || 'Foto aguardando upload'}
                load={() => runtime.getPendingBlob(job)}
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
                {job.state !== 'uploading' ? (
                  <button type="button" className="button button--quiet" aria-label={`Cancelar upload ${job.caption || 'foto'}`} onClick={() => void cancel(job)}>
                    Cancelar
                  </button>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="recipe-photos__empty">{emptyText}</p>}

      <form className="recipe-photos__add" onSubmit={(event) => void addPhoto(event)}>
        <label>
          <span>Foto</span>
          <input
            ref={fileInputRef}
            aria-label="Arquivo da foto"
            type="file"
            accept={SUPPORTED_SOURCE_IMAGE_ACCEPT}
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
