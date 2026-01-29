import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ResponsiveLayout } from './components/ResponsiveLayout'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ResponsiveLayout>
        <App />
      </ResponsiveLayout>
    </ErrorBoundary>
  </StrictMode>,
)
