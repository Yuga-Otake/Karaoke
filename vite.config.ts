import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Unique id per build: the app compares it with /version.json to detect a new deploy
const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) +
  '-' + Math.random().toString(36).slice(2, 6)

function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  // GitHub Pages deploys at /karaoke/ — local dev still works via this path
  base: process.env.GITHUB_PAGES ? '/Karaoke/' : '/',
})
