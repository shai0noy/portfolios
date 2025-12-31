import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/exchangerate': {
          target: 'https://v6.exchangerate-api.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/exchangerate\/(.*)/, `/v6/${env.VITE_EXCHANGE_RATE_API_KEY}/latest/$1`),
        },
        '/api/globes': {
          target: 'https://www.globes.co.il',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/globes/, ''),
        },
      },
    },
  }
})
