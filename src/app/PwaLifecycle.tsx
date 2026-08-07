import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaLifecycle() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) {
    return null
  }

  const dismiss = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <aside className="pwa-status" role="status" aria-live="polite">
      <div>
        <strong>{needRefresh ? 'Atualização disponível' : 'Pronto para usar offline'}</strong>
        <p>
          {needRefresh
            ? 'Uma versão nova do aplicativo está pronta.'
            : 'A estrutura do aplicativo já pode abrir sem conexão.'}
        </p>
      </div>
      <div className="pwa-status__actions">
        {needRefresh ? (
          <button className="button button--primary" type="button" onClick={() => void updateServiceWorker(true)}>
            Atualizar agora
          </button>
        ) : null}
        <button className="button button--quiet" type="button" onClick={dismiss}>
          {needRefresh ? 'Agora não' : 'Fechar'}
        </button>
      </div>
    </aside>
  )
}
