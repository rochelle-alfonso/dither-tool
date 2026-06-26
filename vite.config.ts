import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/dither-tool/, so assets need this base.
// https://vite.dev/config/
export default defineConfig({
  base: '/dither-tool/',
  plugins: [react()],
})
