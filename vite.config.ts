/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: 'static',
  test: {
    include: ['**/*.{test,vitest}.{ts,tsx,js,jsx}'],
    includeTaskLocation: true,
    mockReset: true,
  },
})
