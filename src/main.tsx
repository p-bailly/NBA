import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { isNative } from './lib/notifications'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker (installation sur l'écran d'accueil, ouverture hors-ligne, notifications).
// Inutile dans l'appli Android, qui embarque déjà les fichiers.
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'))
}
