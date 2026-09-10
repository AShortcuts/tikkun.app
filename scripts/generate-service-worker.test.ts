import { createHash } from 'node:crypto'
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
  deferredRouteNodeSources,
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

test('finds prototype and backup nodes while keeping the homepage in the shell', () => {
  expect(
    [...deferredRouteNodeSources(`
      "/": [5],
      "/(site)/old-v2.html": [7,[3]],
      "/prototypes": [10],
      "/prototypes/scroll-story": [16,[4]],
    `)].sort()
  ).toEqual([
    '.svelte-kit/generated/client-optimized/nodes/10.js',
    '.svelte-kit/generated/client-optimized/nodes/16.js',
    '.svelte-kit/generated/client-optimized/nodes/4.js',
    '.svelte-kit/generated/client-optimized/nodes/7.js',
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
  expect(shouldPrecache('old-v2.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('assets/images/home-reader-demo.jpg', excludedFiles)).toBe(false)
  expect(
    shouldPrecache('assets/images/prototypes/reader.png', excludedFiles)
  ).toBe(false)
})

test('passage playback tools load on demand without excluding shared reader code', () => {
  const { excludedFiles } = classifyManifestFiles({
    'app/index.ts': { file: 'reader.js', isEntry: true },
    'app/reading/passage-audio-tools.ts': { file: 'passage-tools.js', isDynamicEntry: true, imports: ['app/index.ts'] },
  })
  expect(shouldPrecache('passage-tools.js', excludedFiles)).toBe(false)
  expect(shouldPrecache('reader.js', excludedFiles)).toBe(true)
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

test('renders base-aware shell plus explicit Torah and recording downloads', () => {
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
    `const TORAH_CACHE_NAME = 'tikkun-torah-${cacheNamespace}'`
  )
  expect(source).toContain(
    `const RECORDING_CACHE_NAME = 'tikkun-recordings-${cacheNamespace}'`
  )
  expect(source).toContain("event.data?.type === 'DOWNLOAD_TORAH_PAGES'")
  expect(source).toContain("event.data?.type === 'DOWNLOAD_RECORDING'")
  expect(source).toContain(
    "event.data?.type === 'GET_RECORDING_DOWNLOAD_INVENTORY'"
  )
  expect(source).toContain("event.data?.type === 'REMOVE_RECORDING_DOWNLOAD'")
  expect(source).toContain(
    "event.data?.type === 'REMOVE_OTHER_RECORDING_DOWNLOADS'"
  )
  expect(source).toContain(
    "event.data?.type === 'REMOVE_ALL_RECORDING_DOWNLOADS'"
  )
  expect(source).toContain('TORAH_DOWNLOAD_CONCURRENCY = 4')
  expect(source).toContain("const MEDIA_PATH_PREFIX = BASE_PATH + '/audio/'")
  expect(source).toContain('TORAH_PAGE_PATHS.has(url.pathname)')
})

test('streams explicit recording downloads and serves exact cached byte ranges', async () => {
  const bytes = Uint8Array.from({ length: 12 }, (_value, index) => index)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const lastModified = 'Wed, 19 Aug 2026 12:00:00 GMT'
  const recording = {
    audioId: 'beresheet-1',
    title: 'Beresheet Aliyah 1',
    url: `/preview/app/audio/reader/beresheet/1.m4a?tikkun-media=${digest}`,
    digest,
    byteLength: bytes.byteLength,
  }
  const stored = new Map<string, Response>()
  const cacheKey = (request: RequestInfo | URL) =>
    typeof request === 'string'
      ? new URL(request, 'https://tikkun.test').href
      : request instanceof URL
        ? request.href
        : request.url
  const cache = {
    async match(request: RequestInfo | URL) {
      return stored.get(cacheKey(request))?.clone()
    },
    async put(request: RequestInfo | URL, response: Response) {
      const body = await response.arrayBuffer()
      stored.set(
        cacheKey(request),
        new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      )
    },
    async delete(request: RequestInfo | URL) {
      return stored.delete(cacheKey(request))
    },
    async keys() {
      return [...stored.keys()].map((url) => new Request(url))
    },
  }
  const fetch = vi.fn(async () =>
    new Response(bytes, {
      status: 200,
      headers: {
        'Content-Length': String(bytes.byteLength),
        'Content-Type': 'audio/mp4',
        'Last-Modified': lastModified,
      },
    })
  )
  const context = {
    URL,
    Headers,
    Request,
    Response,
    ReadableStream,
    fetch,
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
      basePath: '/preview/app',
      buildHash: 'current',
      shellUrls: [],
      torahPageUrls: [],
    })}
globalThis.recordingWorkerForTest = {
  parseRecordingDescriptor,
  readRecordingDownloadStatus,
  downloadRecording,
  removeRecording,
  removeOtherRecordings,
  serveRecordingRequest,
  createSha256,
}`,
    context
  )
  const worker = (
    context as typeof context & {
      recordingWorkerForTest: {
        parseRecordingDescriptor(value: unknown): typeof recording & {
          url: string
        }
        readRecordingDownloadStatus(
          descriptor: typeof recording
        ): Promise<Record<string, unknown>>
        downloadRecording(
          descriptor: typeof recording,
          onProgress: (downloadedBytes: number) => void
        ): Promise<void>
        removeRecording(
          descriptor: typeof recording
        ): Promise<Record<string, unknown>>
        removeOtherRecordings(
          descriptor: typeof recording
        ): Promise<Record<string, unknown>>
        serveRecordingRequest(request: Request): Promise<Response>
        createSha256(): {
          update(chunk: Uint8Array): void
          digestHex(): string
        }
      }
    }
  ).recordingWorkerForTest
  const descriptor = worker.parseRecordingDescriptor(recording)
  const progress: number[] = []
  const hashInput = Uint8Array.from(
    { length: 1025 },
    (_value, index) => (index * 31) % 256
  )
  const hasher = worker.createSha256()
  for (const [start, end] of [
    [0, 1],
    [1, 64],
    [64, 129],
    [129, 777],
    [777, hashInput.byteLength],
  ]) {
    hasher.update(hashInput.subarray(start, end))
  }
  expect(hasher.digestHex()).toBe(
    createHash('sha256').update(hashInput).digest('hex')
  )

  await expect(worker.readRecordingDownloadStatus(descriptor)).resolves.toMatchObject({
    state: 'idle',
    complete: false,
  })
  await worker.downloadRecording(descriptor, (downloadedBytes) => {
    progress.push(downloadedBytes)
  })
  expect(progress.at(-1)).toBe(bytes.byteLength)
  await expect(worker.readRecordingDownloadStatus(descriptor)).resolves.toMatchObject({
    state: 'complete',
    downloadedBytes: bytes.byteLength,
    exactStored: true,
    complete: true,
  })

  const removedBytes = Uint8Array.from([21, 22, 23])
  const removedDigest = createHash('sha256').update(removedBytes).digest('hex')
  const removedUrl = `https://tikkun.test/preview/app/audio/removed/1.m4a?tikkun-media=${removedDigest}`
  stored.set(
    removedUrl,
    new Response(removedBytes, {
      headers: {
        'Content-Length': String(removedBytes.byteLength),
        'X-Tikkun-Audio-Id': 'removed-from-catalog',
        'X-Tikkun-Media-Digest': removedDigest,
      },
    })
  )
  await expect(worker.readRecordingDownloadStatus(descriptor)).resolves.toMatchObject({
    state: 'complete',
    otherCount: 1,
    otherBytes: removedBytes.byteLength,
  })
  await expect(worker.removeOtherRecordings(descriptor)).resolves.toMatchObject({
    state: 'complete',
    otherCount: 0,
    otherBytes: 0,
  })
  expect(stored.has(removedUrl)).toBe(false)
  expect(stored.has(descriptor.url)).toBe(true)

  const rangeResponse = await worker.serveRecordingRequest(
    new Request(descriptor.url, { headers: { Range: 'bytes=3-7' } })
  )
  expect(rangeResponse.status).toBe(206)
  expect(rangeResponse.headers.get('Content-Range')).toBe('bytes 3-7/12')
  expect([...new Uint8Array(await rangeResponse.arrayBuffer())]).toEqual([
    3, 4, 5, 6, 7,
  ])

  const suffixResponse = await worker.serveRecordingRequest(
    new Request(descriptor.url, { headers: { Range: 'bytes=-3' } })
  )
  expect([...new Uint8Array(await suffixResponse.arrayBuffer())]).toEqual([
    9, 10, 11,
  ])

  const entityTag = `"sha256-${digest}"`
  const matchingEntityTag = await worker.serveRecordingRequest(
    new Request(descriptor.url, {
      headers: { Range: 'bytes=1-2', 'If-Range': entityTag },
    })
  )
  expect(matchingEntityTag.status).toBe(206)
  const mismatchedEntityTag = await worker.serveRecordingRequest(
    new Request(descriptor.url, {
      headers: { Range: 'bytes=1-2', 'If-Range': '"other"' },
    })
  )
  expect(mismatchedEntityTag.status).toBe(200)
  expect((await mismatchedEntityTag.arrayBuffer()).byteLength).toBe(bytes.byteLength)

  for (const [ifRange, expectedStatus] of [
    [lastModified, 206],
    ['Thu, 20 Aug 2026 12:00:00 GMT', 206],
    ['Tue, 18 Aug 2026 12:00:00 GMT', 200],
    ['not-a-date', 200],
  ] as const) {
    const response = await worker.serveRecordingRequest(
      new Request(descriptor.url, {
        headers: { Range: 'bytes=1-2', 'If-Range': ifRange },
      })
    )
    expect(response.status, ifRange).toBe(expectedStatus)
  }

  const headResponse = await worker.serveRecordingRequest(
    new Request(descriptor.url, {
      method: 'HEAD',
      headers: { Range: 'bytes=3-7', 'If-Range': entityTag },
    })
  )
  expect(headResponse.status).toBe(200)
  expect(headResponse.headers.get('Content-Length')).toBe(String(bytes.byteLength))
  expect((await headResponse.arrayBuffer()).byteLength).toBe(0)

  const invalidRange = await worker.serveRecordingRequest(
    new Request(descriptor.url, { headers: { Range: 'bytes=99-100' } })
  )
  expect(invalidRange.status).toBe(416)
  expect(invalidRange.headers.get('Content-Range')).toBe('bytes */12')

  await expect(worker.removeRecording(descriptor)).resolves.toMatchObject({
    state: 'idle',
    exactStored: false,
    complete: false,
  })
  expect(stored.has(descriptor.url)).toBe(false)
  expect(stored.size).toBe(0)
})

test('settles every destructive recording-cache task before releasing a failed removal', async () => {
  const digest = 'a'.repeat(64)
  const descriptor = {
    audioId: 'current',
    title: 'Current recording',
    url: `https://tikkun.test/audio/current.m4a?tikkun-media=${digest}`,
    digest,
    byteLength: 1,
  }
  let requests: Request[] = []
  let stored = new Map<string, Response>()
  let deleteIndex = 0
  let failureStarted = () => {}
  let releaseDelayedDelete = () => {}
  const cache = {
    async match(request: string | Request) {
      const url = typeof request === 'string' ? request : request.url
      return stored.get(url)?.clone()
    },
    put: vi.fn(),
    async delete(request: string | Request) {
      const url = typeof request === 'string' ? request : request.url
      const index = deleteIndex
      deleteIndex += 1
      if (index === 0) {
        failureStarted()
        throw new Error('First deletion failed.')
      }
      await new Promise<void>((resolve) => {
        releaseDelayedDelete = resolve
      })
      return stored.delete(url)
    },
    async keys() {
      return requests
    },
  }
  const context = {
    URL,
    Headers,
    Request,
    Response,
    ReadableStream,
    fetch: vi.fn(),
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
      buildHash: 'current',
      shellUrls: [],
      torahPageUrls: [],
    })}\nglobalThis.recordingWorkerForTest = {\n  removeRecording,\n  removeOtherRecordings,\n  removeAllRecordings,\n}`,
    context
  )
  const worker = (
    context as typeof context & {
      recordingWorkerForTest: {
        removeRecording(value: typeof descriptor): Promise<unknown>
        removeOtherRecordings(value: typeof descriptor): Promise<unknown>
        removeAllRecordings(): Promise<unknown>
      }
    }
  ).recordingWorkerForTest
  const responseFor = (audioId: string, responseDigest: string) =>
    new Response(Uint8Array.from([1]), {
      headers: {
        'Content-Length': '1',
        'X-Tikkun-Audio-Id': audioId,
        'X-Tikkun-Media-Digest': responseDigest,
      },
    })

  for (const [name, prepare, remove] of [
    [
      'current',
      () => {
        stored = new Map([
          [descriptor.url, responseFor(descriptor.audioId, descriptor.digest)],
        ])
        requests = [new Request(descriptor.url), new Request(descriptor.url)]
      },
      () => worker.removeRecording(descriptor),
    ],
    [
      'other',
      () => {
        const first = `https://tikkun.test/audio/other-1.m4a?tikkun-media=${'b'.repeat(64)}`
        const second = `https://tikkun.test/audio/other-2.m4a?tikkun-media=${'c'.repeat(64)}`
        stored = new Map([
          [first, responseFor('other-1', 'b'.repeat(64))],
          [second, responseFor('other-2', 'c'.repeat(64))],
        ])
        requests = [new Request(first), new Request(second)]
      },
      () => worker.removeOtherRecordings(descriptor),
    ],
    [
      'all',
      () => {
        const first = `https://tikkun.test/audio/all-1.m4a?tikkun-media=${'d'.repeat(64)}`
        const second = `https://tikkun.test/audio/all-2.m4a?tikkun-media=${'e'.repeat(64)}`
        stored = new Map([
          [first, responseFor('all-1', 'd'.repeat(64))],
          [second, responseFor('all-2', 'e'.repeat(64))],
        ])
        requests = [new Request(first), new Request(second)]
      },
      () => worker.removeAllRecordings(),
    ],
  ] as const) {
    prepare()
    deleteIndex = 0
    let signalFailure = () => {}
    const failure = new Promise<void>((resolve) => {
      signalFailure = resolve
    })
    failureStarted = signalFailure
    releaseDelayedDelete = () => {}
    let settled = false
    const operation = remove().finally(() => {
      settled = true
    })

    await failure
    await vi.waitFor(() => expect(deleteIndex, name).toBe(2))
    expect(settled, name).toBe(false)
    releaseDelayedDelete()
    await expect(operation, name).rejects.toThrow('First deletion failed.')
    expect(settled, name).toBe(true)
  }
})

