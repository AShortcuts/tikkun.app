import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import { renderServiceWorkerSource, cacheNamespaceForBasePath } from './generate-service-worker.mjs'

const origin = 'https://tikkun.test'
const bytes = Uint8Array.from([1, 2, 3, 4])
const descriptor = (name: string) => ({ url: `/preview/_app/immutable/${name}.js`, byteLength: bytes.length, digest: createHash('sha256').update(bytes).digest('hex') })
const core = descriptor('text')
const cue = descriptor('cue')
const manifestBytes = new TextEncoder().encode(JSON.stringify({ version: 'current', core: [core], cues: { 'audio-cues/one.json': [cue, core] } }))
const metadata = { version: 'current', asset: { url: '/preview/_app/immutable/assets/dependencies.json', byteLength: manifestBytes.length, digest: createHash('sha256').update(manifestBytes).digest('hex') } }
const recording = { audioId: 'one', title: 'One', url: `${origin}/preview/audio/one.m4a?tikkun-media=${core.digest}`, byteLength: bytes.length, digest: core.digest }
type Port = { postMessage(value: unknown): void; close(): void; onmessage?: ((event: { data: { type: string } }) => void) | null }
type Event = { data: { type: string; version: string; cues: string[]; recordings?: typeof recording[] }; ports: Port[]; waitUntil?(request: Promise<void>): void }
function fixture(manifestCached = true, stores = new Map<string, Map<string, Response>>()) {
  if (manifestCached) stores.set(`tikkun-dependencies-${cacheNamespaceForBasePath('/preview')}`, new Map([[new URL(metadata.asset.url, origin).href, new Response(manifestBytes)]]))
  const absolute = (url: string | Request) => new URL(typeof url === 'string' ? url : url.url, origin).href
  const cache = (name: string) => {
    let store = stores.get(name)
    if (!store) { store = new Map(); stores.set(name, store) }
    const files = store
    return {
      match: async (url: string | Request) => files.get(absolute(url))?.clone(),
      put: async (url: string | Request, response: Response) => { files.set(absolute(url), response.clone()) },
      delete: async (url: string | Request) => files.delete(absolute(url)),
    }
  }
  const fetch = vi.fn<(url: string, options: { signal: AbortSignal }) => Promise<Response>>(async (url) => new Response(url.endsWith('/dependencies.json') ? manifestBytes : bytes))
  const estimate = vi.fn(async (): Promise<StorageEstimate> => ({ quota: 100_000_000, usage: 0 }))
  const warn = vi.fn()
  let receive: ((event: Event) => void) | undefined
  const context = {
    URL, Headers, Response, Request, ReadableStream, Uint8Array, AbortController, Symbol,
    fetch, caches: { open: async (name: string) => cache(name) },
    console: { warn },
    self: { location: { origin }, navigator: { storage: { estimate } }, addEventListener(name: string, handler: (event: Event) => void) {
      if (name === 'message') receive = handler
    } },
  }
  const api: { handle(event: Event): Promise<void>; users(): number[]; cacheName(url: string): string; audioCache: string;
    activeAudio(asset: typeof recording): void; activeSupport(asset: typeof core): void;
    serve(request: Request, cacheName: string): Promise<Response> } = vm.runInNewContext(`${renderServiceWorkerSource({
    basePath: '/preview', buildHash: 'test', shellUrls: [], torahPageUrls: [core.url],
    dependencyManifest: metadata,
  })}; ({handle: handleRecordingDependencies, users: () => [...activeDependencyFiles.values()].map((entry) => entry.users.size), cacheName: dependencyCacheName,
    audioCache: RECORDING_CACHE_NAME, activeAudio: (descriptor) => activeRecordingOperations.set(descriptor.audioId, { kind: 'download', descriptor, abortController: new AbortController(), settled: false }),
    activeSupport: (asset) => activeDependencyFiles.set(asset.url, { asset, controller: new AbortController() }), serve: cacheFirst})`, context)
  const request = (prepare: boolean | 'preflight', version = 'current', cues = ['audio-cues/one.json'], recordings = [recording]) => {
    const messages: unknown[] = []
    const port: Port = { postMessage: (message) => messages.push(message), close: vi.fn() }
    let done = Promise.resolve()
    receive!({ data: { type: prepare === 'preflight' ? 'PREFLIGHT_RECORDING_DOWNLOADS' : prepare ? 'PREPARE_RECORDING_DEPENDENCIES' : 'GET_RECORDING_DEPENDENCIES', version, cues, recordings },
      ports: [port], waitUntil: (request) => { done = request } })
    return { done, messages, port, cancel: () => port.onmessage?.({ data: { type: 'CANCEL_RECORDING_DEPENDENCIES' } }) }
  }
  return { stores, cache, fetch, api, request, estimate, warn }
}

