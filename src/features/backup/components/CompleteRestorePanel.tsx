import { useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { getSupabaseClient } from '../../../lib/supabase/client'
import { recordDiagnosticSafely } from '../../diagnostics/record'
import { RestoreCommitService, type RestoreCommitProgress, type RestoreMergeCommitResult } from '../data/restore-commit-service'
import { RestoreStagingService, type RestoreJobSummary, type RestoreStagingProgress } from '../data/restore-staging-service'

interface CompleteRestorePanelProps {
  database: PowerSyncDatabase
}

function stageProgressLabel(progress: RestoreStagingProgress | null): string | null {
  if (!progress) return null
  switch (progress.stage) {
    case 'preflight': return 'Validando o ZIP completo antes de enviar qualquer dado…'
    case 'create_job': return 'Criando área privada temporária de restauração…'
    case 'data': return progress.total === 0 ? 'Sem dados para enviar.' : `Enviando dados validados: ${progress.completed}/${progress.total}`
    case 'media': return progress.total === 0 ? 'Sem fotos no backup.' : `Enviando fotos privadas: ${progress.completed}/${progress.total}`
    case 'finalize': return 'Executando a validação final independente no servidor…'
  }
}

function commitProgressLabel(progress: RestoreCommitProgress | null): string | null {
  if (!progress) return null
  if (progress.stage === 'media') {
    return progress.total === 0
      ? 'Nenhuma mídia precisa ser promovida.'
      : `Promovendo mídia validada: ${progress.completed}/${progress.total}`
  }
  return 'Aplicando a mesclagem transacional…'
}

function coarseRestoreError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('checksum')) return 'checksum_mismatch'
  if (message.includes('reference')) return 'reference_invalid'
  if (message.includes('preflight') || message.includes('archive')) return 'archive_invalid'
  if (message.includes('promotion')) return 'media_promotion_failed'
  if (message.includes('commit')) return 'commit_failed'
  return 'restore_failed'
}

function restoreErrorMessage(error: unknown): string {
  const code = coarseRestoreError(error)
  if (code === 'checksum_mismatch') return 'O backup contém uma entrada cujo checksum não confere. Nenhum dado canônico foi alterado.'
  if (code === 'reference_invalid') return 'O backup contém referências internas quebradas. Nenhum dado canônico foi alterado.'
  if (code === 'archive_invalid') return 'O arquivo não passou pelo preflight de segurança do formato de backup.'
  if (code === 'media_promotion_failed') return 'Uma mídia não pôde ser promovida com segurança. A mesclagem ainda não foi aplicada.'
  if (code === 'commit_failed') return 'A transação de mesclagem não pôde ser concluída. O banco reverteu a tentativa.'
  return 'Não foi possível concluir esta etapa da restauração. O processo pode ser tentado novamente sem sobrescrever silenciosamente dados.'
}

export function CompleteRestorePanel({ database }: CompleteRestorePanelProps) {
  const [archive, setArchive] = useState<File | null>(null)
  const [job, setJob] = useState<RestoreJobSummary | null>(null)
  const [stageProgress, setStageProgress] = useState<RestoreStagingProgress | null>(null)
  const [commitProgress, setCommitProgress] = useState<RestoreCommitProgress | null>(null)
  const [result, setResult] = useState<RestoreMergeCommitResult | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const staging = useMemo(() => new RestoreStagingService(getSupabaseClient()), [])
  const commit = useMemo(() => new RestoreCommitService(getSupabaseClient()), [])

  function chooseArchive(file: File | null) {
    setArchive(file)
    setJob(null)
    setResult(null)
    setError(null)
    setStageProgress(null)
    setCommitProgress(null)
  }

  async function validateAndStage() {
    if (!archive) return
    setWorking(true)
    setError(null)
    setResult(null)
    try {
      const ready = await staging.stageArchive(archive, 'merge', setStageProgress)
      setJob(ready)
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'info',
        code: 'restore_staged',
        technicalContext: { restoreMode: 'merge', restoreStatus: ready.status },
      })
    } catch (cause) {
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'error',
        code: 'restore_stage_failed',
        technicalContext: { restoreMode: 'merge', errorCode: coarseRestoreError(cause) },
      })
      setError(restoreErrorMessage(cause))
    } finally {
      setStageProgress(null)
      setWorking(false)
    }
  }

  async function applyMerge() {
    if (!job || job.status !== 'ready_to_commit') return
    setWorking(true)
    setError(null)
    try {
      const next = await commit.commitMerge(job.id, setCommitProgress)
      setResult(next)
      setJob(null)
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: next.conflictCount > 0 ? 'warning' : 'info',
        code: 'restore_merge_completed',
        technicalContext: {
          restoreMode: 'merge',
          conflictCount: next.conflictCount,
        },
      })
    } catch (cause) {
      void recordDiagnosticSafely(database, {
        area: 'backup',
        severity: 'error',
        code: 'restore_merge_failed',
        technicalContext: { restoreMode: 'merge', errorCode: coarseRestoreError(cause) },
      })
      setError(restoreErrorMessage(cause))
    } finally {
      setCommitProgress(null)
      setWorking(false)
    }
  }

  return (
    <section className="backup-panel backup-panel--restore" aria-labelledby="complete-restore-title">
      <div>
        <p className="route-kicker">Restauração segura</p>
        <h2 id="complete-restore-title">Mesclar backup completo</h2>
        <p className="backup-panel__intro">
          O arquivo inteiro é validado antes do staging. Depois disso, a mesclagem só começa com uma segunda confirmação: IDs ausentes são inseridos, conteúdo idêntico vira no-op e divergências de mesmo ID viram conflitos para revisão.
        </p>
      </div>

      <label className="field-stack">
        Arquivo `.zip`
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={working}
          onChange={(event) => chooseArchive(event.currentTarget.files?.[0] ?? null)}
        />
      </label>

      {archive ? <p className="backup-panel__selected">Selecionado: <strong>{archive.name}</strong></p> : null}

      {!job && !result ? (
        <button type="button" className="button button--primary" disabled={!archive || working} onClick={() => void validateAndStage()}>
          {working ? 'Validando…' : 'Validar e preparar mesclagem'}
        </button>
      ) : null}

      {stageProgressLabel(stageProgress) ? <p role="status">{stageProgressLabel(stageProgress)}</p> : null}

      {job?.status === 'ready_to_commit' ? (
        <div className="backup-panel__preview">
          <strong>Preflight concluído.</strong>
          <p>O servidor revalidou dados e mídias. Ainda nenhuma linha canônica foi alterada.</p>
          <button type="button" className="button button--primary" disabled={working} onClick={() => void applyMerge()}>
            {working ? 'Aplicando…' : 'Aplicar mesclagem agora'}
          </button>
        </div>
      ) : null}

      {commitProgressLabel(commitProgress) ? <p role="status">{commitProgressLabel(commitProgress)}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="backup-panel__result" aria-live="polite">
          <strong>Mesclagem concluída.</strong>
          <span>{result.insertedCount} inseridos · {result.noopCount} já idênticos · {result.conflictCount} conflitos preservados</span>
          {result.conflictCount > 0 ? <span>Os conflitos podem ser revisados na central de sincronização.</span> : null}
        </div>
      ) : null}
    </section>
  )
}