test('rejects truncated or same-size wrong recording content without caching it', async () => {
  const expectedBytes = Uint8Array.from([1, 2, 3, 4])
  const digest = createHash('sha256').update(expectedBytes).digest('hex')
  const stored = new Map<string, Response>()
  let fetchedBytes = Uint8Array.from([1, 2, 3])
  let includeLength = false
  const staleDigest = 'b'.repeat(64)
  const staleUrl = `https://tikkun.test/audio/truncated.m4a?tikkun-media=${staleDigest}`
  stored.set(
    staleUrl,
    new Response(expectedBytes, {
      headers: {
        'Content-Length': String(expectedBytes.byteLength),
        'X-Tikkun-Audio-Id': 'truncated',
        'X-Tikkun-Media-Digest': staleDigest,
      },
    })
  )
  const cache = {
    match: vi.fn(async (request: string | Request) => {
      const key = typeof request === 'string' ? request : request.url
      return stored.get(key)?.clone()
    }),
    put: vi.fn(async (request: string, response: Response) => {
      const body = await response.arrayBuffer()
      stored.set(request, new Response(body, { headers: response.headers }))
    }),
    delete: vi.fn(async () => false),
    keys: vi.fn(async () => [...stored.keys()].map((url) => new Request(url))),
  }
  const context = {
    URL,
    Headers,
    Request,
    Response,
    ReadableStream,
    fetch: vi.fn(async () =>
      new Response(fetchedBytes, {
        status: 200,
        headers: includeLength
          ? { 'Content-Length': String(fetchedBytes.byteLength) }
          : {},
      })
    ),
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
      buildHash: 'current',
      shellUrls: [],
      torahPageUrls: [],
    })}
