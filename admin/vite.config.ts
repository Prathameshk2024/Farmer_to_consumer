import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = path.dirname(fileURLToPath(import.meta.url))
const shared = path.resolve(here, '../shared/src')

/**
 * The admin console is a separate deployment from the seller app - its own
 * Vercel project, pointed at the same Cloud Run API - but it lives in this repo so
 * it imports `shared/src/types.ts` directly. A copied type would drift the
 * first time Seller or SubscriptionPayment changed, and drift silently.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@shared\/(.*)\.js$/, replacement: `${shared}/$1.ts` }],
  },
  server: {
    // 5174, so it can run beside the seller app on 5173 without a fight.
    port: 5174,
    host: true,
    fs: { allow: [here, shared] },
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
})
