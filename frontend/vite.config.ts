import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    // In dev mode, proxy all /api/* requests to the local API Gateway on :8080.
    // In production the VITE_GATEWAY_URL build-arg bakes the absolute URL into
    // the bundle, so this proxy block is only active during `npm run dev`.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
