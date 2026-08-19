import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

const browserExclude = [
  '**/*.test.{ts,tsx,js,jsx}',
  '**/node_modules/**',
  '**/dist/**',
]

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      includeTaskLocation: true,
      mockReset: true,
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            include: ['**/*.test.{ts,tsx,js,jsx}'],
            exclude: [
              '**/*.vitest.{ts,tsx,js,jsx}',
              '**/node_modules/**',
              '**/dist/**',
            ],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            include: ['**/*.vitest.{ts,tsx,js,jsx}'],
            exclude: browserExclude,
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: 'chromium' }],
            },
          },
        },
        {
          extends: true,
          test: {
            name: 'webkit',
            include: [
              'app/reading/reader-playback.vitest.ts',
              'app/reader/reader-shell.vitest.ts',
              'app/app-smoke.vitest.ts',
            ],
            exclude: browserExclude,
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: 'webkit' }],
            },
          },
        },
      ],
    },
  })
)
