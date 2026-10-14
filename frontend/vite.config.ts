import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'

const dir = typeof import.meta.dirname !== 'undefined' ? import.meta.dirname : path.resolve('.')
const buildTimestamp = Date.now()
const appVersion = '2.0.1'

function generateVersionJsonPlugin() {
  return {
    name: 'generate-version-json',
    buildStart() {
      const publicDir = path.resolve(dir, './public')
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true })
      }
      const versionData = {
        version: appVersion,
        buildTime: buildTimestamp,
        hash: Math.random().toString(36).substring(2, 10),
      }
      fs.writeFileSync(
        path.resolve(publicDir, 'version.json'),
        JSON.stringify(versionData, null, 2)
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), generateVersionJsonPlugin()],
  define: {
    __APP_BUILD_TIME__: JSON.stringify(buildTimestamp),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(dir, './src'),
    },
  },
})