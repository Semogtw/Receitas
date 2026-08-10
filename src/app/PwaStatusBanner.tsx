interface PwaStatusBannerProps {
  offlineReady: boolean
  needRefresh: boolean
  updating?: boolean
  updateError?: boolean
  onUpdate(): void
  onDismiss(): void
}

export function PwaStatusBanner({
  offlineReady,
  needRefresh,
  updating = false,
  updateError = false,
  onUpdate,
  onDismiss,
}: PwaStatusBannerProps) {
  if (!offlineReady && !needRefresh && !updateError) return null

  const title = updateError
    ? 'Não foi possível aplicar a atualização'
    : needRefresh
      ? 'Nova versão disponível'
      : 'Pronto para usar offline'

  return (
    <aside className="pwa-status" role="status" aria-live="polite" aria-atomic="true">
      <div>
        <strong>{title}</strong>
        {updateError ? (
          <p>A versão atual continua funcionando. Tente novamente quando quiser.</p>
        ) : needRefresh ? (
          <p>
            Atualizar recarrega a página. Dados já salvos neste dispositivo, a fila de sincronização e o preparo em andamento permanecem; campos de formulário ainda não salvos podem ser perdidos.
          </p>
        ) : (
          <p>A estrutura do aplicativo já pode abrir sem conexão.</p>
        )}
      </div>
      <div className="pwa-status__actions">
        {needRefresh || updateError ? (
          <button className="button button--primary" type="button" disabled={updating} onClick={onUpdate}>
            {updating ? 'Atualizando…' : 'Atualizar agora'}
          </button>
        ) : null}
        <button className="button button--quiet" type="button" disabled={updating} onClick={onDismiss}>
          {needRefresh || updateError ? 'Depois' : 'Fechar'}
        </button>
      </div>
    </aside>
  )
}
