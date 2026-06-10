import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages deploys at /karaoke/ — local dev still works via this path
  base: process.env.GITHUB_PAGES ? '/karaoke/' : '/',
})
