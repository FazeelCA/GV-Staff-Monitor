import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Multi-page app: manager dashboard at '/'
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://track.gallerydigital.in',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'https://track.gallerydigital.in',
        changeOrigin: true,
      },
    },
  },
})
