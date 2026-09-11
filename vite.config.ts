import { sveltekit } from '@sveltejs/kit/vite'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { defineConfig, type UserConfig } from 'vite'
import { resolveBuildIdentifier } from './scripts/build-identifier.ts'
import { publicReadingCoveragePlugin } from './scripts/public-reading-coverage-plugin.ts'
import { nativeBuildConfig } from './scripts/native-build-config.mjs'
import { contentInventoryPlugin } from './scripts/content-inventory-plugin.ts'
import contentContract from './generated/native-content-contract.json' with { type: 'json' }
import { updateConfig } from './scripts/update-config.mjs'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
export const defaultViteHost = '127.0.0.1'
export const buildIdentifier = resolveBuildIdentifier()
const native = nativeBuildConfig()
const contentVersion = randomUUID()
const updates = native.enabled ? updateConfig() : { enabled: false, publicKey: '' }

export const viteConfig = {
  plugins: [publicReadingCoveragePlugin(), sveltekit(), contentInventoryPlugin(contentVersion)],
  define: {
    __TIKKUN_BUILD_ID__: JSON.stringify(buildIdentifier),
    'import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN': JSON.stringify(native.mediaOrigin),
    'import.meta.env.TIKKUN_CONTENT_VERSION': JSON.stringify(contentVersion),
    'import.meta.env.TIKKUN_CONTENT_COMPATIBILITY': JSON.stringify(contentContract.compatibility),
    'import.meta.env.TIKKUN_UPDATE_PUBLIC_KEY': JSON.stringify(updates.publicKey),
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
