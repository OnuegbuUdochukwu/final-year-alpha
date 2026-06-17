import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    // In dev mode, proxy all /api/* requests to the API Gateway running on :8080.
    // This avoids CORS issues and mirrors the production routing topology.
    proxy: {
      '/api': {
        target: process.env.VITE_GATEWAY_URL ?? 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
