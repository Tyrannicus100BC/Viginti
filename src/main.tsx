import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ResponsiveLayout } from './components/ResponsiveLayout'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ResponsiveLayout>
      <App />
    </ResponsiveLayout>
  </StrictMode>,
)
