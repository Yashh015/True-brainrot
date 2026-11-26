import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: process.env.BASE || '/',
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), privacy: resolve(__dirname, 'privacy.html') } } },
  test: { include: ['test/**/*.test.ts'] },
})
