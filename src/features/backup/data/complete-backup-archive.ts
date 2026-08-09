import { BlobReader, BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js'
import {
  backupFilename,
  createBackupManifest,
  encodeBackupJson,
  sha256Hex,
  type BackupArtifact,
  type BackupFileDescriptor,
  type BackupMediaFileDescriptor,
  type BackupManifest,
} from '../domain/complete-backup-format'
import type { CompleteBackupSnapshot } from './complete-backup-snapshot'

export const MAX_BLOB_BACKUP_BYTES = 128 * 1024 * 1024

export interface CompleteBackupMediaFile {
  id: string
  blob: Blob
  mediaType: string
  expectedSha256: string | null
}

export interface PreparedCompleteBackup {
  manifest: BackupManifest
  data: Array<{ path: string; bytes: Uint8Array }>
  media: Array<{ path: string; blob: Blob }>
}

interface OpfsFileHandleLike {
  createWritable(): Promise<WritableStream<Uint8Array>>
  getFile(): Promise<File>
}

interface OpfsDirectoryHandleLike {
  getFileHandle(name: string, options: { create: true }): Promise<OpfsFileHandleLike>
}

interface OpfsStorageManagerLike {
  getDirectory?: () => Promise<OpfsDirectoryHandleLike>
}

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

function safeMediaPath(id: string, mediaType: string): string {
  if (!/^[0-9a-zA-Z_-]+$/.test(id)) throw new Error(`Invalid backup media id: ${id}`)
  const extension = EXTENSION_BY_MEDIA_TYPE[mediaType]
  if (!extension) throw new Error(`Unsupported backup media type: ${mediaType}`)
  return `media/${id}.${extension}`
}

async function descriptorForData(path: string, bytes: Uint8Array): Promise<BackupFileDescriptor> {
  return {
    path,
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes),
  }
}

async function descriptorForMedia(file: CompleteBackupMediaFile): Promise<BackupMediaFileDescriptor & { path: string }> {
  if (file.blob.type && file.blob.type !== file.mediaType) {
    throw new Error(`Downloaded media MIME type mismatch for ${file.id}`)
  }
  const bytes = await file.blob.arrayBuffer()
  const sha256 = await sha256Hex(bytes)
  if (file.expectedSha256 && sha256 !== file.expectedSha256) {
    throw new Error(`Downloaded media checksum mismatch for ${file.id}`)
  }
  return {
    path: safeMediaPath(file.id, file.mediaType),
    mediaType: file.mediaType,
    bytes: file.blob.size,
    sha256,
  }
}

export async function prepareCompleteBackup(input: {
  snapshot: CompleteBackupSnapshot
  mediaFiles: readonly CompleteBackupMediaFile[]
  appVersion: string
  pairExportId?: string
}): Promise<PreparedCompleteBackup> {
  const mediaById = new Map(input.mediaFiles.map((file) => [file.id, file]))
  if (mediaById.size !== input.mediaFiles.length) throw new Error('Complete backup media ids must be unique')

  const expectedIds = new Set(input.snapshot.photos.map((photo) => photo.id))
  for (const id of mediaById.keys()) {
    if (!expectedIds.has(id)) throw new Error(`Downloaded media ${id} has no canonical photo metadata`)
  }
  for (const id of expectedIds) {
    if (!mediaById.has(id)) throw new Error(`Complete backup is missing downloaded media ${id}`)
  }

  const dataFiles = await Promise.all(
    input.snapshot.dataEntries.map((entry) => descriptorForData(entry.path, entry.bytes)),
  )
  const mediaDescriptors = await Promise.all(
    input.snapshot.photos.map(async (photo) => {
      const file = mediaById.get(photo.id)!
      if (file.mediaType !== photo.mime_type) throw new Error(`Canonical media type mismatch for ${photo.id}`)
      return descriptorForMedia(file)
    }),
  )

  const manifest = createBackupManifest({
    createdAt: input.snapshot.createdAt,
    appVersion: input.appVersion,
    pairExportId: input.pairExportId ?? crypto.randomUUID(),
    dataFiles,
    mediaFiles: mediaDescriptors,
  })

  return {
    manifest,
    data: input.snapshot.dataEntries.map((entry) => ({ path: entry.path, bytes: entry.bytes })),
    media: input.snapshot.photos.map((photo) => ({
      path: safeMediaPath(photo.id, photo.mime_type),
      blob: mediaById.get(photo.id)!.blob,
    })),
  }
}

