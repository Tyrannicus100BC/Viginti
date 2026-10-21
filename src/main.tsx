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
const isBalanceLab = window.location.pathname.replace(/\/$/, '') === '/balance'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div style={{ padding: 32 }}>Loading…</div>}>
        {isBalanceLab ? <BalanceLab /> : <Game />}
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
