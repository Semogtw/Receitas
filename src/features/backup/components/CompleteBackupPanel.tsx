import { useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { recordDiagnosticSafely } from '../../diagnostics/record'
import { SupabaseMediaDownload } from '../../media/data/supabase-media-download'
import { MEDIA_STORAGE_BUCKET } from '../../media/media-config'
import { getSupabaseClient } from '../../../lib/supabase/client'
import { createCompleteBackup, type CompleteBackupProgress } from '../data/complete-backup-service'
import { BackupRequiresSyncError } from '../data/complete-backup-snapshot'

interface CompleteBackupPanelProps {
  database: PowerSyncDatabase
  pairId: string
  appVersion: string
}

function progressLabel(progress: CompleteBackupProgress | null): string | null {
  if (!progress) return null
  if (progress.stage === 'snapshot') return 'Conferindo o estado sincronizado…'
  if (progress.stage === 'media') {
    if (progress.total === 0) return 'Nenhuma foto para baixar.'
    return `Baixando fotos privadas: ${progress.completed}/${progress.total}`
  }
  return 'Montando e verificando o arquivo ZIP…'
}

function backupErrorCode(error: unknown): string {
  if (error instanceof BackupRequiresSyncError) return 'requires_sync'
  if (error instanceof Error && error.message === 'backup_requires_opfs') return 'requires_opfs'
  if (error instanceof Error && error.message.includes('checksum mismatch')) return 'media_checksum_mismatch'
  if (error instanceof Error && error.message.includes('MIME type')) return 'media_type_mismatch'
  return 'export_failed'
}

function backupErrorMessage(error: unknown): string {
  if (error instanceof BackupRequiresSyncError) return error.message
  if (error instanceof Error && error.message === 'backup_requires_opfs') {
    return 'Este backup é grande demais para o fallback em memória e este navegador não oferece OPFS. Tente em um navegador compatível.'
  }
  if (error instanceof Error && error.message.includes('checksum mismatch')) {
    return 'Uma foto baixada não corresponde ao checksum registrado. O backup foi cancelado para evitar corrupção silenciosa.'
  }
  return error instanceof Error ? error.message : 'Não foi possível gerar o backup completo.'
}

export function CompleteBackupPanel({ database, pairId, appVersion }: CompleteBackupPanelProps) {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<CompleteBackupProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ filename: string; bytes: number; sha256: string } | null>(null)

  const downloader = useMemo(
    () => new SupabaseMediaDownload(getSupabaseClient(), MEDIA_STORAGE_BUCKET),
    [],
  )

  async function exportBackup(): Promise<void> {
    setExporting(true)
    setProgress(null)
    setError(null)
    setLastResult(null)
    try {
      const artifact = await createCompleteBackup({
        database,
        pairId,
        appVersion,
        mediaDownloader: downloader,
        onProgress: setProgress,
      })
      const url = URL.createObjectURL(artifact.file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = artifact.filename
      anchor.rel = 'noopener'
      anchor.click()
      // Safari/WebKit can start the download asynchronously after click().
      // Revoking on the next task avoids invalidating the URL too early.
      setTimeout(() => URL.revokeObjectURL(url), 0)
      setLastResult({ filename: artifact.filename, bytes: artifact.bytes, sha256: artifact.sha256 })
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'info',
        code: 'export_completed',
        technicalContext: { byteSize: artifact.bytes, phase: 'complete' },
      })
    } catch (cause) {
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'error',
        code: 'export_failed',
        technicalContext: { errorCode: backupErrorCode(cause) },
      })
      setError(backupErrorMessage(cause))
    } finally {
      setProgress(null)
      setExporting(false)
    }
  }

  return (
    <section className="backup-panel" aria-labelledby="complete-backup-title">
      <div>
        <p className="route-kicker">Portabilidade</p>
        <h2 id="complete-backup-title">Backup completo</h2>
        <p className="backup-panel__intro">
          Gera um ZIP versionado com dados estruturados, planejamento, compras e os originais privados das fotos. O arquivo só é criado quando as filas locais estão sincronizadas.
        </p>
      </div>

      <div className="backup-panel__export">
        <button type="button" className="button button--primary" disabled={exporting} onClick={() => void exportBackup()}>
          {exporting ? 'Gerando backup…' : 'Exportar backup completo'}
        </button>
        <p>Senhas, sessões, tokens e credenciais de provedor não entram no formato de backup.</p>
      </div>

      {progressLabel(progress) ? <p role="status">{progressLabel(progress)}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {lastResult ? (
        <div className="backup-panel__result" aria-live="polite">
          <strong>Backup gerado e verificado.</strong>
          <span>{lastResult.filename}</span>
          <span>{new Intl.NumberFormat('pt-BR').format(lastResult.bytes)} bytes</span>
          <code title="SHA-256 do arquivo">{lastResult.sha256}</code>
        </div>
      ) : null}
    </section>
  )
}
