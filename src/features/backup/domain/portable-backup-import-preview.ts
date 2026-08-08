import { parsePortableBackup } from './portable-backup'

export interface PortableBackupImportCounts {
  categories: number
  conversionProfiles: number
  recipes: number
  cookingSessions: number
  ratings: number
  recipePhotos: number
  cookingSessionPhotos: number
}

export interface PortableBackupImportPreview {
  sourcePairId: string
  targetPairId: string
  exportedAt: string
  canImport: boolean
  counts: PortableBackupImportCounts
  warnings: string[]
  errors: string[]
}

export function previewPortableBackupImport(
  serialized: string,
  targetPairId: string,
): PortableBackupImportPreview {
  const target = targetPairId.trim()
  if (!target) throw new Error('Target pair id is required for backup import preview')

  const backup = parsePortableBackup(serialized)
  const cookingSessions = backup.recipes.flatMap((entry) => entry.history)
  const sourceMatchesTarget = backup.sourcePairId === target
  const errors = sourceMatchesTarget
    ? []
    : ['Este backup pertence a outro par e não pode ser aplicado automaticamente neste caderno.']

  return {
    sourcePairId: backup.sourcePairId,
    targetPairId: target,
    exportedAt: backup.exportedAt,
    canImport: errors.length === 0,
    counts: {
      categories: backup.categories.length,
      conversionProfiles: backup.conversionProfiles.length,
      recipes: backup.recipes.length,
      cookingSessions: cookingSessions.length,
      ratings: cookingSessions.reduce((total, session) => total + session.ratings.length, 0),
      recipePhotos: backup.recipes.reduce((total, entry) => total + entry.photos.length, 0),
      cookingSessionPhotos: backup.recipes.reduce(
        (total, entry) => total + Object.values(entry.sessionPhotos).reduce((subtotal, photos) => subtotal + photos.length, 0),
        0,
      ),
    },
    warnings: [
      'O backup portátil não inclui os binários das fotos; ele guarda apenas metadados e caminhos de Storage.',
      'Fotos só poderão ser reabertas após restauração se o objeto correspondente ainda existir no Storage ou já estiver no cache deste dispositivo.',
      'Fila de mutações, conflitos, preferências deste dispositivo e rascunho de preparo não fazem parte do backup portátil.',
    ],
    errors,
  }
}
