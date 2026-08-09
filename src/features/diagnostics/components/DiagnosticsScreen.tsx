import { useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { createDiagnosticsArtifact, type DiagnosticsArtifact } from '../export'
import { DiagnosticStore } from '../store'

interface DiagnosticsScreenProps {
  database: PowerSyncDatabase
  pairId: string
  appVersion: string
  store?: DiagnosticStore
  artifactFactory?: typeof createDiagnosticsArtifact
}

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function DiagnosticsScreen({
  database,
  pairId,
  appVersion,
  store: injectedStore,
  artifactFactory = createDiagnosticsArtifact,
}: DiagnosticsScreenProps) {
  const store = useMemo(() => injectedStore ?? new DiagnosticStore(database), [database, injectedStore])
  const [eventCount, setEventCount] = useState(0)
  const [verboseUntil, setVerboseUntil] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastExport, setLastExport] = useState<Pick<DiagnosticsArtifact, 'filename' | 'bytes'> | null>(null)

  async function refresh() {
    const [events, until] = await Promise.all([store.list(), store.verboseUntil()])
    setEventCount(events.length)
    setVerboseUntil(until)
  }

  useEffect(() => {
    void refresh().catch(() => setError('Não foi possível ler os diagnósticos locais.'))
  }, [store])

  async function toggleVerbose() {
    setWorking(true)
    setError(null)
    try {
      if (verboseUntil) await store.disableVerbose()
      else await store.enableVerbose(15 * 60 * 1000)
      await refresh()
    } catch {
      setError('Não foi possível alterar o modo verboso local.')
    } finally {
      setWorking(false)
    }
  }

  async function clearEvents() {
    setWorking(true)
    setError(null)
    try {
      await store.clear()
      await refresh()
      setLastExport(null)
    } catch {
      setError('Não foi possível limpar os diagnósticos locais.')
    } finally {
      setWorking(false)
    }
  }

  async function exportDiagnostics() {
    setWorking(true)
    setError(null)
    try {
      const artifact = await artifactFactory({ database, pairId, appVersion, store })
      const url = URL.createObjectURL(artifact.file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = artifact.filename
      anchor.rel = 'noopener'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      setLastExport({ filename: artifact.filename, bytes: artifact.bytes })
      await refresh()
    } catch {
      setError('Não foi possível exportar os diagnósticos locais.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="diagnostics-panel" aria-labelledby="diagnostics-title">
      <div>
        <p className="route-kicker">Privacidade e suporte</p>
        <h2 id="diagnostics-title">Diagnósticos locais</h2>
        <p className="diagnostics-panel__intro">
          Guarda somente códigos e métricas técnicas no aparelho. Não envia analytics e não inclui texto de receitas, fotos, e-mails, IDs do par/usuário, tokens ou sessões.
        </p>
      </div>

      <div className="diagnostics-panel__summary">
        <span><strong>{eventCount}</strong> eventos sanitizados</span>
        <span>
          Modo verboso: <strong>{verboseUntil ? `até ${formatExpiry(verboseUntil)}` : 'desligado'}</strong>
        </span>
      </div>

      <div className="diagnostics-panel__actions">
        <button type="button" className="button button--primary" disabled={working} onClick={() => void exportDiagnostics()}>
          Exportar diagnósticos
        </button>
        <button type="button" className="button button--quiet" disabled={working} onClick={() => void toggleVerbose()}>
          {verboseUntil ? 'Desligar modo verboso' : 'Modo verboso por 15 min'}
        </button>
        <button type="button" className="button button--quiet" disabled={working || eventCount === 0} onClick={() => void clearEvents()}>
          Limpar histórico local
        </button>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {lastExport ? (
        <p className="diagnostics-panel__result" aria-live="polite">
          Exportado: <strong>{lastExport.filename}</strong> · {new Intl.NumberFormat('pt-BR').format(lastExport.bytes)} bytes
        </p>
      ) : null}
    </section>
  )
}
