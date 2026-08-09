import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { useAuth } from '../../features/auth/AuthProvider'
import { recordDiagnosticSafely } from '../../features/diagnostics/record'
import { ImportRecipe } from '../../features/imports/components/ImportRecipe'
import { ImportReview } from '../../features/imports/components/ImportReview'
import { ImportClient, type ImportFunctionsClient, type ImportPreview, type ImportStrategy } from '../../features/imports/data/import-client'
import { ImportSaveService } from '../../features/imports/data/import-save-service'
import type { ImportedRecipeDraft } from '../../features/imports/domain/normalize-import'
import { getSupabaseClient } from '../../lib/supabase/client'

function importSaveErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'save_unknown'
  if (error.message.includes('source is invalid')) return 'source_invalid'
  if (error.message.includes('title is required')) return 'title_missing'
  if (error.message.includes('time')) return 'time_invalid'
  if (error.message.includes('source metadata')) return 'source_metadata_failed'
  return 'save_failed'
}

export function ImportRecipeRoute() {
  const auth = useAuth()
  const database = usePowerSyncDatabase()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importClient = useMemo(
    () => new ImportClient(getSupabaseClient() as unknown as ImportFunctionsClient),
    [],
  )

  const saveService = useMemo(() => {
    if (!auth.userId || !auth.pairId) return null
    return new ImportSaveService(database, { pairId: auth.pairId, actorUserId: auth.userId })
  }, [auth.userId, auth.pairId, database])

  async function save(draft: ImportedRecipeDraft, strategy: ImportStrategy) {
    if (!saveService) return
    setSaving(true)
    setError(null)
    try {
      await saveService.save(draft, strategy)
      void recordDiagnosticSafely(database, {
        area: 'import',
        severity: 'info',
        code: 'save_completed',
        technicalContext: { importStrategy: strategy },
      })
      navigate('/recipes', { replace: true })
    } catch (cause) {
      void recordDiagnosticSafely(database, {
        area: 'import',
        severity: 'error',
        code: 'save_failed',
        technicalContext: {
          importStrategy: strategy,
          errorCode: importSaveErrorCode(cause),
        },
      })
      setError('Não foi possível salvar a receita importada neste dispositivo. A revisão continua aberta para você tentar novamente.')
    } finally {
      setSaving(false)
    }
  }

  function acceptPreview(next: ImportPreview) {
    setPreview(next)
    setError(null)
    void recordDiagnosticSafely(database, {
      area: 'import',
      severity: next.draft.warnings.length > 0 ? 'warning' : 'info',
      code: 'preview_ready',
      technicalContext: { importStrategy: next.strategy },
    })
  }

  if (!saveService) {
    return (
      <section className="route-section" aria-labelledby="import-unavailable-title">
        <p className="route-kicker">Importar</p>
        <h1 id="import-unavailable-title">Importação indisponível</h1>
        <p className="route-intro">A sessão local ainda não está pronta para salvar receitas.</p>
      </section>
    )
  }

  return (
    <section className="import-workspace">
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {preview ? (
        <ImportReview
          preview={preview}
          saving={saving}
          onConfirm={save}
          onBack={() => { setPreview(null); setError(null) }}
          onCancel={() => navigate('/recipes')}
        />
      ) : (
        <ImportRecipe
          client={importClient}
          onPreview={acceptPreview}
          onCancel={() => navigate('/recipes')}
        />
      )}
    </section>
  )
}
