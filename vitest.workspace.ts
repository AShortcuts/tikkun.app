import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: 'vite.config.ts',
    test: {
      include: ['**/*.test.{ts,tsx,js,jsx}'],
      exclude: ['**/*.vitest.{ts,tsx,js,jsx}', '**/node_modules/**', '**/dist/**'],
      name: 'node',
    },
  },
  {
    extends: 'vite.config.ts',
    test: {
      include: ['**/*.vitest.{ts,tsx,js,jsx}'],
      exclude: ['**/*.test.{ts,tsx,js,jsx}', '**/node_modules/**', '**/dist/**'],
      name: 'browser',
      browser: {
        enabled: true,
        headless: true,
        name: 'chromium',
        provider: 'playwright',
        // https://playwright.dev
        providerOptions: {},
      },
    },
  },
])
