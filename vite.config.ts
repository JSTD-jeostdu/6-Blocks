import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves this project from https://<user>.github.io/6-Blocks/,
  // so all built asset URLs must be prefixed with the repository name.
  base: '/6-Blocks/',
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    port: 3000,
  },
})
