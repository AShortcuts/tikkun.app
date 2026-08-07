import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import {
  classifyManifestFiles,
  normalizeBasePath,
  renderServiceWorkerSource,
  shouldPrecache,
  toDeploymentUrl,
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
  normalizedResponse,
  fallbackResponse,
}: {
  fetchResponse?: FakeResponse
  fetchError?: Error
  cachedResponse?: FakeResponse
  normalizedResponse?: FakeResponse
  fallbackResponse?: FakeResponse
}) {
  const cacheMatch = vi.fn(async (request: unknown) => {
    if (request === '/') return fallbackResponse
    if (request === '/route/') return normalizedResponse
    return cachedResponse
  })
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
      shellUrls: ['/', '/reader/'],
      torahPageUrls: ['/_app/immutable/chunks/torah.js'],
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

const manifest = {
  'text/pages/torah/1.json': {
    file: '_app/immutable/chunks/torah-1.js',
  },
  'text/pages/torah/2.json': {
    file: '_app/immutable/chunks/torah-2.js',
  },
  'text/pages/esther/1.json': {
    file: '_app/immutable/chunks/esther-1.js',
  },
  'audio-cues/yoni/beresheet/1.json': {
    file: '_app/immutable/chunks/cues-1.js',
  },
  'app/admin/cue-authoring.ts': {
    file: '_app/immutable/chunks/cue-authoring.js',
    css: ['_app/immutable/assets/cue-authoring.css'],
  },
  'app/components/ParshaPicker.ts': {
    file: '_app/immutable/chunks/parsha-picker.js',
  },
}

test('navigation falls back for server errors and thrown network failures', async () => {
  const fallback = { ok: true, status: 200 }
  const serverFailure = { ok: false, status: 503 }
  await expect(
    loadNetworkFirst({
      fetchResponse: serverFailure,
      fallbackResponse: fallback,
    })({ url: 'https://tikkun.test/route' }, '/')
  ).resolves.toBe(fallback)

  await expect(
    loadNetworkFirst({
      fetchError: new Error('offline'),
      fallbackResponse: fallback,
    })({ url: 'https://tikkun.test/route' }, '/')
  ).resolves.toBe(fallback)
})

test('navigation matches a cached trailing-slash page before the app fallback', async () => {
  const normalized = { ok: true, status: 200 }
  await expect(
    loadNetworkFirst({
      fetchError: new Error('offline'),
      normalizedResponse: normalized,
    })({ url: 'https://tikkun.test/route' }, '/')
  ).resolves.toBe(normalized)
})

test('navigation preserves non-server HTTP responses and uncached server failures', async () => {
  const notFound = { ok: false, status: 404 }
  const serverFailure = { ok: false, status: 503 }
  await expect(
    loadNetworkFirst({ fetchResponse: notFound })(
      { url: 'https://tikkun.test/missing' },
      '/'
    )
  ).resolves.toBe(notFound)
  await expect(
    loadNetworkFirst({ fetchResponse: serverFailure })(
      { url: 'https://tikkun.test/route' },
      '/'
    )
  ).resolves.toBe(serverFailure)
})

test('classifies manifest-backed deferred content without excluding core controls', () => {
  const { excludedFiles, torahPageFiles } = classifyManifestFiles(manifest)

  expect(torahPageFiles).toEqual([
    '_app/immutable/chunks/torah-1.js',
    '_app/immutable/chunks/torah-2.js',
  ])
  expect(excludedFiles).toContain('_app/immutable/chunks/esther-1.js')
  expect(excludedFiles).toContain('_app/immutable/chunks/cues-1.js')
  expect(excludedFiles).toContain('_app/immutable/chunks/cue-authoring.js')
  expect(excludedFiles).toContain('_app/immutable/assets/cue-authoring.css')
  expect(excludedFiles).not.toContain('_app/immutable/chunks/parsha-picker.js')
})

test('precache keeps the app shell small and excludes deferred content', () => {
  const { excludedFiles } = classifyManifestFiles(manifest)

  expect(shouldPrecache('_app/immutable/entry/app.js', excludedFiles)).toBe(true)
  expect(
    shouldPrecache('_app/immutable/chunks/torah-1.js', excludedFiles)
  ).toBe(false)
  expect(
    shouldPrecache('_app/immutable/chunks/parsha-picker.js', excludedFiles)
  ).toBe(true)
  expect(shouldPrecache('audio/reader/aliyah.m4a', excludedFiles)).toBe(false)
  expect(shouldPrecache('_app/immutable/assets/movie.mp4', excludedFiles)).toBe(false)
  expect(shouldPrecache('google-site-verification.html', excludedFiles)).toBe(false)
  expect(
    shouldPrecache('assets/fonts/NotoSansHebrew-Variable.ttf', excludedFiles)
  ).toBe(true)
  expect(shouldPrecache('assets/fonts/Lora-Regular.ttf', excludedFiles)).toBe(false)
  expect(
    shouldPrecache(
      '_app/immutable/assets/Lora-Regular.abc123.ttf',
      excludedFiles
    )
  ).toBe(false)
  expect(
    shouldPrecache(
      '_app/immutable/assets/ShlomosemiStam.abc123.ttf',
      excludedFiles
    )
  ).toBe(true)
  expect(shouldPrecache('service-worker.js', excludedFiles)).toBe(false)
})

test('selects only Torah entries from the SvelteKit client manifest', () => {
  expect(torahPageFilesFromManifest(manifest)).toEqual([
    '_app/immutable/chunks/torah-1.js',
    '_app/immutable/chunks/torah-2.js',
  ])
})

test('maps static files to clean deployment URLs and validates base paths', () => {
  expect(toDeploymentUrl('index.html')).toBe('/')
  expect(toDeploymentUrl('about/index.html')).toBe('/about/')
  expect(toDeploymentUrl('about/index.html', '/preview/app/')).toBe(
    '/preview/app/about/'
  )
  expect(toDeploymentUrl('_app/app.js', '/preview/app')).toBe(
    '/preview/app/_app/app.js'
  )
  expect(normalizeBasePath('/preview/app/')).toBe('/preview/app')
  expect(() => normalizeBasePath('preview/app')).toThrow()
})

test('renders base-aware shell and opt-in Torah caches without caching recordings', () => {
  const source = renderServiceWorkerSource({
    basePath: '/preview/app',
    buildHash: 'abc123',
    shellUrls: ['/preview/app/', '/preview/app/reader/'],
    torahPageUrls: ['/preview/app/_app/torah.js'],
  })

  expect(source).toContain("const BASE_PATH = '/preview/app'")
  expect(source).toContain("const SHELL_CACHE_NAME = SHELL_CACHE_PREFIX + 'abc123'")
  expect(source).toContain("const TORAH_CACHE_NAME = 'tikkun-torah-v1'")
  expect(source).toContain("event.data?.type === 'DOWNLOAD_TORAH_PAGES'")
  expect(source).toContain('TORAH_DOWNLOAD_CONCURRENCY = 4')
  expect(source).toContain("const MEDIA_PATH_PREFIX = BASE_PATH + '/audio/'")
  expect(source).toContain('TORAH_PAGE_PATHS.has(url.pathname)')
})
