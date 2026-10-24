import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'

const Game = lazy(async () => {
  const [{ default: App }, { ResponsiveLayout }, { startRunFromUrl }] = await Promise.all([
    import('./App.tsx'), import('./components/ResponsiveLayout'), import('./store/quickStart'),
  ])
  startRunFromUrl(window.location.search)
  return { default: () => <ResponsiveLayout><App /></ResponsiveLayout> }
})
const BalanceLab = lazy(() => import('./simulation/BalanceLab'))
const RaiseGallery = lazy(() => import('./components/RaiseGallery'))
const route = window.location.pathname.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div style={{ padding: 32 }}>Loading…</div>}>
        {route === '/balance' ? <BalanceLab /> : route === '/raises' ? <RaiseGallery /> : <Game />}
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
