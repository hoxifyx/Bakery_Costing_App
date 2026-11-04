import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow the sandbox preview host (https://<port>-<sandbox-id>.e2b.app) and
    // any other hostname; otherwise Vite answers with "Blocked request".
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
})
