import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'
import './styles/auth.css'
import './styles/recipes.css'
import './styles/recipe-controls.css'
import './styles/cooking.css'
import './styles/media.css'
import './styles/planner.css'
import './styles/shopping.css'
import './styles/search.css'
import './styles/imports.css'
import './styles/backup.css'
import './styles/diagnostics.css'
import './styles/account-admin.css'
import './styles/trash.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
