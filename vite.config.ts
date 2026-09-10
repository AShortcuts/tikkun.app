import { sveltekit } from '@sveltejs/kit/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'vite'
import { resolveBuildIdentifier } from './scripts/build-identifier.ts'
import { publicReadingCoveragePlugin } from './scripts/public-reading-coverage-plugin.ts'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
export const defaultViteHost = '127.0.0.1'
export const buildIdentifier = resolveBuildIdentifier()

export const viteConfig = {
  plugins: [publicReadingCoveragePlugin(), sveltekit()],
  define: {
    __TIKKUN_BUILD_ID__: JSON.stringify(buildIdentifier),
  },
  server: {
    host: defaultViteHost,
    port: 5176,
    strictPort: true,
    fs: {
      allow: [projectRoot],
    },
  },
  preview: {
    host: defaultViteHost,
    port: 4176,
    strictPort: true,
  },
  build: {
    manifest: true,
  },
} satisfies UserConfig

export default defineConfig(viteConfig)
