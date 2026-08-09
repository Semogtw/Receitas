import { useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { getSupabaseClient } from '../../../lib/supabase/client'
import { recordDiagnosticSafely } from '../../diagnostics/record'
import { SupabaseMediaDownload } from '../../media/data/supabase-media-download'
import { MEDIA_STORAGE_BUCKET } from '../../media/media-config'
import type { BackupArtifact } from '../domain/complete-backup-format'
import { BackupRequiresSyncError } from '../data/complete-backup-snapshot'
import {
  RestoreReplaceService,
  type ReplacePreparation,
  type ReplaceProgress,
  type RestoreReplaceCommitResult,
} from '../data/restore-replace-service'
import type { RestoreJobSummary, RestoreStagingProgress } from '../data/restore-staging-service'

interface ReplaceRestorePanelProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  appVersion: string
  service?: RestoreReplaceService
}

function stagingLabel(progress: RestoreStagingProgress | null): string | null {
  if (!progress) return null
  switch (progress.stage) {
    case 'preflight': return 'Validando integralmente o backup recebido…'
    case 'create_job': return 'Criando staging privado temporário…'
    case 'data': return progress.total === 0 ? 'Sem dados para staging.' : `Enviando dados validados: ${progress.completed}/${progress.total}`
    case 'media': return progress.total === 0 ? 'Sem fotos no backup recebido.' : `Enviando fotos privadas: ${progress.completed}/${progress.total}`
    case 'finalize': return 'Servidor revalidando o backup recebido…'
  }
}

function replaceProgressLabel(progress: ReplaceProgress | null): string | null {
  if (!progress) return null
  if (progress.stage === 'safety_backup') {
    if (progress.progress.stage === 'snapshot') return 'Criando snapshot do estado atual para o backup de segurança…'
    if (progress.progress.stage === 'media') {
      return progress.progress.total === 0
        ? 'Backup de segurança sem fotos.'
        : `Baixando fotos do backup de segurança: ${progress.progress.completed}/${progress.progress.total}`
    }
    return 'Montando o ZIP de segurança atual…'
  }
  if (progress.stage === 'safety_staging') {
    return `Validando o backup de segurança no servidor: ${stagingLabel(progress.progress) ?? 'em andamento'}`
  }
  if (progress.stage === 'promotion') {
    return progress.total === 0
      ? 'Nenhuma mídia recebida precisa ser promovida.'
      : `Promovendo mídia validada do backup recebido: ${progress.completed}/${progress.total}`
  }
  return 'Executando a substituição transacional…'
}

function coarseReplaceError(error: unknown): string {
  if (error instanceof BackupRequiresSyncError) return 'safety_requires_sync'
  const message = error instanceof Error ? error.message : ''
  if (message.includes('checksum')) return 'checksum_mismatch'
  if (message.includes('safety')) return 'safety_invalid'
  if (message.includes('promotion')) return 'media_promotion_failed'
  if (message.includes('commit') || message.includes('transaction')) return 'replace_commit_failed'
  if (message.includes('staging') || message.includes('archive') || message.includes('preflight')) return 'archive_invalid'
  return 'replace_failed'
}

function replaceErrorMessage(error: unknown): string {
  if (error instanceof BackupRequiresSyncError) return error.message
  switch (coarseReplaceError(error)) {
    case 'checksum_mismatch':
      return 'Um dos arquivos não corresponde ao checksum declarado. A substituição não foi aplicada.'
    case 'safety_invalid':
      return 'O servidor não conseguiu provar que o backup de segurança corresponde ao estado atual. A substituição foi bloqueada.'
    case 'media_promotion_failed':
      return 'Uma mídia recebida não pôde ser promovida com segurança. A substituição ainda não foi aplicada.'
    case 'replace_commit_failed':
      return 'A substituição transacional falhou e o banco reverteu a tentativa.'
    case 'archive_invalid':
      return 'O backup recebido não passou por todas as validações necessárias.'
    default:
      return 'Não foi possível concluir esta etapa. A substituição não é executada sem todas as travas de segurança.'
  }
}

