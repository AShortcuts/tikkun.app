import { sveltekit } from '@sveltejs/kit/vite'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { defineConfig, type UserConfig } from 'vite'
import { resolveBuildIdentifier } from './scripts/build-identifier.ts'
import { publicReadingCoveragePlugin } from './scripts/public-reading-coverage-plugin.ts'
import { nativeBuildConfig } from './scripts/native-build-config.mjs'
import { contentInventoryPlugin } from './scripts/content-inventory-plugin.ts'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
export const defaultViteHost = '127.0.0.1'
export const buildIdentifier = resolveBuildIdentifier()
const native = nativeBuildConfig()
const contentVersion = randomUUID()

export const viteConfig = {
  plugins: [publicReadingCoveragePlugin(), sveltekit(), contentInventoryPlugin(contentVersion)],
  define: {
    __TIKKUN_BUILD_ID__: JSON.stringify(buildIdentifier),
    'import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN': JSON.stringify(native.mediaOrigin),
    'import.meta.env.TIKKUN_CONTENT_VERSION': JSON.stringify(contentVersion),
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
