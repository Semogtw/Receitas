import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { useAuth } from '../../features/auth/AuthProvider'
import { ImportRecipe } from '../../features/imports/components/ImportRecipe'
import { ImportReview } from '../../features/imports/components/ImportReview'
import { ImportClient, type ImportFunctionsClient, type ImportPreview, type ImportStrategy } from '../../features/imports/data/import-client'
import { ImportSaveService } from '../../features/imports/data/import-save-service'
import type { ImportedRecipeDraft } from '../../features/imports/domain/normalize-import'
import { getSupabaseClient } from '../../lib/supabase/client'

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
      navigate('/recipes', { replace: true })
    } catch {
      setError('Não foi possível salvar a receita importada neste dispositivo. A revisão continua aberta para você tentar novamente.')
    } finally {
      setSaving(false)
    }
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
          onPreview={(next) => { setPreview(next); setError(null) }}
          onCancel={() => navigate('/recipes')}
        />
      )}
    </section>
  )
}