function downloadArtifact(artifact: BackupArtifact): void {
  const url = URL.createObjectURL(artifact.file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = artifact.filename
  anchor.rel = 'noopener'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function ReplaceRestorePanel({
  database,
  pairId,
  actorUserId,
  appVersion,
  service: injectedService,
}: ReplaceRestorePanelProps) {
  const [archive, setArchive] = useState<File | null>(null)
  const [replaceJob, setReplaceJob] = useState<RestoreJobSummary | null>(null)
  const [preparation, setPreparation] = useState<ReplacePreparation | null>(null)
  const [stageProgress, setStageProgress] = useState<RestoreStagingProgress | null>(null)
  const [replaceProgress, setReplaceProgress] = useState<ReplaceProgress | null>(null)
  const [result, setResult] = useState<RestoreReplaceCommitResult | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const downloader = useMemo(
    () => new SupabaseMediaDownload(getSupabaseClient(), MEDIA_STORAGE_BUCKET),
    [],
  )
  const service = useMemo(
    () => injectedService ?? new RestoreReplaceService(
      getSupabaseClient() as never,
      database,
      pairId,
      actorUserId,
      appVersion,
      downloader,
    ),
    [actorUserId, appVersion, database, downloader, injectedService, pairId],
  )

  function chooseArchive(file: File | null) {
    setArchive(file)
    setReplaceJob(null)
    setPreparation(null)
    setResult(null)
    setError(null)
    setStageProgress(null)
    setReplaceProgress(null)
  }

  async function stageIncoming() {
    if (!archive) return
    setWorking(true)
    setError(null)
    setResult(null)
    try {
      const ready = await service.stageIncoming(archive, setStageProgress)
      setReplaceJob(ready)
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'warning',
        code: 'replace_incoming_staged',
        technicalContext: { restoreMode: 'replace_all', restoreStatus: ready.status },
      })
    } catch (cause) {
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'error',
        code: 'replace_stage_failed',
        technicalContext: { restoreMode: 'replace_all', errorCode: coarseReplaceError(cause) },
      })
      setError(replaceErrorMessage(cause))
    } finally {
      setStageProgress(null)
      setWorking(false)
    }
  }

  async function prepareSafety() {
    if (!replaceJob) return
    setWorking(true)
    setError(null)
    try {
      const prepared = await service.prepareSafety(replaceJob, setReplaceProgress)
      setPreparation(prepared)
      setReplaceJob(prepared.replaceJob)
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'info',
        code: 'replace_safety_ready',
        technicalContext: { restoreMode: 'replace_all', restoreStatus: prepared.replaceJob.status },
      })
    } catch (cause) {
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'error',
        code: 'replace_safety_failed',
        technicalContext: { restoreMode: 'replace_all', errorCode: coarseReplaceError(cause) },
      })
      setError(replaceErrorMessage(cause))
    } finally {
      setReplaceProgress(null)
      setWorking(false)
    }
  }

  async function commitReplace() {
    if (!preparation) return
    setWorking(true)
    setError(null)
    try {
      const next = await service.commitReplace(preparation, setReplaceProgress)
      setResult(next)
      setReplaceJob(null)
      setPreparation(null)
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'warning',
        code: 'replace_completed',
        technicalContext: { restoreMode: 'replace_all', restoreStatus: 'completed' },
      })
    } catch (cause) {
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'error',
        code: 'replace_failed',
        technicalContext: { restoreMode: 'replace_all', errorCode: coarseReplaceError(cause) },
      })
      setError(replaceErrorMessage(cause))
    } finally {
      setReplaceProgress(null)
      setWorking(false)
    }
  }

  return (
    <section className="backup-panel backup-panel--replace" aria-labelledby="replace-restore-title">
      <div>
        <p className="route-kicker">Operação destrutiva</p>
        <h2 id="replace-restore-title">Substituir tudo pelo backup</h2>
        <p className="backup-panel__intro">
          Este modo deixa inativo o estado atual que não existe no backup recebido. Ele só é liberado depois de gerar um backup completo do estado atual, validar esse mesmo ZIP no servidor e provar novamente que o estado não mudou antes da transação final.
        </p>
      </div>

      <div className="backup-panel__danger-note" role="note">
        <strong>Três etapas obrigatórias:</strong>
        <span>1. Validar o backup recebido.</span>
        <span>2. Gerar e validar o backup de segurança atual.</span>
        <span>3. Confirmar a substituição transacional.</span>
      </div>

      <label className="field-stack">
        Backup que substituirá o estado atual
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={working}
          onChange={(event) => chooseArchive(event.currentTarget.files?.[0] ?? null)}
        />
      </label>

      {archive ? <p className="backup-panel__selected">Selecionado: <strong>{archive.name}</strong></p> : null}

      {!replaceJob && !result ? (
        <button type="button" className="button button--quiet" disabled={!archive || working} onClick={() => void stageIncoming()}>
          {working ? 'Validando…' : '1. Validar backup recebido'}
        </button>
      ) : null}

      {stagingLabel(stageProgress) ? <p role="status">{stagingLabel(stageProgress)}</p> : null}

      {replaceJob && !preparation ? (
        <div className="backup-panel__preview">
          <strong>Backup recebido validado.</strong>
          <p>Nenhuma linha canônica foi alterada. Agora é obrigatório produzir o backup de segurança do estado atual.</p>
          <button type="button" className="button button--quiet" disabled={working} onClick={() => void prepareSafety()}>
            {working ? 'Gerando segurança…' : '2. Gerar e validar backup de segurança'}
          </button>
        </div>
      ) : null}

      {replaceProgressLabel(replaceProgress) ? <p role="status">{replaceProgressLabel(replaceProgress)}</p> : null}

      {preparation ? (
        <div className="backup-panel__preview backup-panel__preview--danger">
          <strong>Backup de segurança validado pelo servidor.</strong>
          <p>
            O ZIP abaixo foi gerado do estado atual e é o mesmo arquivo que passou pelo staging de segurança. Guarde-o antes de prosseguir.
          </p>
          <button type="button" className="button button--quiet" disabled={working} onClick={() => downloadArtifact(preparation.safetyArtifact)}>
            Baixar {preparation.safetyArtifact.filename}
          </button>
          <button type="button" className="button button--danger" disabled={working} onClick={() => void commitReplace()}>
            {working ? 'Substituindo…' : '3. Substituir tudo agora'}
          </button>
        </div>
      ) : null}

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="backup-panel__result" aria-live="polite">
          <strong>Substituição concluída.</strong>
          <span>{result.insertedCount} registros novos · {result.updatedCount} registros reaplicados</span>
          <span>O backup de segurança gerado antes da operação continua sendo o ponto de retorno desta substituição.</span>
        </div>
      ) : null}
    </section>
  )
}
