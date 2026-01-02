import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: '/portfolios',
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
        '/api/yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        },
        '/api/query2': {
          target: 'https://query2.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/query2/, ''),
        },
      },
    },
  }
})