function cachedAudio(body = bytes) {
  return new Response(body, { headers: {
    'Content-Length': String(recording.byteLength), 'X-Tikkun-Audio-Id': recording.audioId, 'X-Tikkun-Media-Digest': recording.digest,
  } })
}

test('preflight combines deduplicated audio, shared dependencies, staging and reserve without writing assets', async () => {
  const f = fixture()
  const request = f.request('preflight', 'current', ['audio-cues/one.json', 'audio-cues/one.json'], [recording, { ...recording, audioId: 'alias' }])
  await request.done
  expect(request.messages.at(-1)).toMatchObject({ type: 'RECORDING_PREFLIGHT', state: 'ready', missingBytes: 12, stagingBytes: 8, requiredBytes: 33_554_452, availableBytes: 100_000_000 })
  expect(request.messages.at(-1)).toMatchObject({ reservationAssets: [
    { url: recording.url, byteLength: bytes.length },
    { url: new URL(core.url, origin).href, byteLength: bytes.length },
    { url: new URL(cue.url, origin).href, byteLength: bytes.length },
  ] })
  expect(f.fetch).not.toHaveBeenCalled()
  expect(await f.cache(f.api.audioCache).match(recording.url)).toBeUndefined()
  expect(await f.cache(f.api.cacheName(cue.url)).match(cue.url)).toBeUndefined()
})

test('preflight fetches only an absent verified manifest and includes its uncommitted bytes', async () => {
  const f = fixture(false)
  const request = f.request('preflight'); await request.done
  expect(request.messages.at(-1)).toMatchObject({ state: 'ready', missingBytes: metadata.asset.byteLength + 12, stagingBytes: metadata.asset.byteLength + 4 })
  expect(f.fetch).toHaveBeenCalledExactlyOnceWith(new URL(metadata.asset.url, origin).href, expect.any(Object))
  expect(await f.cache(f.api.cacheName(metadata.asset.url)).match(metadata.asset.url)).toBeUndefined()
})

test('preflight rejects low quota including dependencies before preparing or changing cached content', async () => {
  const f = fixture()
  f.estimate.mockResolvedValue({ quota: 33_554_432 + 19, usage: 0 })
  const request = f.request('preflight'); await request.done
  expect(request.messages.at(-1)).toMatchObject({ state: 'error', errorMessage: expect.stringContaining('Not enough browser storage') })
  expect(f.fetch).not.toHaveBeenCalled()
  expect(await f.cache(f.api.audioCache).match(recording.url)).toBeUndefined()
  expect(await f.cache(f.api.cacheName(core.url)).match(core.url)).toBeUndefined()
})

test('verified caches need no allocation at zero quota; corrupt audio remains untouched for repair', async () => {
  const f = fixture()
  await f.request(true).done
  await f.cache(f.api.audioCache).put(recording.url, cachedAudio())
  f.estimate.mockResolvedValue({ quota: 0, usage: 0 })
  const ready = f.request('preflight'); await ready.done
  expect(ready.messages.at(-1)).toMatchObject({ state: 'ready', requiredBytes: 0 })
  const cold = fixture(false, f.stores)
  await cold.cache(cold.api.audioCache).put(recording.url, cachedAudio(Uint8Array.from([9, 9, 9, 9])))
  cold.estimate.mockResolvedValue({ quota: 0, usage: 0 })
  const bad = cold.request('preflight'); await bad.done
  expect(bad.messages.at(-1)).toMatchObject({ state: 'error' })
  const retained = await cold.cache(cold.api.audioCache).match(recording.url)
  expect([...new Uint8Array(await retained!.arrayBuffer())]).toEqual([9, 9, 9, 9])
})

