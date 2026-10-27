import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/vt323/latin-400.css'
import '@fontsource/share-tech-mono/latin-400.css'
import './styles/base.css'
import './styles/terminal.css'
import './hub/hub.css'
import App from './App.tsx'

// After a new deploy, an open tab may ask for code files that no longer
// exist. Reload once to pick up the new version; if that also fails soon
// after, the error screen offers a manual reload instead of looping.
const RELOAD_KEY = 'atomic-hub:preload-reload'
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
