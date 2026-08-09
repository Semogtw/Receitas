import { BlobReader, TextWriter, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import {
  sha256Hex,
  type BackupManifest,
  type BackupMediaFileDescriptor,
} from '../domain/complete-backup-format'
import { assertCompleteBackupArchiveSize } from '../domain/complete-backup-limits'
import {
  parseCompleteBackupDataJson,
  parseCompleteBackupManifest,
  validateArchiveAgainstManifest,
  validateArchiveEntryMetadata,
  validateStructuredBackupData,
  type ArchiveEntryMetadata,
} from '../domain/complete-backup-validation'

interface ReadableArchiveEntry {
  filename: string
  compressedSize: number
  uncompressedSize: number
  directory: boolean
  encrypted?: boolean
  externalFileAttributes?: number
  getData(writer: Uint8ArrayWriter): Promise<Uint8Array>
  getData(writer: TextWriter): Promise<string>
}

export interface CompleteBackupInspection {
  manifest: BackupManifest
  sourcePairId: string
  data: Map<string, unknown>
  mediaFiles: BackupMediaFileDescriptor[]
}

function metadata(entry: ReadableArchiveEntry): ArchiveEntryMetadata {
  return {
    filename: entry.filename,
    compressedSize: Number(entry.compressedSize),
    uncompressedSize: Number(entry.uncompressedSize),
    directory: Boolean(entry.directory),
    encrypted: Boolean(entry.encrypted),
    externalFileAttributes: entry.externalFileAttributes,
  }
}

async function verifiedBytes(
  entry: ReadableArchiveEntry,
  expectedSha256: string,
  label: string,
): Promise<Uint8Array> {
  const bytes = await entry.getData(new Uint8ArrayWriter())
  const actual = await sha256Hex(bytes)
  if (actual !== expectedSha256) throw new Error(`Backup checksum mismatch for ${label}`)
  return bytes
}

export async function inspectCompleteBackupArchive(blob: Blob): Promise<CompleteBackupInspection> {
  assertCompleteBackupArchiveSize(blob.size)
  const reader = new ZipReader(new BlobReader(blob))

  try {
    const entries = (await reader.getEntries()) as unknown as ReadableArchiveEntry[]
    const entryMetadata = entries.map(metadata)
    validateArchiveEntryMetadata(entryMetadata)

    const byName = new Map(entries.map((entry) => [entry.filename, entry]))
    const manifestEntry = byName.get('manifest.json')
    if (!manifestEntry) throw new Error('Complete backup is missing manifest.json')
    const manifest = parseCompleteBackupManifest(await manifestEntry.getData(new TextWriter()))
    validateArchiveAgainstManifest(entryMetadata, manifest)

    const data = new Map<string, unknown>()
    for (const descriptor of manifest.dataFiles) {
      const entry = byName.get(descriptor.path)
      if (!entry) throw new Error(`Backup archive is missing ${descriptor.path}`)
      const bytes = await verifiedBytes(entry, descriptor.sha256, descriptor.path)
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        throw new Error(`Backup data entry is not valid UTF-8: ${descriptor.path}`)
      }
      data.set(descriptor.path, parseCompleteBackupDataJson(descriptor.path, text))
    }

    const structured = validateStructuredBackupData(data)

    // Verify media sequentially. The per-entry safety limit keeps peak memory bounded,
    // and no canonical state is touched during inspection.
    for (const descriptor of manifest.mediaFiles) {
      const entry = byName.get(descriptor.path)
      if (!entry) throw new Error(`Backup archive is missing ${descriptor.path}`)
      await verifiedBytes(entry, descriptor.sha256, descriptor.path)
    }

    return {
      manifest,
      sourcePairId: structured.sourcePairId,
      data,
      mediaFiles: [...manifest.mediaFiles],
    }
  } finally {
    await reader.close()
  }
}
