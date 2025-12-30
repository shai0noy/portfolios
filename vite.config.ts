import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/exchangerate': {
        target: 'https://api.exchangerate.host',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/exchangerate/, ''),
      },
      '/api/globes': {
        target: 'https://www.globes.co.il',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/globes/, ''),
        headers: { referer: 'https://www.globes.co.il/' }
      },
    },
  },
})
