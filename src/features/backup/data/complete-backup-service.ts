import type { PowerSyncDatabase } from '@powersync/web'
import type { BackupArtifact } from '../domain/complete-backup-format'
import { createCompleteBackupArtifact, prepareCompleteBackup, type CompleteBackupMediaFile } from './complete-backup-archive'
import { BackupRequiresSyncError, captureCompleteBackupSnapshot } from './complete-backup-snapshot'
import { backfillPhotoDigestIfNeeded } from './photo-digest-backfill'

export interface CompleteBackupMediaDownloader {
  download(path: string): Promise<Blob>
}

export interface CompleteBackupProgress {
  stage: 'snapshot' | 'media' | 'archive'
  completed: number
  total: number
}

export async function createCompleteBackup(input: {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  appVersion: string
  mediaDownloader: CompleteBackupMediaDownloader
  onProgress?: (progress: CompleteBackupProgress) => void
}): Promise<BackupArtifact> {
  input.onProgress?.({ stage: 'snapshot', completed: 0, total: 1 })
  const snapshot = await captureCompleteBackupSnapshot(input.database, input.pairId)
  input.onProgress?.({ stage: 'snapshot', completed: 1, total: 1 })

  const legacyPhotos = snapshot.photos.filter(
    (photo) => photo.sha256 === null || photo.byte_size === null || photo.byte_size === undefined,
  )
  if (legacyPhotos.length > 0) {
    let backfilled = 0
    for (const [index, photo] of legacyPhotos.entries()) {
      input.onProgress?.({ stage: 'media', completed: index, total: legacyPhotos.length })
      const blob = await input.mediaDownloader.download(photo.storage_path)
      if (await backfillPhotoDigestIfNeeded({
        database: input.database,
        scope: { pairId: input.pairId, actorUserId: input.actorUserId },
        photo,
        blob,
      })) {
        backfilled += 1
      }
    }
    input.onProgress?.({ stage: 'media', completed: legacyPhotos.length, total: legacyPhotos.length })
    throw new BackupRequiresSyncError(
      `${backfilled} foto(s) antiga(s) tiveram checksum/tamanho preenchidos. Sincronize essas metadata e tente o backup novamente.`,
    )
  }

  const mediaFiles: CompleteBackupMediaFile[] = []
  for (const [index, photo] of snapshot.photos.entries()) {
    input.onProgress?.({ stage: 'media', completed: index, total: snapshot.photos.length })
    const blob = await input.mediaDownloader.download(photo.storage_path)
    mediaFiles.push({
      id: photo.id,
      blob,
      mediaType: photo.mime_type,
      expectedSha256: photo.sha256,
    })
  }
  input.onProgress?.({ stage: 'media', completed: snapshot.photos.length, total: snapshot.photos.length })

  input.onProgress?.({ stage: 'archive', completed: 0, total: 1 })
  const prepared = await prepareCompleteBackup({
    snapshot,
    mediaFiles,
    appVersion: input.appVersion,
  })
  const artifact = await createCompleteBackupArtifact(prepared)
  input.onProgress?.({ stage: 'archive', completed: 1, total: 1 })
  return artifact
}
