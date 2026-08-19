import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import {
  assertPrecachedHtmlDependencies,
  assertShellPrecacheBudget,
  cacheNamespaceForBasePath,
  classifyManifestFiles,
  MAX_SHELL_PRECACHE_RAW_BYTES,
  MAX_SHELL_PRECACHE_URLS,
  normalizeBasePath,
  prototypeRouteNodeSources,
  renderServiceWorkerSource,
  shellAssetReferencesFromHtml,
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
  '.svelte-kit/generated/client-optimized/app.js': {
    file: '_app/immutable/entry/app.js',
    isEntry: true,
    dynamicImports: [
      '.svelte-kit/generated/client-optimized/nodes/10.js',
    ],
  },
  '.svelte-kit/generated/client-optimized/nodes/10.js': {
    file: '_app/immutable/nodes/prototype-index.js',
    isEntry: true,
    imports: ['_BCaVwE0w.js', '_CZtLFM2E.js'],
    css: [
      '_app/immutable/assets/prototype-index.css',
      '_app/immutable/assets/site.css',
    ],
  },
  '.svelte-kit/generated/client-optimized/nodes/2.js': {
    file: '_app/immutable/nodes/site-layout.js',
    isEntry: true,
    imports: ['_CZtLFM2E.js'],
    css: ['_app/immutable/assets/site.css'],
  },
  '_BCaVwE0w.js': {
    file: '_app/immutable/chunks/BCaVwE0w.js',
  },
  '_CZtLFM2E.js': {
    file: '_app/immutable/chunks/CZtLFM2E.js',
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

test('excludes prototype-only dependencies while retaining shared core assets', () => {
  const { excludedFiles, torahPageFiles } = classifyManifestFiles(
    manifest,
    new Set(['.svelte-kit/generated/client-optimized/nodes/10.js'])
  )

  expect(torahPageFiles).toEqual([
    '_app/immutable/chunks/torah-1.js',
    '_app/immutable/chunks/torah-2.js',
  ])
  expect(excludedFiles).toContain('_app/immutable/chunks/esther-1.js')
  expect(excludedFiles).toContain('_app/immutable/chunks/cues-1.js')
  expect(excludedFiles).toContain('_app/immutable/chunks/cue-authoring.js')
  expect(excludedFiles).toContain('_app/immutable/assets/cue-authoring.css')
  expect(excludedFiles).toContain('_app/immutable/nodes/prototype-index.js')
  expect(excludedFiles).toContain('_app/immutable/assets/prototype-index.css')
  expect(excludedFiles).toContain('_app/immutable/chunks/BCaVwE0w.js')
  expect(excludedFiles).not.toContain('_app/immutable/assets/site.css')
  expect(excludedFiles).not.toContain('_app/immutable/chunks/CZtLFM2E.js')
  expect(excludedFiles).not.toContain('_app/immutable/chunks/parsha-picker.js')
})

test('requires every stylesheet and modulepreload referenced by shell HTML', () => {
  const html = `
    <link href="./_app/site.css" rel="stylesheet preload">
    <link rel='modulepreload' href='./_app/entry.js'>
    <link rel="icon" href="./favicon.ico">
    <link rel="stylesheet" href="https://cdn.example.com/external.css">
  `
  const shellFiles = ['index.html', '_app/site.css', '_app/entry.js']

  expect(shellAssetReferencesFromHtml(html)).toEqual([
    '_app/entry.js',
    '_app/site.css',
  ])
  expect(() =>
    assertPrecachedHtmlDependencies({
      shellFiles,
      htmlSources: new Map([['index.html', html]]),
    })
  ).not.toThrow()
  expect(() =>
    assertPrecachedHtmlDependencies({
      shellFiles: shellFiles.filter((file) => file !== '_app/site.css'),
      htmlSources: new Map([['index.html', html]]),
    })
  ).toThrow('index.html -> _app/site.css')
})

test('resolves nested shell dependencies within a deployment base path', () => {
  const html = '<link rel="stylesheet" href="../_app/site.css">'

  expect(
    shellAssetReferencesFromHtml(
      html,
      'about/index.html',
      '/pr-preview/pr-42'
    )
  ).toEqual(['_app/site.css'])
})

test('finds prototype page and layout nodes in the generated route table', () => {
  expect(
    [...prototypeRouteNodeSources(`
      "/": [5],
      "/prototypes": [10],
      "/prototypes/apple-sentient": [11,[3]],
      "/prototypes/scroll-story": [16,[4]],
    `)].sort()
  ).toEqual([
    '.svelte-kit/generated/client-optimized/nodes/10.js',
    '.svelte-kit/generated/client-optimized/nodes/11.js',
    '.svelte-kit/generated/client-optimized/nodes/16.js',
    '.svelte-kit/generated/client-optimized/nodes/3.js',
    '.svelte-kit/generated/client-optimized/nodes/4.js',
  ])
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
  expect(
    shouldPrecache('_app/immutable/chunks/search-index.js', excludedFiles)
  ).toBe(true)
  expect(
    shouldPrecache('_app/immutable/chunks/command-palette.js', excludedFiles)
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
  expect(shouldPrecache('_headers', excludedFiles)).toBe(false)
  expect(shouldPrecache('_redirects', excludedFiles)).toBe(false)
  expect(shouldPrecache('prototypes/index.html', excludedFiles)).toBe(false)
  expect(
    shouldPrecache('assets/images/prototypes/reader.png', excludedFiles)
  ).toBe(false)
})

test('accepts shell precache metrics at both release limits', () => {
  expect(() =>
    assertShellPrecacheBudget({
      urlCount: MAX_SHELL_PRECACHE_URLS,
      rawBytes: MAX_SHELL_PRECACHE_RAW_BYTES,
    })
  ).not.toThrow()
})

test('rejects shell precache URL and raw-byte budget overruns clearly', () => {
  expect(() =>
    assertShellPrecacheBudget({
      urlCount: MAX_SHELL_PRECACHE_URLS + 1,
      rawBytes: MAX_SHELL_PRECACHE_RAW_BYTES,
    })
  ).toThrow(
    `${MAX_SHELL_PRECACHE_URLS + 1} URLs exceeds ${MAX_SHELL_PRECACHE_URLS}-URL limit`
  )
  expect(() =>
    assertShellPrecacheBudget({
      urlCount: MAX_SHELL_PRECACHE_URLS,
      rawBytes: MAX_SHELL_PRECACHE_RAW_BYTES + 1,
    })
  ).toThrow(
    `${MAX_SHELL_PRECACHE_RAW_BYTES + 1} raw bytes exceeds ${MAX_SHELL_PRECACHE_RAW_BYTES}-byte limit`
  )
  expect(() =>
    assertShellPrecacheBudget({
      urlCount: MAX_SHELL_PRECACHE_URLS + 1,
      rawBytes: MAX_SHELL_PRECACHE_RAW_BYTES + 1,
    })
  ).toThrow(
    `Service-worker shell precache budget exceeded: ${MAX_SHELL_PRECACHE_URLS + 1} URLs exceeds ${MAX_SHELL_PRECACHE_URLS}-URL limit; ${MAX_SHELL_PRECACHE_RAW_BYTES + 1} raw bytes exceeds ${MAX_SHELL_PRECACHE_RAW_BYTES}-byte limit. Defer nonessential routes or assets.`
  )
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
  const cacheNamespace = cacheNamespaceForBasePath('/preview/app')
  const source = renderServiceWorkerSource({
    basePath: '/preview/app',
    buildHash: 'abc123',
    shellUrls: ['/preview/app/', '/preview/app/reader/'],
    torahPageUrls: ['/preview/app/_app/torah.js'],
  })

  expect(source).toContain("const BASE_PATH = '/preview/app'")
  expect(source).toContain(
    `const SHELL_CACHE_PREFIX = 'tikkun-shell-${cacheNamespace}-'`
  )
  expect(source).toContain("const SHELL_CACHE_NAME = SHELL_CACHE_PREFIX + 'abc123'")
  expect(source).toContain(
    `const TORAH_CACHE_NAME = 'tikkun-torah-${cacheNamespace}-v1'`
  )
  expect(source).toContain("event.data?.type === 'DOWNLOAD_TORAH_PAGES'")
  expect(source).toContain('TORAH_DOWNLOAD_CONCURRENCY = 4')
  expect(source).toContain("const MEDIA_PATH_PREFIX = BASE_PATH + '/audio/'")
  expect(source).toContain('TORAH_PAGE_PATHS.has(url.pathname)')
})

test('namespaces cache cleanup to one deployment base path', async () => {
  const currentNamespace = cacheNamespaceForBasePath('/preview/current')
  const otherNamespace = cacheNamespaceForBasePath('/preview/other')
  const currentCache = `tikkun-shell-${currentNamespace}-current`
  const obsoleteCache = `tikkun-shell-${currentNamespace}-obsolete`
  const otherCache = `tikkun-shell-${otherNamespace}-current`
  const deleted: string[] = []
  const context = {
    URL,
    fetch: vi.fn(),
    caches: {
      keys: vi.fn(async () => [currentCache, obsoleteCache, otherCache]),
      delete: vi.fn(async (key: string) => {
        deleted.push(key)
        return true
      }),
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
      basePath: '/preview/current',
      buildHash: 'current',
      shellUrls: [],
      torahPageUrls: [],
    })}\nglobalThis.cleanupForTest = removeObsoleteShellCaches`,
    context
  )

  await (
    context as typeof context & { cleanupForTest: () => Promise<void> }
  ).cleanupForTest()

  expect(deleted).toEqual([obsoleteCache])
})

test('cleans legacy unnamespaced caches only from the root deployment', async () => {
  const legacyShell = 'tikkun-shell-0123456789abcdef'
  const legacyTorah = 'tikkun-torah-v1'
  const unrelated = 'tikkun-shell-custom'

  const runCleanup = async (basePath: string) => {
    const deleted: string[] = []
    const context = {
      URL,
      fetch: vi.fn(),
      caches: {
        keys: vi.fn(async () => [legacyShell, legacyTorah, unrelated]),
        delete: vi.fn(async (key: string) => {
          deleted.push(key)
          return true
        }),
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
        basePath,
        buildHash: 'current',
        shellUrls: [],
        torahPageUrls: [],
      })}\nglobalThis.cleanupForTest = removeObsoleteShellCaches`,
      context
    )
    await (
      context as typeof context & { cleanupForTest: () => Promise<void> }
    ).cleanupForTest()
    return deleted
  }

  await expect(runCleanup('')).resolves.toEqual([legacyShell, legacyTorah])
  await expect(runCleanup('/preview/current')).resolves.toEqual([])
})