test('preflight includes active transfers from other clients once', async () => {
  const f = fixture()
  f.api.activeAudio(recording)
  f.api.activeAudio({ ...recording, audioId: 'other', url: recording.url.replace('one.m4a', 'other.m4a') })
  f.api.activeSupport(descriptor('other-cue'))
  const request = f.request('preflight'); await request.done
  expect(request.messages.at(-1)).toMatchObject({ state: 'ready', missingBytes: 20, stagingBytes: 12 })
})

test.each([{}, { quota: -1, usage: 0 }, { quota: Infinity, usage: 0 }])('unknown quota remains unknown: %j', async (estimate) => {
  const f = fixture()
  f.estimate.mockResolvedValue(estimate)
  const request = f.request('preflight'); await request.done
  expect(request.messages.at(-1)).toMatchObject({ state: 'ready', availableBytes: null })
})

test('a rejected quota API is logged without pretending capacity is zero', async () => {
  const f = fixture()
  f.estimate.mockRejectedValueOnce(new Error('Unavailable'))
  const request = f.request('preflight'); await request.done
  expect(request.messages.at(-1)).toMatchObject({ state: 'ready', availableBytes: null })
  expect(f.warn).toHaveBeenCalledOnce()
})

test('preflight rejects stale versions and malformed recordings without fetching', async () => {
  const f = fixture(false)
  const stale = f.request('preflight', 'old'); await stale.done
  expect(stale.messages.at(-1)).toMatchObject({ state: 'error' })
  const invalid = f.request('preflight', 'current', [], [{ ...recording, url: 'https://other.test/audio/one.m4a' }]); await invalid.done
  expect(invalid.messages.at(-1)).toMatchObject({ state: 'error' })
  expect(f.fetch).not.toHaveBeenCalled()
})

test('preflight manifest fetch is cancellable and cannot prepare content afterward', async () => {
  const f = fixture(false)
  f.fetch.mockImplementationOnce(async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) { signal.addEventListener('abort', () => controller.error(new Error('Cancelled')), { once: true }) },
  })))
  const request = f.request('preflight')
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce())
  request.cancel()
  await request.done
  expect(request.messages.at(-1)).toMatchObject({ state: 'error', errorMessage: expect.stringContaining('cancelled') })
  expect(await f.cache(f.api.cacheName(metadata.asset.url)).match(metadata.asset.url)).toBeUndefined()
})

test('missing checks never fetch; preparation deduplicates dependencies and reuses verified caches', async () => {
  const f = fixture()
  const missing = f.request(false); await missing.done
  expect(missing.messages.at(-1)).toMatchObject({ state: 'missing' })
  expect(f.fetch).not.toHaveBeenCalled()
  const prepared = f.request(true); await prepared.done
  expect(prepared.messages.at(-1)).toMatchObject({ state: 'ready', totalBytes: 8 })
  expect(f.fetch).toHaveBeenCalledTimes(2)
  const checked = f.request(false); await checked.done
  expect(checked.messages.at(-1)).toMatchObject({ state: 'ready' })
  expect(f.fetch).toHaveBeenCalledTimes(2)
  expect(f.api.cacheName(core.url)).toBe(`tikkun-torah-${cacheNamespaceForBasePath('/preview')}`)
  expect(f.api.cacheName(cue.url)).toBe(`tikkun-dependencies-${cacheNamespaceForBasePath('/preview')}`)
})

test('the manifest is downloaded only on explicit preparation and is integrity checked', async () => {
  const f = fixture(false)
  const checked = f.request(false); await checked.done
  expect(checked.messages.at(-1)).toMatchObject({ state: 'missing' })
  expect(f.fetch).not.toHaveBeenCalled()
  f.fetch.mockResolvedValueOnce(new Response('not the published manifest'))
  const bad = f.request(true); await bad.done
  expect(bad.messages.at(-1)).toMatchObject({ state: 'error' })
  const good = f.request(true); await good.done
  expect(good.messages.at(-1)).toMatchObject({ state: 'ready' })
  expect(f.fetch).toHaveBeenCalledTimes(4)
})

