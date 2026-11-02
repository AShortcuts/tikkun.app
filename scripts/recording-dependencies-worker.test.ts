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

test('preflight rejects low quota including dependencies before preparing or changing cached content', async () => {
  const f = fixture()
  f.estimate.mockResolvedValue({ quota: 33_554_432 + 19, usage: 0 })
  const request = f.request('preflight'); await request.done
  expect(request.messages.at(-1)).toMatchObject({ state: 'error', errorMessage: expect.stringContaining('Not enough browser storage') })
  expect(f.fetch).not.toHaveBeenCalled()
  expect(await f.cache(f.api.audioCache).match(recording.url)).toBeUndefined()
  expect(await f.cache(f.api.cacheName(core.url)).match(core.url)).toBeUndefined()
})

test.each([{}])('unknown quota remains unknown: %j', async (estimate) => {
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

test.each([404])('HTTP %s cannot become saved support content', async (status) => {
  const f = fixture()
  f.fetch.mockResolvedValueOnce(new Response('Failure', { status }))
  const failed = f.request(true); await failed.done
  expect(failed.messages.at(-1)).toMatchObject({ state: 'error' })
  expect(await f.cache(f.api.cacheName(core.url)).match(core.url)).toBeUndefined()
})