globalThis.recordingWorkerForTest = { parseRecordingDescriptor, downloadRecording }`,
    context
  )
  const worker = (
    context as typeof context & {
      recordingWorkerForTest: {
        parseRecordingDescriptor(value: unknown): Record<string, unknown>
        downloadRecording(
          descriptor: Record<string, unknown>,
          onProgress: (downloadedBytes: number) => void
        ): Promise<void>
      }
    }
  ).recordingWorkerForTest

  expect(() =>
    worker.parseRecordingDescriptor({
      audioId: 'outside',
      title: 'Outside',
      url: `https://media.example/file.m4a?tikkun-media=${digest}`,
      digest,
      byteLength: 4,
    })
  ).toThrow('URL is invalid')
  const descriptor = worker.parseRecordingDescriptor({
    audioId: 'truncated',
    title: 'Truncated',
    url: `/audio/truncated.m4a?tikkun-media=${digest}`,
    digest,
    byteLength: 4,
  })
  await expect(
    worker.downloadRecording(descriptor, vi.fn())
  ).rejects.toThrow('size does not match')
  expect(cache.put).toHaveBeenCalledTimes(1)
  expect(stored.size).toBe(1)
  expect(stored.has(staleUrl)).toBe(true)

  fetchedBytes = Uint8Array.from([4, 3, 2, 1])
  includeLength = true
  await expect(
    worker.downloadRecording(descriptor, vi.fn())
  ).rejects.toThrow('content does not match')
  expect(cache.put).toHaveBeenCalledTimes(2)
  expect(stored.size).toBe(1)
  expect(stored.has(staleUrl)).toBe(true)
})