test('a cold worker validates persisted content without any network request', async () => {
  const first = fixture(false)
  const prepare = first.request(true); await prepare.done
  expect(prepare.messages.at(-1)).toMatchObject({ state: 'ready' })
  const relaunched = fixture(false, first.stores)
  const check = relaunched.request(false); await check.done
  expect(check.messages.at(-1)).toMatchObject({ state: 'ready' })
  expect(relaunched.fetch).not.toHaveBeenCalled()
})

test('playback uses the same canonical caches as readiness checks when obsolete duplicate entries exist', async () => {
  const f = fixture()
  const prepare = f.request(true); await prepare.done
  const namespace = cacheNamespaceForBasePath('/preview')
  const shell = `tikkun-shell-${namespace}-test`
  const permanent = `tikkun-dependencies-${namespace}`
  await f.cache(permanent).put(core.url, new Response(Uint8Array.from([9, 9, 9, 9])))
  await f.cache(shell).put(cue.url, new Response(Uint8Array.from([8, 8, 8, 8])))
  for (const asset of [core, cue]) {
    const response = await f.api.serve(new Request(new URL(asset.url, origin)), asset === core ? f.api.cacheName(core.url) : shell)
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...bytes])
  }
  expect(f.fetch).toHaveBeenCalledTimes(2)
})

test('rejects another build and unknown cue paths without fetching', async () => {
  const f = fixture()
  const stale = f.request(true, 'old'); await stale.done
  expect(stale.messages.at(-1)).toMatchObject({ state: 'error', errorMessage: expect.stringContaining('another app build') })
  const foreign = f.request(true, 'current', ['https://other.test/private']); await foreign.done
  expect(foreign.messages.at(-1)).toMatchObject({ state: 'error', errorMessage: expect.stringContaining('Unknown published') })
  expect(f.fetch).not.toHaveBeenCalled()
})

test('detects corrupted stored content and failed replacement cannot erase it', async () => {
  const f = fixture()
  await f.cache(f.api.cacheName(core.url)).put(core.url, new Response(Uint8Array.from([9, 9, 9, 9])))
  const checked = f.request(false); await checked.done
  expect(checked.messages.at(-1)).toMatchObject({ state: 'missing' })
  f.fetch.mockResolvedValueOnce(new Response(Uint8Array.from([7, 7, 7, 7])))
  const failed = f.request(true); await failed.done
  expect(failed.messages.at(-1)).toMatchObject({ state: 'error', errorMessage: expect.stringContaining('integrity') })
  const retained = await f.cache(f.api.cacheName(core.url)).match(core.url)
  expect([...new Uint8Array(await retained!.arrayBuffer())]).toEqual([9, 9, 9, 9])
})

test.each([404, 500])('HTTP %s cannot become saved support content', async (status) => {
  const f = fixture()
  f.fetch.mockResolvedValueOnce(new Response('Failure', { status }))
  const failed = f.request(true); await failed.done
  expect(failed.messages.at(-1)).toMatchObject({ state: 'error' })
  expect(await f.cache(f.api.cacheName(core.url)).match(core.url)).toBeUndefined()
})

test.each([false, true])('shared transfer cancellation, cancel both=%s', async (both) => {
  const f = fixture()
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined
  f.fetch.mockImplementationOnce(async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      stream = controller
      signal.addEventListener('abort', () => controller.error(new DOMException('Cancelled', 'AbortError')), { once: true })
    },
  })))
  const first = f.request(true)
  const second = f.request(true)
  await vi.waitFor(() => expect(f.api.users()).toEqual([2]))
  first.cancel()
  if (both) second.cancel()
  else { stream!.enqueue(bytes); stream!.close() }
  await Promise.all([first.done, second.done])
  expect(first.messages.at(-1)).toMatchObject({ state: 'error', errorMessage: expect.stringContaining('cancelled') })
  expect(second.messages.at(-1)).toMatchObject({ state: both ? 'error' : 'ready' })
  expect(f.fetch).toHaveBeenCalledTimes(both ? 1 : 2)
  expect(Boolean(await f.cache(f.api.cacheName(core.url)).match(core.url))).toBe(!both)
})
