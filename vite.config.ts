/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import type { PreRenderedChunk } from 'rollup'

const normalizeModuleId = (moduleId: string) =>
  moduleId.replace(/\\/g, '/')

export function chunkFileName(chunk: PreRenderedChunk) {
  const moduleIds = chunk.moduleIds.map(normalizeModuleId)
  if (
    chunk.facadeModuleId &&
    normalizeModuleId(chunk.facadeModuleId).endsWith(
      '/app/admin/cue-authoring.ts'
    )
  ) {
    return 'assets/optional-cue-authoring-[hash].js'
  }
  if (
    chunk.facadeModuleId &&
    normalizeModuleId(chunk.facadeModuleId).endsWith(
      '/app/components/CueAnalyticsPage.ts'
    )
  ) {
    return 'assets/optional-cue-analytics-[hash].js'
  }
  if (
    chunk.facadeModuleId &&
    normalizeModuleId(chunk.facadeModuleId).endsWith(
      '/app/components/AboutPage.ts'
    )
  ) {
    return 'assets/optional-about-[hash].js'
  }
  if (moduleIds.some((moduleId) => moduleId.includes('/audio-cues/'))) {
    return 'assets/cue-data-[hash].js'
  }
  if (moduleIds.some((moduleId) => moduleId.includes('/text/pages/'))) {
    return 'assets/page-[hash].js'
  }
  return 'assets/[name]-[hash].js'
}

export default defineConfig({
  plugins: [svelte()],
  publicDir: 'site',
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: chunkFileName,
      },
    },
  },
  test: {
    include: ['**/*.{test,vitest}.{ts,tsx,js,jsx}'],
    includeTaskLocation: true,
    mockReset: true,
  },
})
