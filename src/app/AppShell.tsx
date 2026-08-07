import { Link, Outlet, useLocation } from 'react-router'
import { BottomNav } from '../components/navigation/BottomNav'

export function AppShell() {
  const { pathname } = useLocation()

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-brand" to="/recipes" aria-label="Receitas — início">
          <span className="app-brand__mark" aria-hidden="true">R</span>
          <span>Caderno de receitas</span>
        </Link>
      </header>

      <main className="app-main" id="main-content">
        <Outlet />
      </main>

      <BottomNav currentPath={pathname} />
    </div>
  )
}