test('rejects and removes corrupt completed recording cache entries before status or serving', async () => {
  const expectedBytes = Uint8Array.from([1, 3, 5, 7])
  const digest = createHash('sha256').update(expectedBytes).digest('hex')
  const recording = {
    audioId: 'cache-integrity',
    title: 'Cache integrity',
    url: `/audio/cache-integrity.m4a?tikkun-media=${digest}`,
    digest,
    byteLength: expectedBytes.byteLength,
  }
  type StoredRecording = { bytes: Uint8Array; headers: Headers }
  const stored = new Map<string, StoredRecording>()
  const requestUrl = `https://tikkun.test${recording.url}`
  const matchingHeaders = () =>
    new Headers({
      'Content-Length': String(recording.byteLength),
      'X-Tikkun-Audio-Id': recording.audioId,
      'X-Tikkun-Media-Digest': recording.digest,
    })
  const cacheKey = (request: string | Request) =>
    typeof request === 'string' ? request : request.url
  const cache = {
    match: vi.fn(async (request: string | Request) => {
      const entry = stored.get(cacheKey(request))
      return entry
        ? new Response(Uint8Array.from(entry.bytes).buffer, {
            status: 200,
            headers: entry.headers,
          })
        : undefined
    }),
    put: vi.fn(),
    delete: vi.fn(async (request: string | Request) =>
      stored.delete(cacheKey(request))
    ),
    keys: vi.fn(async () =>
      [...stored.keys()].map((url) => new Request(url))
    ),
  }
  const fetch = vi.fn(async () =>
    new Response(expectedBytes, {
      status: 200,
      headers: { 'Content-Length': String(expectedBytes.byteLength) },
    })
  )
  const context = {
    URL,
    Headers,
    Request,
    Response,
    ReadableStream,
    fetch,
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
      buildHash: 'current',
      shellUrls: [],
      torahPageUrls: [],
    })}\nglobalThis.recordingWorkerForTest = {\n  parseRecordingDescriptor,\n  readRecordingDownloadStatus,\n  serveRecordingRequest,\n  validationFor: (url) => verifiedRecordingCacheEntries.get(url),\n}`,
    context
  )
  const worker = (
    context as typeof context & {
      recordingWorkerForTest: {
        parseRecordingDescriptor(value: unknown): typeof recording & {
          url: string
        }
        readRecordingDownloadStatus(
          descriptor: typeof recording
        ): Promise<Record<string, unknown>>
        serveRecordingRequest(request: Request): Promise<Response>
        validationFor(url: string): unknown
      }
    }
  ).recordingWorkerForTest
  const descriptor = worker.parseRecordingDescriptor(recording)

  stored.set(requestUrl, {
    bytes: Uint8Array.from([1, 3, 5]),
    headers: matchingHeaders(),
  })
  await expect(worker.readRecordingDownloadStatus(descriptor)).resolves.toMatchObject({
    state: 'idle',
    complete: false,
  })
  expect(stored.has(requestUrl)).toBe(false)

  stored.set(requestUrl, {
    bytes: Uint8Array.from([7, 5, 3, 1]),
    headers: matchingHeaders(),
  })
  const networkFallback = await worker.serveRecordingRequest(
    new Request(requestUrl)
  )
  expect([...new Uint8Array(await networkFallback.arrayBuffer())]).toEqual([
    ...expectedBytes,
  ])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(stored.has(requestUrl)).toBe(false)
  expect(cache.delete).toHaveBeenCalledTimes(2)

  stored.set(requestUrl, {
    bytes: expectedBytes,
    headers: matchingHeaders(),
  })
  await worker.serveRecordingRequest(new Request(requestUrl, { method: 'HEAD' }))
  const validation = worker.validationFor(requestUrl)
  expect(validation).toBeTruthy()
  await worker.serveRecordingRequest(new Request(requestUrl, { method: 'HEAD' }))
  expect(worker.validationFor(requestUrl)).toBe(validation)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('serializes recording operations by audio identity and gives every client a terminal status', async () => {
  const bytes = Uint8Array.from([4, 8, 15, 16])
  const digest = createHash('sha256').update(bytes).digest('hex')
  const recording = {
    audioId: 'shared-audio',
    title: 'Shared recording',
    url: `/audio/shared.m4a?tikkun-media=${digest}`,
    digest,
    byteLength: bytes.byteLength,
  }
  const newerDigest = 'c'.repeat(64)
  const newerRecording = {
    ...recording,
    url: `/audio/shared.m4a?tikkun-media=${newerDigest}`,
    digest: newerDigest,
  }
  const stored = new Map<string, Response>()
  const cacheKey = (request: string | Request) =>
    typeof request === 'string' ? request : request.url
  const cache = {
    async match(request: string | Request) {
      return stored.get(cacheKey(request))?.clone()
    },
    async put(request: string | Request, response: Response) {
      const body = await response.arrayBuffer()
      stored.set(
        cacheKey(request),
        new Response(body, { headers: response.headers })
      )
    },
    async delete(request: string | Request) {
      return stored.delete(cacheKey(request))
    },
    async keys() {
      return [...stored.keys()].map((url) => new Request(url))
    },
  }
  let releaseBody = () => {}
  const bodyGate = new Promise<void>((resolve) => {
    releaseBody = resolve
  })
  const fetch = vi.fn(async () =>
    new Response(
      new ReadableStream({
        async pull(controller) {
          await bodyGate
          controller.enqueue(bytes)
          controller.close()
        },
      }),
      { headers: { 'Content-Length': String(bytes.byteLength) } }
    )
  )
  const context = {
    URL,
    Headers,
    Request,
    Response,
    ReadableStream,
    fetch,
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
      buildHash: 'current',
      shellUrls: [],
      torahPageUrls: [],
    })}\nglobalThis.recordingWorkerForTest = {\n  handleRecordingDownload,\n  handleRecordingRemoval,\n  reportRecordingDownloadStatus,\n}`,
    context
  )
  type Status = { state: string; errorMessage?: string }
  type WorkerEvent = {
    data: { type: string; recording: typeof recording }
    ports: never[]
    source: { postMessage(message: Status): void }
  }
  const worker = (
    context as typeof context & {
      recordingWorkerForTest: {
        handleRecordingDownload(event: WorkerEvent): Promise<void>
        handleRecordingRemoval(event: WorkerEvent): Promise<void>
        reportRecordingDownloadStatus(event: WorkerEvent): Promise<void>
      }
    }
  ).recordingWorkerForTest
  const eventFor = (type: string, descriptor = recording) => {
    const messages: Status[] = []
    return {
      event: {
        data: { type, recording: descriptor },
        ports: [],
        source: { postMessage: (message: Status) => messages.push(message) },
      },
      messages,
    }
  }

  const first = eventFor('DOWNLOAD_RECORDING')
  const firstDownload = worker.handleRecordingDownload(first.event)
  await vi.waitFor(() => {
    expect(first.messages.at(-1)?.state).toBe('downloading')
  })
  const second = eventFor('DOWNLOAD_RECORDING')
  const secondDownload = worker.handleRecordingDownload(second.event)
  await vi.waitFor(() => {
    expect(second.messages.at(-1)?.state).toBe('downloading')
  })

  const statusFromAnotherTab = eventFor('GET_RECORDING_DOWNLOAD_STATUS')
  await worker.reportRecordingDownloadStatus(statusFromAnotherTab.event)
  expect(statusFromAnotherTab.messages).toEqual([
    expect.objectContaining({
      state: 'downloading',
      downloadedBytes: 0,
    }),
  ])

  const differentVersion = eventFor('DOWNLOAD_RECORDING', newerRecording)
  const conflictingRemoval = eventFor('REMOVE_RECORDING_DOWNLOAD')
  await Promise.all([
    worker.handleRecordingDownload(differentVersion.event),
    worker.handleRecordingRemoval(conflictingRemoval.event),
  ])
  expect(differentVersion.messages.at(-1)).toMatchObject({ state: 'error' })
  expect(conflictingRemoval.messages.at(-1)).toMatchObject({ state: 'error' })

  releaseBody()
  await Promise.all([firstDownload, secondDownload])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(first.messages.at(-1)).toMatchObject({ state: 'complete' })
  expect(second.messages.at(-1)).toMatchObject({ state: 'complete' })

  const removal = eventFor('REMOVE_RECORDING_DOWNLOAD')
  await worker.handleRecordingRemoval(removal.event)
  expect(removal.messages.at(-1)).toMatchObject({ state: 'idle' })
  expect(stored.size).toBe(0)
})