function sortedData(prepared: PreparedCompleteBackup) {
  return [...prepared.data].sort((left, right) => left.path.localeCompare(right.path))
}

function sortedMedia(prepared: PreparedCompleteBackup) {
  return [...prepared.media].sort((left, right) => left.path.localeCompare(right.path))
}

async function writePreparedBackupToBlob(prepared: PreparedCompleteBackup): Promise<Blob> {
  const blobWriter = new BlobWriter('application/zip')
  const writer = new ZipWriter(blobWriter)

  for (const entry of sortedData(prepared)) {
    await writer.add(entry.path, new Uint8ArrayReader(entry.bytes))
  }
  for (const entry of sortedMedia(prepared)) {
    await writer.add(entry.path, new BlobReader(entry.blob), { level: 0 })
  }
  await writer.add('manifest.json', new Uint8ArrayReader(encodeBackupJson(prepared.manifest)))
  await writer.close()
  return blobWriter.getData()
}

function opfsStorage(): OpfsStorageManagerLike | null {
  if (typeof navigator === 'undefined' || !navigator.storage) return null
  const storage = navigator.storage as unknown as OpfsStorageManagerLike
  return typeof storage.getDirectory === 'function' ? storage : null
}

async function writePreparedBackupToOpfs(prepared: PreparedCompleteBackup): Promise<File | null> {
  const storage = opfsStorage()
  if (!storage?.getDirectory) return null

  const filename = backupFilename(prepared.manifest.createdAt)
  const directory = await storage.getDirectory()
  const handle = await directory.getFileHandle(filename, { create: true })
  const writable = await handle.createWritable()
  const writer = new ZipWriter(writable)

  for (const entry of sortedData(prepared)) {
    await writer.add(entry.path, new Uint8ArrayReader(entry.bytes))
  }
  for (const entry of sortedMedia(prepared)) {
    await writer.add(entry.path, new BlobReader(entry.blob), { level: 0 })
  }
  await writer.add('manifest.json', new Uint8ArrayReader(encodeBackupJson(prepared.manifest)))
  await writer.close()
  return handle.getFile()
}

function estimatedPayloadBytes(prepared: PreparedCompleteBackup): number {
  return prepared.data.reduce((total, entry) => total + entry.bytes.byteLength, 0)
    + prepared.media.reduce((total, entry) => total + entry.blob.size, 0)
}

async function artifactFromFile(prepared: PreparedCompleteBackup, file: File): Promise<BackupArtifact> {
  return {
    manifest: prepared.manifest,
    filename: file.name,
    bytes: file.size,
    sha256: await sha256Hex(await file.arrayBuffer()),
    file,
  }
}

export async function createCompleteBackupArtifact(prepared: PreparedCompleteBackup): Promise<BackupArtifact> {
  const opfsFile = await writePreparedBackupToOpfs(prepared)
  if (opfsFile) return artifactFromFile(prepared, opfsFile)

  if (estimatedPayloadBytes(prepared) > MAX_BLOB_BACKUP_BYTES) {
    throw new Error('backup_requires_opfs')
  }

  const blob = await writePreparedBackupToBlob(prepared)
  const file = new File([blob], backupFilename(prepared.manifest.createdAt), { type: 'application/zip' })
  return artifactFromFile(prepared, file)
}
