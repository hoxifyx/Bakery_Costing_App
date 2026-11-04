import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The sandbox preview proxies the dev server under
  // https://<port>-<sandbox-id>.e2b.app, which Vite's host check rejects by
  // default ("Blocked request"). Allow only that preview domain (and its
  // subdomains) instead of disabling the check with `allowedHosts: true`.
  // Both settings affect the dev/preview servers only, never the built app.
  server: {
    allowedHosts: ['.e2b.app'],
  },
  preview: {
    allowedHosts: ['.e2b.app'],
  },
})
