import type { ComponentType } from 'react'
import {
  BookOpenText,
  Calendar,
  ClockArrowUp,
  Settings,
  ShoppingBasket,
} from 'lucide-react'
import { Link } from 'react-router'

export type AppRoute =
  | '/recipes'
  | '/planner'
  | '/shopping'
  | '/history'
  | '/settings'

export interface AppNavItem {
  route: AppRoute
  label: string
  icon: ComponentType<{ 'aria-hidden'?: boolean; size?: number }>
}

export const appNavItems: readonly AppNavItem[] = [
  { route: '/recipes', label: 'Receitas', icon: BookOpenText },
  { route: '/planner', label: 'Planejar', icon: Calendar },
  { route: '/shopping', label: 'Compras', icon: ShoppingBasket },
  { route: '/history', label: 'Histórico', icon: ClockArrowUp },
  { route: '/settings', label: 'Configurações', icon: Settings },
]

interface BottomNavProps {
  currentPath: string
}

export function BottomNav({ currentPath }: BottomNavProps) {
  return (
    <nav className="primary-nav" aria-label="Navegação principal">
      {appNavItems.map(({ route, label, icon: Icon }) => {
        const isActive = currentPath === route

        return (
          <Link
            key={route}
            className="primary-nav__item"
            data-active={isActive || undefined}
            aria-current={isActive ? 'page' : undefined}
            to={route}
          >
            <Icon aria-hidden={true} size={21} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
