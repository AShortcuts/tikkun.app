import { sveltekit } from '@sveltejs/kit/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
export const defaultViteHost = '127.0.0.1'

export const viteConfig = {
  plugins: [sveltekit()],
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
