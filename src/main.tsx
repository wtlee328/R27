import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Handle dynamic import errors after new deployments automatically
window.addEventListener('vite:preloadError', (event) => {
  console.warn('New deployment detected, reloading page to fetch latest version:', event)
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
