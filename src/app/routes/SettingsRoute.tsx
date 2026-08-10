import { BackupPanel } from '../../features/backup/components/BackupPanel'
import { CompleteBackupPanel } from '../../features/backup/components/CompleteBackupPanel'
import { CompleteRestorePanel } from '../../features/backup/components/CompleteRestorePanel'
import { ReplaceRestorePanel } from '../../features/backup/components/ReplaceRestorePanel'
import { ConflictCenter } from '../../features/conflicts/ConflictCenter'
import { DiagnosticsScreen } from '../../features/diagnostics/components/DiagnosticsScreen'
import { AccountAdminScreen } from '../../features/auth/AccountAdminScreen'
import { PairInviteForm } from '../../features/auth/PairInviteForm'
import { useAuth } from '../../features/auth/AuthProvider'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { APP_VERSION } from '../../lib/app-version'
import { TrashPanel } from '../../features/trash/TrashPanel'

export function SettingsRoute() {
  const auth = useAuth()
  const database = usePowerSyncDatabase()
  const canManagePair = Boolean(auth.userId && auth.pairId)

  return (
    <section className="route-section" aria-labelledby="settings-title">
      <p className="route-kicker">Preferências</p>
      <h1 id="settings-title">Configurações</h1>
      <p className="route-intro">
        Ajustes do dispositivo, convites do par, lixeira, backup e recursos de recuperação ficam concentrados aqui.
      </p>
      {canManagePair ? <PairInviteForm /> : null}
      {auth.userId && auth.pairId ? (
        <TrashPanel
          database={database}
          pairId={auth.pairId}
          actorUserId={auth.userId}
        />
      ) : null}
      <BackupPanel />
      {auth.userId && auth.pairId ? (
        <CompleteBackupPanel
          database={database}
          pairId={auth.pairId}
          actorUserId={auth.userId}
          appVersion={APP_VERSION}
        />
      ) : null}
      {auth.userId && auth.pairId ? (
        <CompleteRestorePanel
          database={database}
          pairId={auth.pairId}
          actorUserId={auth.userId}
        />
      ) : null}
      {auth.userId && auth.pairId ? (
        <ReplaceRestorePanel
          database={database}
          pairId={auth.pairId}
          actorUserId={auth.userId}
          appVersion={APP_VERSION}
        />
      ) : null}
      <ConflictCenter />
      <DiagnosticsScreen database={database} appVersion={APP_VERSION} />
      {auth.userId && auth.pairId ? (
        <details className="account-admin-shell">
          <summary>Administração excepcional das duas contas</summary>
          <AccountAdminScreen
            database={database}
            pairId={auth.pairId}
            actorUserId={auth.userId}
            appVersion={APP_VERSION}
          />
        </details>
      ) : null}
      <div className="settings-card">
        <h2>Tema</h2>
        <p>O app respeita o tema claro ou escuro do sistema.</p>
      </div>
    </section>
  )
}