test('reports descriptor-free recording inventory and shares one live clear-all operation across tabs', async () => {
  const stored = new Map<string, Response>()
  const addRecording = (audioId: string, bytes: Uint8Array) => {
    const digest = createHash('sha256').update(bytes).digest('hex')
    const url = `https://tikkun.test/audio/${audioId}.m4a?tikkun-media=${digest}`
    stored.set(
      url,
      new Response(Uint8Array.from(bytes).buffer, {
        status: 200,
        headers: {
          'Content-Length': String(bytes.byteLength),
          'X-Tikkun-Audio-Id': audioId,
          'X-Tikkun-Media-Digest': digest,
        },
      })
    )
  }
  addRecording('first', Uint8Array.from([1, 2, 3]))
  addRecording('second', Uint8Array.from([4, 5, 6, 7]))
  const malformedUrl = `https://tikkun.test/audio/malformed.m4a?tikkun-media=${'a'.repeat(64)}`
  stored.set(
    malformedUrl,
    new Response(Uint8Array.from([9]), {
      headers: { 'Content-Length': '1' },
    })
  )

  const cacheKey = (request: string | Request) =>
    typeof request === 'string' ? request : request.url
  let blockDeletes = false
  let releaseDeletes = () => {}
  const deleteGate = new Promise<void>((resolve) => {
    releaseDeletes = resolve
  })
  const cache = {
    async match(request: string | Request) {
      return stored.get(cacheKey(request))?.clone()
    },
    put: vi.fn(),
    delete: vi.fn(async (request: string | Request) => {
      if (blockDeletes) await deleteGate
      return stored.delete(cacheKey(request))
    }),
    async keys() {
      return [...stored.keys()].map((url) => new Request(url))
    },
  }
  const context = {
    URL,
    Headers,
    Request,
    Response,
    ReadableStream,
    fetch: vi.fn(),
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
      buildHash: 'current',
      shellUrls: [],
      torahPageUrls: [],
    })}\nglobalThis.recordingWorkerForTest = {\n  reportRecordingDownloadInventory,\n  handleAllRecordingRemoval,\n  recordingInventoryErrorStatus,\n}`,
    context
  )
  type InventoryStatus = {
    type: string
    state: string
    count: number
    totalBytes: number
    complete: boolean
    errorMessage?: string
  }
  type InventoryEvent = {
    data: { type: string }
    ports: never[]
    source: { postMessage(message: InventoryStatus): void }
  }
  const worker = (
    context as typeof context & {
      recordingWorkerForTest: {
        reportRecordingDownloadInventory(event: InventoryEvent): Promise<void>
        handleAllRecordingRemoval(event: InventoryEvent): Promise<void>
        recordingInventoryErrorStatus(error: Error): Promise<InventoryStatus>
      }
    }
  ).recordingWorkerForTest
  const eventFor = (type: string) => {
    const messages: InventoryStatus[] = []
    return {
      event: {
        data: { type },
        ports: [],
        source: {
          postMessage: (message: InventoryStatus) => messages.push(message),
        },
      },
      messages,
    }
  }

  const initial = eventFor('GET_RECORDING_DOWNLOAD_INVENTORY')
  await worker.reportRecordingDownloadInventory(initial.event)
  expect(initial.messages).toEqual([
    {
      type: 'RECORDING_DOWNLOAD_INVENTORY_STATUS',
      state: 'idle',
      count: 2,
      totalBytes: 7,
      complete: false,
    },
  ])
  expect(stored.has(malformedUrl)).toBe(false)
  await expect(
    worker.recordingInventoryErrorStatus(new Error('Inventory failed.'))
  ).resolves.toEqual({
    type: 'RECORDING_DOWNLOAD_INVENTORY_STATUS',
    state: 'error',
    count: 2,
    totalBytes: 7,
    complete: false,
    errorMessage: 'The recording inventory operation failed.',
  })

  blockDeletes = true
  const firstRemoval = eventFor('REMOVE_ALL_RECORDING_DOWNLOADS')
  const firstPromise = worker.handleAllRecordingRemoval(firstRemoval.event)
  await vi.waitFor(() => {
    expect(firstRemoval.messages.at(-1)).toMatchObject({
      state: 'removing',
      count: 2,
      totalBytes: 7,
    })
  })

  const statusFromAnotherTab = eventFor('GET_RECORDING_DOWNLOAD_INVENTORY')
  await worker.reportRecordingDownloadInventory(statusFromAnotherTab.event)
  expect(statusFromAnotherTab.messages.at(-1)).toMatchObject({
    state: 'removing',
    count: 2,
    totalBytes: 7,
  })

  const secondRemoval = eventFor('REMOVE_ALL_RECORDING_DOWNLOADS')
  const secondPromise = worker.handleAllRecordingRemoval(secondRemoval.event)
  await vi.waitFor(() => {
    expect(secondRemoval.messages.at(-1)?.state).toBe('removing')
  })
  releaseDeletes()
  await Promise.all([firstPromise, secondPromise])
  expect(firstRemoval.messages.at(-1)).toEqual({
    type: 'RECORDING_DOWNLOAD_INVENTORY_STATUS',
    state: 'idle',
    count: 0,
    totalBytes: 0,
    complete: true,
  })
  expect(secondRemoval.messages.at(-1)).toEqual(
    firstRemoval.messages.at(-1)
  )
  expect(cache.delete).toHaveBeenCalledTimes(3)
  expect(stored.size).toBe(0)
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
