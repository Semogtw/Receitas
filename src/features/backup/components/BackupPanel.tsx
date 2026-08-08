import { useState, type ChangeEvent } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { createPortableBackupFile } from '../browser/portable-backup-file'
import { exportPortableBackup } from '../data/portable-backup-exporter'
import { previewPortableBackupImport, type PortableBackupImportPreview } from '../domain/portable-backup-import-preview'

interface BackupPanelProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
}

function plural(count: number, singular: string, pluralValue: string): string {
  return `${count} ${count === 1 ? singular : pluralValue}`
}

export function BackupPanel({ database, pairId, actorUserId }: BackupPanelProps) {
  const [exporting, setExporting] = useState(false)
  const [preview, setPreview] = useState<PortableBackupImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function exportBackup(): Promise<void> {
    setExporting(true)
    setError(null)
    try {
      const backup = await exportPortableBackup(database, { pairId, actorUserId })
      const file = createPortableBackupFile(backup)
      const url = URL.createObjectURL(file.blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = file.filename
        anchor.rel = 'noopener'
        anchor.click()
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível exportar o backup.')
    } finally {
      setExporting(false)
    }
  }

  async function inspectBackup(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0] ?? null
    setPreview(null)
    setError(null)
    if (!file) return

    try {
      const serialized = await file.text()
      setPreview(previewPortableBackupImport(serialized, pairId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível validar este backup.')
    }
  }

  return (
    <section className="backup-panel" aria-labelledby="backup-panel-title">
      <div>
        <p className="route-kicker">Portabilidade</p>
        <h2 id="backup-panel-title">Backup do caderno</h2>
        <p className="backup-panel__intro">
          Exporte os dados compartilhados ativos em JSON versionado. Filas, conflitos e preferências locais ficam fora do arquivo.
        </p>
      </div>

      <div className="backup-panel__export">
        <button type="button" className="button button--primary" disabled={exporting} onClick={() => void exportBackup()}>
          {exporting ? 'Exportando…' : 'Exportar backup'}
        </button>
      </div>

      <div className="backup-panel__import">
        <label>
          <span>Arquivo de backup</span>
          <input aria-label="Arquivo de backup" type="file" accept="application/json,.json" onChange={(event) => void inspectBackup(event)} />
        </label>
        <p>A prévia não altera o banco. Ela apenas valida formato, versão, relações e o par de origem.</p>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {preview ? (
        <div className={`backup-panel__preview ${preview.canImport ? '' : 'backup-panel__preview--blocked'}`}>
          <h3>{preview.canImport ? 'Backup válido para este par' : 'Backup bloqueado'}</h3>
          <div className="backup-panel__counts" aria-label="Conteúdo do backup">
            <span>{plural(preview.counts.categories, 'categoria', 'categorias')}</span>
            <span>{plural(preview.counts.recipes, 'receita', 'receitas')}</span>
            <span>{plural(preview.counts.cookingSessions, 'preparo', 'preparos')}</span>
            <span>{plural(preview.counts.ratings, 'avaliação', 'avaliações')}</span>
            <span>{plural(preview.counts.recipePhotos + preview.counts.cookingSessionPhotos, 'foto', 'fotos')}</span>
          </div>
          {preview.errors.length > 0 ? (
            <ul className="backup-panel__errors">
              {preview.errors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          ) : null}
          <ul className="backup-panel__warnings">
            {preview.warnings.map((message) => <li key={message}>{message}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
