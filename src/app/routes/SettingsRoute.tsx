import { PairInviteForm } from '../../features/auth/PairInviteForm'
import { useAuth } from '../../features/auth/AuthProvider'

export function SettingsRoute() {
  const auth = useAuth()

  return (
    <section className="route-section settings-page" aria-labelledby="settings-title">
      <p className="route-kicker">Preferências</p>
      <h1 id="settings-title">Configurações</h1>
      <p className="route-intro">Preferências do aplicativo, vínculo do par e opções desta sessão ficam aqui.</p>

      <PairInviteForm />

      <section className="settings-section" aria-labelledby="session-title">
        <h2 id="session-title">Sessão</h2>
        <p>{auth.email ? `Conectado como ${auth.email}.` : 'Sessão autenticada.'}</p>
        {auth.restoredFromLocalScope ? <p>O caderno foi reaberto usando a autorização local validada anteriormente. Alterações remotas de conta serão confirmadas quando a conexão voltar.</p> : null}
        <button className="button button--quiet" type="button" onClick={() => void auth.signOut()}>Sair neste dispositivo</button>
      </section>
    </section>
  )
}
