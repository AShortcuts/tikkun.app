import { sveltekit } from '@sveltejs/kit/vite'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { defineConfig, type UserConfig } from 'vite'
import { resolveBuildIdentifier } from './scripts/build-identifier.ts'
import { publicReadingCoveragePlugin } from './scripts/public-reading-coverage-plugin.ts'
import { devServerRestartPlugin } from './scripts/dev-server-restart.mjs'
import { nativeBuildConfig } from './scripts/native-build-config.mjs'
import { contentInventoryPlugin } from './scripts/content-inventory-plugin.ts'
import { updateConfig } from './scripts/update-config.mjs'
import { analyticsConfig } from './app/analytics/config.ts'
import analyticsPublic from './config/analytics-public.json' with { type: 'json' }

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
export const defaultViteHost = '0.0.0.0'
export const buildIdentifier = resolveBuildIdentifier()
const native = nativeBuildConfig()
const contentVersion = randomUUID()
const updates = native.enabled ? updateConfig() : { enabled: false, publicKey: '' }

export const viteConfig = {
  plugins: [devServerRestartPlugin(), publicReadingCoveragePlugin(), sveltekit(), contentInventoryPlugin(contentVersion)],
  define: {
    __TIKKUN_BUILD_ID__: JSON.stringify(buildIdentifier),
    __TIKKUN_ANALYTICS_CONFIG__: JSON.stringify(analyticsConfig({ ...analyticsPublic, ...process.env })),
    'import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN': JSON.stringify(native.mediaOrigin),
    'import.meta.env.TIKKUN_CONTENT_VERSION': JSON.stringify(contentVersion),
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
    host: '127.0.0.1',
    port: 4176,
    strictPort: true,
  },
  build: {
    manifest: true,
  },
} satisfies UserConfig

export default defineConfig(viteConfig)
