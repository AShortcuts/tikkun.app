import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import { cacheNamespaceForBasePath, classifyManifestFiles, compileServiceWorkerSource, renderServiceWorkerSource, shouldPrecache, torahPageFilesFromManifest } from './generate-service-worker.mjs'

// These VM fixtures exercise one worker's protocol/cache behavior. Cross-owner
// contention is covered with actual browser locks in recording-mutation-locks.vitest.ts.
const uncontendedWorkerLocks = {
  async request<T>(_name: string, options: { signal?: AbortSignal }, task: (lock: object) => T) {
    options.signal?.throwIfAborted()
    return task({})
  },
}

test('compiled worker preserves installation and versioned download messages', async () => {
  type WorkerEvent = {
    waitUntil: (work: Promise<unknown>) => void
    data?: { type: string; version: string }
    ports?: { postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[]
  }
  const handlers = new Map<string, (event: WorkerEvent) => void>()
  const addAll = vi.fn(async () => undefined)
  const postMessage = vi.fn()
  const close = vi.fn()
  const options = {
    basePath: '/preview', buildHash: 'compiled-test',
    shellUrls: ['/preview/', '/preview/reader/'], torahPageUrls: [],
    dependencyManifest: {
      version: 'current', asset: { url: '', byteLength: 0, digest: '' },
    },
  }
  const source = await compileServiceWorkerSource(options)
  expect(source.length).toBeLessThan(renderServiceWorkerSource(options).length)
  vm.runInNewContext(source, {
    URL, AbortController,
    caches: { open: vi.fn(async () => ({ addAll })) },
    self: {
      location: { origin: 'https://tikkun.test' },
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) => handlers.set(type, handler),
    },
  })
  expect([...handlers.keys()]).toEqual(['install', 'activate', 'message', 'fetch'])
  const pending: Promise<unknown>[] = []
  const waitUntil = (work: Promise<unknown>) => { pending.push(work) }
  handlers.get('install')!({ waitUntil })
  handlers.get('message')!({
    waitUntil, data: { type: 'PREFLIGHT_RECORDING_DOWNLOADS', version: 'stale' },
    ports: [{ postMessage, close }],
  })
  await Promise.all(pending)
  expect(addAll).toHaveBeenCalledWith(options.shellUrls)
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'RECORDING_PREFLIGHT', version: 'current', state: 'error',
    errorMessage: expect.stringContaining('another app build'),
  }))
  expect(close).toHaveBeenCalledOnce()
})

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
    URL, AbortController,
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
      navigator: { locks: uncontendedWorkerLocks },
      registration: { scope: 'https://tikkun.test/' },
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
  expect(shouldPrecache('updates/web/6/latest.json', excludedFiles)).toBe(false)
  expect(shouldPrecache(`updates/content/${'a'.repeat(64)}/${'b'.repeat(64)}.json`, excludedFiles)).toBe(false)
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
  expect(shouldPrecache('about/index.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('privacy/index.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('support/index.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('privacy.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('support.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('settings/index.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('tidbits/index.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('tidbits/example/index.html', excludedFiles)).toBe(false)
  expect(shouldPrecache('assets/images/home-ambient.jpg', excludedFiles)).toBe(false)
  expect(shouldPrecache('assets/images/github.svg', excludedFiles)).toBe(false)
  expect(shouldPrecache('assets/images/disc-filled-rounded-square.svg', excludedFiles)).toBe(false)
  expect(shouldPrecache('assets/images/disc-filled-inner-circle.svg', excludedFiles)).toBe(false)
  expect(shouldPrecache('readings/index.html', excludedFiles)).toBe(true)
  expect(shouldPrecache('reader/index.html', excludedFiles)).toBe(true)
  expect(shouldPrecache('assets/images/home-reader-demo.jpg', excludedFiles)).toBe(false)
  expect(
    shouldPrecache('assets/images/prototypes/reader.png', excludedFiles)
  ).toBe(false)
})

test('selects only Torah entries from the SvelteKit client manifest', () => {
  expect(torahPageFilesFromManifest(manifest)).toEqual([
    '_app/immutable/chunks/torah-1.js',
    '_app/immutable/chunks/torah-2.js',
  ])
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
    URL, AbortController,
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
      navigator: { locks: uncontendedWorkerLocks },
      registration: { scope: 'https://tikkun.test/' },
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
    URL, AbortController,
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
      navigator: { locks: uncontendedWorkerLocks },
      registration: { scope: 'https://tikkun.test/' },
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
    URL, AbortController,
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
      navigator: { locks: uncontendedWorkerLocks },
      registration: { scope: 'https://tikkun.test/' },
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

test('namespaces cache cleanup to one deployment base path', async () => {
  const currentNamespace = cacheNamespaceForBasePath('/preview/current')
  const otherNamespace = cacheNamespaceForBasePath('/preview/other')
  const currentCache = `tikkun-shell-${currentNamespace}-current`
  const obsoleteCache = `tikkun-shell-${currentNamespace}-obsolete`
  const otherCache = `tikkun-shell-${otherNamespace}-current`
  const deleted: string[] = []
  const context = {
    URL, AbortController,
    fetch: vi.fn(),
    caches: {
      keys: vi.fn(async () => [currentCache, obsoleteCache, otherCache]),
      delete: vi.fn(async (key: string) => {
        deleted.push(key)
        return true
      }),
    },
    self: {
      navigator: { locks: uncontendedWorkerLocks },
      registration: { scope: 'https://tikkun.test/' },
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
