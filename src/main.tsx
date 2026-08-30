import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import App from './App.tsx'
import { isNativeRuntime } from './platform/runtime.ts'
import PublicPage from './public/PublicPage.tsx'
import { matchPublicRoute } from './public/routes.ts'

const publicRoute = matchPublicRoute(window.location.pathname)

document.documentElement.classList.toggle('soleil-public-page', publicRoute !== null)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publicRoute ? <PublicPage route={publicRoute} /> : <App />}
  </StrictMode>,
)

// Register the finalized service worker only for production web builds.
if (import.meta.env.PROD && !isNativeRuntime() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — app still works without it
    });
  });
}
