import { useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { getSupabaseClient } from '../../lib/supabase/client'
import { recordDiagnosticSafely } from '../diagnostics/record'
import { SupabaseMediaDownload } from '../media/data/supabase-media-download'
import { MEDIA_STORAGE_BUCKET } from '../media/media-config'
import {
  AccountAdminService,
  type AccountAdminSafety,
  type AccountAdminSafetyProgress,
  type AccountAdminStatus,
} from './account-admin-service'

interface AccountAdminScreenProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  currentEmail: string
  appVersion: string
  service?: AccountAdminService
}

function downloadSafety(safety: AccountAdminSafety): void {
  const url = URL.createObjectURL(safety.artifact.file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safety.artifact.filename
  anchor.rel = 'noopener'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function safetyProgressLabel(progress: AccountAdminSafetyProgress | null): string | null {
  if (!progress) return null
  if (progress.stage === 'backup') {
    if (progress.progress.stage === 'snapshot') return 'Conferindo o estado sincronizado antes da recuperação…'
    if (progress.progress.stage === 'media') {
      return progress.progress.total === 0
        ? 'Nenhuma foto precisa entrar no backup de segurança.'
        : `Baixando fotos do backup de segurança: ${progress.progress.completed}/${progress.progress.total}`
    }
    return 'Montando o backup completo de segurança…'
  }

  const staging = progress.progress
  if (staging.stage === 'preflight') return 'Validando localmente o backup de segurança…'
  if (staging.stage === 'create_job') return 'Criando staging privado do backup de segurança…'
  if (staging.stage === 'data') return `Enviando dados do backup de segurança: ${staging.completed}/${staging.total}`
  if (staging.stage === 'media') return staging.total === 0
    ? 'Backup de segurança sem fotos.'
    : `Enviando fotos do backup de segurança: ${staging.completed}/${staging.total}`
  return 'Servidor confirmando que o backup de segurança corresponde ao estado atual…'
}

function coarseError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('password') || message.includes('authentication')) return 'reauth_failed'
  if (message.includes('safety') || message.includes('backup_requires_sync')) return 'safety_failed'
  if (message.includes('replacement')) return 'replacement_failed'
  if (message.includes('cleanup')) return 'auth_cleanup_failed'
  return 'account_admin_failed'
}

function userError(error: unknown): string {
  const code = coarseError(error)
  if (code === 'reauth_failed') return 'A senha atual não pôde ser confirmada. Nenhuma alteração administrativa foi executada.'
  if (code === 'safety_failed') return 'O backup de segurança não pôde ser validado contra o estado atual. A operação foi bloqueada.'
  if (code === 'replacement_failed') return 'A substituição de identidade não pôde ser iniciada ou cancelada com segurança.'
  if (code === 'auth_cleanup_failed') return 'O acesso ao caderno já foi revogado, mas a limpeza da identidade no provedor ainda precisa ser repetida.'
  return 'Não foi possível concluir esta operação administrativa. O par permanece fechado e o fluxo normal de convite não foi reaberto.'
}

function otherMemberLabel(status: AccountAdminStatus | null): string {
  if (!status?.otherMember) return 'Nenhuma outra identidade ativa.'
  return status.otherMember.email ?? 'Outra identidade ativa'
}

