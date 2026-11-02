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

const emulateColorScheme = defineBrowserCommand<['light' | 'dark' | null]>(async ({ page }, colorScheme) => {
  await page.emulateMedia({ colorScheme })
})

const emulatePhoneTouch = defineBrowserCommand<[]>(async ({ context }) => {
  // Desktop WebKit leaves touch points and nested-frame screen sizes unemulated.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 1 })
    Object.defineProperties(screen, {
      width: { configurable: true, value: 390 },
      height: { configurable: true, value: 844 },
    })
  })
})

const blockPhoneTextPage = defineBrowserCommand<[number | null]>(async ({ context }, pageNumber) => {
  const pattern = '**/text/pages/torah/*.json*'
  await context.unroute(pattern)
  if (pageNumber !== null) {
    await context.route(pattern, route => new URL(route.request().url()).pathname.endsWith(`/${pageNumber}.json`)
      ? route.abort('failed') : route.continue())
  }
})

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Tests prebuild dependencies in their own folder, so a run never replaces the files a
    // running dev server is serving (which leaves the reader stuck on its loading screen).
    cacheDir: 'node_modules/.vite-test',
    test: {
      includeTaskLocation: true,
      mockReset: true,
      projects: [
        {
          extends: true,
          test: {
            name: 'phone',
            fileParallelism: false,
            include: ['app/reader/reader-isolated.phone.ts'],
            browser: {
              enabled: true,
              headless: true,
              commands: { emulatePhoneTouch, blockPhoneTextPage },
              viewport: { width: 390, height: 844 },
              provider: playwright({ contextOptions: {
                hasTouch: true,
                isMobile: true,
                screen: { width: 390, height: 844 },
              } }),
              instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
            },
          },
        },
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
              commands: { emulateAccessibilityMedia, emulateColorScheme },
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
              // Only where Safari's engine behaves differently: startup paint, scrolling,
              // Hebrew text layout, printing, touch, Web Locks and signature checks.
              'src/reader-theme.vitest.ts',
              'app/app-smoke.vitest.ts',
              'app/updates/web-runtime.vitest.ts',
              'app/components/ScrollDisplay.vitest.ts',
              'app/components/page-layout.vitest.ts',
              'app/printing/print-esther.vitest.ts',
              'app/reader/reader-aliyah-scroll.vitest.ts',
              'app/reader/reader-keyboard-journey.vitest.ts',
              'app/reader/reader-swipe-back.vitest.ts',
              'scripts/offline-transfer-queue.vitest.ts',
              'scripts/recording-mutation-locks.vitest.ts',
            ],
            exclude: browserExclude,
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              commands: { emulateAccessibilityMedia, emulateColorScheme },
              instances: [{ browser: 'webkit' }],
            },
          },
        },
      ],
    },
  })
)
