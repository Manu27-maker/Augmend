import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies /api requests to the Express backend.
// The current UI uses a mocked analysis service, so the proxy is only
// exercised once the real endpoint is wired up.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