export function AccountAdminScreen({
  database,
  pairId,
  actorUserId,
  currentEmail,
  appVersion,
  service: injectedService,
}: AccountAdminScreenProps) {
  const downloader = useMemo(
    () => new SupabaseMediaDownload(getSupabaseClient(), MEDIA_STORAGE_BUCKET),
    [],
  )
  const service = useMemo(
    () => injectedService ?? new AccountAdminService(
      getSupabaseClient() as never,
      database,
      pairId,
      actorUserId,
      appVersion,
      downloader,
    ),
    [actorUserId, appVersion, database, downloader, injectedService, pairId],
  )

  const [status, setStatus] = useState<AccountAdminStatus | null>(null)
  const [safety, setSafety] = useState<AccountAdminSafety | null>(null)
  const [safetyProgress, setSafetyProgress] = useState<AccountAdminSafetyProgress | null>(null)
  const [replacementEmail, setReplacementEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refreshStatus() {
    const next = await service.status()
    setStatus(next)
  }

  useEffect(() => {
    void refreshStatus().catch(() => setError('Não foi possível carregar o estado administrativo agora.'))
  }, [service])

  async function prepareSafety() {
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const next = await service.prepareSafety(setSafetyProgress)
      setSafety(next)
      setNotice('Backup de segurança validado. Guarde o arquivo antes de qualquer alteração de identidade.')
      void recordDiagnosticSafely(database, {
        area: 'auth',
        severity: 'info',
        code: 'account_admin_safety_ready',
        technicalContext: { phase: 'ready' },
      })
    } catch (cause) {
      setError(userError(cause))
      void recordDiagnosticSafely(database, {
        area: 'auth',
        severity: 'error',
        code: 'account_admin_safety_failed',
        technicalContext: { errorCode: coarseError(cause) },
      })
    } finally {
      setSafetyProgress(null)
      setWorking(false)
    }
  }

  async function removeOther() {
    if (!safety || !status?.otherMember) return
    const currentPassword = password
    setPassword('')
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await service.removeOther({ safety, currentEmail, password: currentPassword })
      setSafety(null)
      await refreshStatus()
      setNotice('O acesso da outra identidade foi revogado. O par continua fechado e os dados/histórico compartilhados foram preservados.')
      void recordDiagnosticSafely(database, {
        area: 'auth',
        severity: 'warning',
        code: 'account_admin_remove_completed',
        technicalContext: { phase: 'completed' },
      })
    } catch (cause) {
      setError(userError(cause))
      void recordDiagnosticSafely(database, {
        area: 'auth',
        severity: 'error',
        code: 'account_admin_remove_failed',
        technicalContext: { errorCode: coarseError(cause) },
      })
    } finally {
      setWorking(false)
    }
  }

  async function beginReplacement() {
    if (!safety || !status?.otherMember) return
    const currentPassword = password
    setPassword('')
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await service.beginReplacement({
        safety,
        currentEmail,
        password: currentPassword,
        replacementEmail,
      })
      setSafety(null)
      setReplacementEmail('')
      await refreshStatus()
      setNotice('O acesso anterior foi revogado e o convite privado de recuperação foi enviado. O par permanece fechado até a nova identidade concluir a ativação.')
      void recordDiagnosticSafely(database, {
        area: 'auth',
        severity: 'warning',
        code: 'account_admin_replacement_started',
        technicalContext: { phase: 'pending_activation' },
      })
    } catch (cause) {
      setError(userError(cause))
      void recordDiagnosticSafely(database, {
        area: 'auth',
        severity: 'error',
        code: 'account_admin_replacement_failed',
        technicalContext: { errorCode: coarseError(cause) },
      })
    } finally {
      setWorking(false)
    }
  }

  async function cancelReplacement() {
    if (!status?.pendingReplacement) return
    const currentPassword = password
    setPassword('')
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await service.cancelReplacement({ currentEmail, password: currentPassword })
      await refreshStatus()
      setNotice('A substituição pendente foi cancelada. O par continua fechado; um novo fluxo de recuperação pode ser iniciado depois com outro backup de segurança atual.')
    } catch (cause) {
      setError(userError(cause))
    } finally {
      setWorking(false)
    }
  }

  async function retryCleanup() {
    const currentPassword = password
    setPassword('')
    setWorking(true)
    setError(null)
    try {
      const stillPending = await service.retryAuthCleanup({ currentEmail, password: currentPassword })
      await refreshStatus()
      setNotice(stillPending
        ? 'A identidade continua sem acesso ao caderno, mas o provedor ainda não concluiu a exclusão. Tente novamente mais tarde.'
        : 'A limpeza pendente da identidade no provedor foi concluída.')
    } catch (cause) {
      setError(userError(cause))
    } finally {
      setWorking(false)
    }
  }

  const pending = status?.pendingReplacement ?? null
  const canPrepareSafety = Boolean(status?.otherMember) && !pending

  return (
    <section className="account-admin" aria-labelledby="account-admin-title">
      <details>
        <summary>Recuperação excepcional de identidade</summary>
        <div className="account-admin__content">
          <header>
            <p className="route-kicker">Acesso ao par</p>
            <h2 id="account-admin-title">Administração excepcional</h2>
            <p>
              Use somente quando a outra pessoa perdeu definitivamente o acesso à identidade atual. Esta área nunca reabre cadastro público nem o convite normal: o par continua fechado e os dados/autoria históricos são preservados.
            </p>
          </header>

          <div className="account-admin__status">
            <span>Outra identidade: <strong>{otherMemberLabel(status)}</strong></span>
            {pending ? (
              <span>
                Substituição pendente: <strong>{pending.replacementEmail ?? 'identidade convidada'}</strong>
              </span>
            ) : null}
          </div>

          {status?.authCleanupPending ? (
            <div className="account-admin__warning">
              <strong>Limpeza do provedor pendente.</strong>
              <p>O acesso ao caderno já foi revogado no banco. A exclusão da identidade no provedor ainda precisa ser repetida após confirmar sua senha atual.</p>
            </div>
          ) : null}

          {canPrepareSafety && !safety ? (
            <div className="account-admin__step">
              <strong>1. Crie o backup de segurança atual</strong>
              <p>O servidor só aceita a operação se este backup corresponder exatamente ao estado canônico atual e tiver sido criado recentemente.</p>
              <button type="button" className="button button--quiet" disabled={working} onClick={() => void prepareSafety()}>
                {working ? 'Preparando…' : 'Gerar e validar backup de segurança'}
              </button>
            </div>
          ) : null}

          {safety ? (
            <div className="account-admin__step account-admin__step--ready">
              <strong>Backup de segurança pronto</strong>
              <p>Baixe e guarde exatamente o arquivo que foi validado antes de prosseguir.</p>
              <button type="button" className="button button--quiet" disabled={working} onClick={() => downloadSafety(safety)}>
                Baixar {safety.artifact.filename}
              </button>
            </div>
          ) : null}

          {safetyProgressLabel(safetyProgress) ? <p role="status">{safetyProgressLabel(safetyProgress)}</p> : null}

          {(safety || pending || status?.authCleanupPending) ? (
            <label className="field-stack">
              Sua senha atual
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={working}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
          ) : null}

          {safety && status?.otherMember && !pending ? (
            <div className="account-admin__actions">
              <div className="account-admin__step">
                <strong>2A. Substituir a outra identidade</strong>
                <p>Revoga a identidade atual da outra pessoa e reserva a segunda vaga para um novo convite privado de recuperação.</p>
                <label className="field-stack">
                  Novo e-mail
                  <input
                    type="email"
                    autoComplete="email"
                    value={replacementEmail}
                    disabled={working}
                    onChange={(event) => setReplacementEmail(event.currentTarget.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={working || !password || !replacementEmail.trim()}
                  onClick={() => void beginReplacement()}
                >
                  Substituir identidade e enviar recuperação
                </button>
              </div>

              <div className="account-admin__step">
                <strong>2B. Somente remover o acesso antigo</strong>
                <p>Revoga a outra identidade sem ocupar a vaga com uma substituta. O par continua fechado; uma recuperação futura exige novo safety backup.</p>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={working || !password}
                  onClick={() => void removeOther()}
                >
                  Remover somente o acesso antigo
                </button>
              </div>
            </div>
          ) : null}

          {pending ? (
            <div className="account-admin__step account-admin__step--pending">
              <strong>Recuperação aguardando ativação</strong>
              <p>
                O convite foi enviado para {pending.replacementEmail ?? 'a nova identidade'} e expira em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(pending.expiresAt))}.
              </p>
              <button
                type="button"
                className="button button--quiet"
                disabled={working || !password}
                onClick={() => void cancelReplacement()}
              >
                Cancelar recuperação pendente
              </button>
            </div>
          ) : null}

          {status?.authCleanupPending ? (
            <button
              type="button"
              className="button button--quiet"
              disabled={working || !password}
              onClick={() => void retryCleanup()}
            >
              Repetir limpeza da identidade no provedor
            </button>
          ) : null}

          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          {notice ? <p className="account-admin__notice" aria-live="polite">{notice}</p> : null}
        </div>
      </details>
    </section>
  )
}
