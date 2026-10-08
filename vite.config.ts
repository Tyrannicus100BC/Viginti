import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error Enmanner's vendored JavaScript adapter ships without TypeScript declarations.
import { enmannerLiveUpdates } from './.enmanner/adapters/vite-live-updates.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), enmannerLiveUpdates()],
})
