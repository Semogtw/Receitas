import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { BottomNav } from '../components/navigation/BottomNav'
import { SyncStatus } from '../features/sync/SyncStatus'

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const showImportShortcut = pathname === '/recipes'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__row">
          <Link className="app-brand" to="/recipes" aria-label="Receitas — início">
            <span className="app-brand__mark" aria-hidden="true">R</span>
            <span>Caderno de receitas</span>
          </Link>
          <div className="app-header__actions">
            {showImportShortcut ? <Link className="button button--quiet app-header__import" to="/recipes/import">Importar</Link> : null}
            <SyncStatus onOpenConflicts={() => navigate('/conflicts')} />
          </div>
        </div>
      </header>

      <main className="app-main" id="main-content">
        <Outlet />
      </main>

      <BottomNav currentPath={pathname} />
    </div>
  )
}
