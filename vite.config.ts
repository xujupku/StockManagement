import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/v1': {
        target: 'http://39.96.197.206:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://39.96.197.206:8000',
        changeOrigin: true,
      },
    },
  },
})
