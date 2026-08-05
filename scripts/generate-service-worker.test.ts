import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import {
  isPageChunk,
  renderServiceWorkerSource,
  shouldPrecache,
  torahPageFilesFromManifest,
} from './generate-service-worker.mjs'

type FakeResponse = {
  ok: boolean
  status: number
  clone?: () => FakeResponse
}

function loadNetworkFirst({
  fetchResponse,
  fetchError,
  cachedResponse,
  fallbackResponse,
}: {
  fetchResponse?: FakeResponse
  fetchError?: Error
  cachedResponse?: FakeResponse
  fallbackResponse?: FakeResponse
}) {
  const cacheMatch = vi.fn(async (request: unknown) =>
    request === '/index.html' ? fallbackResponse : cachedResponse
  )
  const cache = { match: cacheMatch, put: vi.fn() }
  const context = {
    URL,
    fetch: vi.fn(async () => {
      if (fetchError) throw fetchError
      return fetchResponse
    }),
    caches: {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => []),
      delete: vi.fn(),
    },
    self: {
      addEventListener: vi.fn(),
      location: { origin: 'https://tikkun.test' },
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
    },
  }
  vm.runInNewContext(
    `${renderServiceWorkerSource({
      buildHash: 'test',
      shellUrls: ['/', '/index.html'],
      torahPageUrls: ['/assets/page-torah.js'],
    })}\nglobalThis.networkFirstForTest = networkFirst`,
    context
  )
  return (
    context as typeof context & {
      networkFirstForTest: (
        request: unknown,
        fallbackUrl: string
      ) => Promise<FakeResponse | undefined>
    }
  ).networkFirstForTest
}

test('navigation falls back for server errors and thrown network failures', async () => {
  const fallback = { ok: true, status: 200 }
  const serverFailure = { ok: false, status: 503 }
  await expect(
    loadNetworkFirst({
      fetchResponse: serverFailure,
      fallbackResponse: fallback,
    })({ url: '/route' }, '/index.html')
  ).resolves.toBe(fallback)

  await expect(
    loadNetworkFirst({
      fetchError: new Error('offline'),
      fallbackResponse: fallback,
    })({ url: '/route' }, '/index.html')
  ).resolves.toBe(fallback)
})

test('navigation preserves non-server HTTP responses and uncached server failures', async () => {
  const notFound = { ok: false, status: 404 }
  const serverFailure = { ok: false, status: 503 }
  await expect(
    loadNetworkFirst({ fetchResponse: notFound })(
      { url: '/missing' },
      '/index.html'
    )
  ).resolves.toBe(notFound)
  await expect(
    loadNetworkFirst({ fetchResponse: serverFailure })(
      { url: '/route' },
      '/index.html'
    )
  ).resolves.toBe(serverFailure)
})

test('precache keeps the app shell small and excludes deferred content', () => {
  expect(shouldPrecache('assets/app.js')).toBe(true)
  expect(shouldPrecache('assets/page-a1b2c3.js')).toBe(false)
  expect(shouldPrecache('assets/reader-parsha-picker-a1b2c3.js')).toBe(true)
  expect(shouldPrecache('assets/reader-command-palette-a1b2c3.js')).toBe(true)
  expect(shouldPrecache('assets/reader-settings-a1b2c3.js')).toBe(true)
  expect(shouldPrecache('assets/cue-data-a1b2c3.js')).toBe(false)
  expect(shouldPrecache('assets/optional-about-a1b2c3.js')).toBe(false)
  expect(shouldPrecache('assets/optional-cue-authoring-a1b2c3.js')).toBe(false)
  expect(shouldPrecache('assets/optional-cue-analytics-a1b2c3.js')).toBe(false)
  expect(shouldPrecache('assets/optional-recording-harness-a1b2c3.js')).toBe(false)
  expect(shouldPrecache('assets/cue-authoring-a1b2c3.css')).toBe(false)
  expect(shouldPrecache('audio/reader/aliyah.m4a')).toBe(false)
  expect(shouldPrecache('assets/movie.mp4')).toBe(false)
  expect(shouldPrecache('.vite/manifest.json')).toBe(false)
  expect(shouldPrecache('google-site-verification.html')).toBe(false)
  expect(shouldPrecache('assets/Lora-Regular-a1b2c3.ttf')).toBe(false)
  expect(shouldPrecache('assets/ShlomosemiStam-a1b2c3.ttf')).toBe(true)
  expect(shouldPrecache('service-worker.js')).toBe(false)
})

test('recognizes page chunks and selects only Torah entries from the Vite manifest', () => {
  expect(isPageChunk('assets/page-a1b2c3.js')).toBe(true)
  expect(isPageChunk('assets/reader-settings-a1b2c3.js')).toBe(false)
  expect(
    torahPageFilesFromManifest({
      'text/pages/torah/1.json': { file: 'assets/page-torah-1.js' },
      'text/pages/torah/2.json': { file: 'assets/page-torah-2.js' },
      'text/pages/esther/1.json': { file: 'assets/page-esther-1.js' },
      'app/index.ts': { file: 'assets/index.js' },
    })
  ).toEqual(['assets/page-torah-1.js', 'assets/page-torah-2.js'])
})

test('renders separate shell and opt-in Torah caches without caching recordings', () => {
  const source = renderServiceWorkerSource({
    buildHash: 'abc123',
    shellUrls: ['/', '/index.html', '/assets/index.js'],
    torahPageUrls: ['/assets/page-torah.js'],
  })

  expect(source).toContain("const SHELL_CACHE_NAME = SHELL_CACHE_PREFIX + 'abc123'")
  expect(source).toContain("const TORAH_CACHE_NAME = 'tikkun-torah-v1'")
  expect(source).toContain("event.data?.type === 'DOWNLOAD_TORAH_PAGES'")
  expect(source).toContain('TORAH_DOWNLOAD_CONCURRENCY = 4')
  expect(source).toContain('if (MEDIA_PATH_RE.test(url.pathname)')
  expect(source).toContain('TORAH_PAGE_PATHS.has(url.pathname)')
})
