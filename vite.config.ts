/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
  build: {
    manifest: true,
  },
  test: {
    include: ['**/*.{test,vitest}.{ts,tsx,js,jsx}'],
    includeTaskLocation: true,
    mockReset: true,
  },
})
