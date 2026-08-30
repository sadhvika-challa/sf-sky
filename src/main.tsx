import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PUBLIC_SERVICE_WORKER_PATH } from './platform/publicUrlContract.ts'
import { matchPublicRoute } from './public/routes.ts'

const publicRoute = matchPublicRoute(window.location.pathname)
const root = createRoot(document.getElementById('root')!)

document.documentElement.classList.toggle('soleil-public-page', publicRoute !== null)

async function renderRoute(): Promise<void> {
  if (publicRoute) {
    const { default: PublicPage } = await import('./public/PublicPage.tsx')

    root.render(
      <StrictMode>
        <PublicPage route={publicRoute} />
      </StrictMode>,
    )
    return
  }

  const [{ default: App }] = await Promise.all([
    import('./App.tsx'),
    import('leaflet/dist/leaflet.css'),
  ])

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// Keep the document load boundary aligned with the route being interactive.
// Tests, offline transitions, and assistive technology can then treat a
// completed navigation as a fully mounted Soleil route.
await renderRoute()

// Register the finalized service worker only for production web builds.
if (import.meta.env.PROD) {
  const registerServiceWorker = () => {
    void import('./platform/runtime.ts').then(({ isNativeRuntime }) => {
      if (!isNativeRuntime() && 'serviceWorker' in navigator) {
        navigator.serviceWorker.register(PUBLIC_SERVICE_WORKER_PATH).catch(() => {
          // Service worker registration failed. The app still works without it.
        })
      }
    })
  }

  if (document.readyState === 'complete') {
    registerServiceWorker()
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true })
  }
}
