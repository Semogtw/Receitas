import { PairInviteForm } from '../../features/auth/PairInviteForm'
import { useAuth } from '../../features/auth/AuthProvider'
import { CompleteBackupPanel } from '../../features/backup/components/CompleteBackupPanel'
import { DiagnosticsScreen } from '../../features/diagnostics/components/DiagnosticsScreen'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { APP_VERSION } from '../../lib/app-version'

export function SettingsRoute() {
  const auth = useAuth()
  const database = usePowerSyncDatabase()

  return (
    <section className="route-section settings-page" aria-labelledby="settings-title">
      <p className="route-kicker">Preferências</p>
      <h1 id="settings-title">Configurações</h1>
      <p className="route-intro">Preferências do aplicativo, vínculo do par e opções desta sessão ficam aqui.</p>

      <PairInviteForm />

      {auth.pairId ? (
        <>
          <CompleteBackupPanel database={database} pairId={auth.pairId} appVersion={APP_VERSION} />
          <DiagnosticsScreen database={database} pairId={auth.pairId} appVersion={APP_VERSION} />
        </>
      ) : null}

      <section className="settings-section" aria-labelledby="session-title">
        <h2 id="session-title">Sessão</h2>
        <p>{auth.email ? `Conectado como ${auth.email}.` : 'Sessão autenticada.'}</p>
        {auth.restoredFromLocalScope ? <p>O caderno foi reaberto usando a autorização local validada anteriormente. Alterações remotas de conta serão confirmadas quando a conexão voltar.</p> : null}
        <button className="button button--quiet" type="button" onClick={() => void auth.signOut()}>Sair neste dispositivo</button>
      </section>
    </section>
  )
}
