// Standalone Vite config for the iPad / browser build. The Electron renderer
// continues to use electron-vite (electron.vite.config.ts); this config wires
// the same React source through the WebSocket-backed bootstrap and outputs to
// out/web so the Pi server can serve it as static files.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'src/renderer/public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@renderer': resolve(__dirname, 'src/renderer/src') },
  },
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: { index: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8080', ws: true, changeOrigin: true },
    },
  },
})
