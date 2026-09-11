import { defineBrowserCommand } from '@vitest/browser'
import { playwright } from '@vitest/browser-playwright'
import {
  defineConfig,
  mergeConfig,
} from 'vitest/config'
import viteConfig from './vite.config.ts'

const browserExclude = [
  '**/*.test.{ts,tsx,js,jsx}',
  '**/node_modules/**',
  '**/dist/**',
]

interface AccessibilityMediaOptions {
  forcedColors?: 'active' | 'none' | null
  reducedMotion?: 'reduce' | 'no-preference' | null
}

const emulateAccessibilityMedia = defineBrowserCommand<
  [AccessibilityMediaOptions]
>(async ({ page }, options) => {
  await page.emulateMedia(options)
})

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
            // Real-route fixtures mutate same-origin storage and browser state.
            fileParallelism: false,
            include: ['**/*.vitest.{ts,tsx,js,jsx}'],
            exclude: browserExclude,
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              commands: { emulateAccessibilityMedia },
              instances: [{ browser: 'chromium' }],
            },
          },
        },
        {
          extends: true,
          test: {
            name: 'webkit',
            fileParallelism: false,
            include: [
              'app/app-accessibility.vitest.ts',
              'app/app-smoke.vitest.ts',
              'app/components/ParshaPicker.vitest.ts',
              'app/components/ScrollDisplay.vitest.ts',
              'app/components/interactive-styles.vitest.ts',
              'app/components/match-corpus.vitest.ts',
              'app/components/page-layout.vitest.ts',
              'app/navigation/command-palette.vitest.ts',
              'app/reader/bookmarks.vitest.ts',
              'app/reader/aliyah-permalink.vitest.ts',
              'app/reader/last-reading-prompt.vitest.ts',
              'app/reader/reader-cue-status.vitest.ts',
              'app/reader/reader-initial-position.vitest.ts',
              'app/reader/reader-keyboard-journey.vitest.ts',
              'app/reader/reader-responsive-layout.vitest.ts',
              'app/reader/reader-controls.vitest.ts',
              'app/reader/reader-route.vitest.ts',
              'app/reader/reader-settings.vitest.ts',
              'app/reader/media-panel.vitest.ts',
              'app/reader/reader-shell.vitest.ts',
              'app/reading/aliyah-navigation/aliyah-navigation.vitest.ts',
              'app/reading/floating-player.vitest.ts',
              'app/reading/last-reading.vitest.ts',
              'app/reading/reader-playback.vitest.ts',
              'app/reading/native-audio-controller.vitest.ts',
              'src/lib/components/ReaderApp.vitest.ts',
              'src/lib/components/ServiceWorkerUpdate.vitest.ts',
              'scripts/offline-transfer-queue.vitest.ts',
              'scripts/recording-mutation-locks.vitest.ts',
              'app/offline/playback-protection.vitest.ts',
              'app/offline/queue-protection.vitest.ts',
              'app/offline/capacity-reservations.vitest.ts',
              'app/offline/download-intent.vitest.ts',
              'src/routes/public-routes-real-url.vitest.ts',
            ],
            exclude: browserExclude,
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              commands: { emulateAccessibilityMedia },
              instances: [{ browser: 'webkit' }],
            },
          },
        },
      ],
    },
  })
)
