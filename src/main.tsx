import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'
import './styles/auth.css'
import './styles/recipes.css'
import './styles/recipe-controls.css'
import './styles/planner.css'
import './styles/shopping.css'
import './styles/search.css'
import './styles/imports.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Application root element is missing')
createRoot(rootElement).render(<StrictMode><App /></StrictMode>)
