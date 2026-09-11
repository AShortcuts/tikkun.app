import { expect, test, vi } from 'vitest'
import { createWebStorageMeter, parseNativeStorageMetrics } from './storage-metrics.ts'
import type { DownloadLibrarySnapshot } from './download-library.ts'

test('native logical categories exclude device headroom from measured total', () => {
  const value = parseNativeStorageMetrics({ appBytes: 100, audioBytes: 200, temporaryBytes: 30, metadataBytes: 4, availableBytes: 9999 })
  expect(value.categories.reduce((sum, category) => sum + category.bytes, 0)).toBe(334)
  expect(value.availableBytes).toBe(9999)
})
test('unknown capacity remains unknown; malformed measurements reject', () => {
  expect(parseNativeStorageMetrics({ appBytes: 1, audioBytes: 0, temporaryBytes: 0, metadataBytes: 0, availableBytes: null }).availableBytes).toBeNull()
  expect(() => parseNativeStorageMetrics({ appBytes: -1 })).toThrow('Invalid device storage field')
  expect(() => parseNativeStorageMetrics({ appBytes: 1, audioBytes: 0, temporaryBytes: 0, metadataBytes: 0 })).toThrow('availableBytes')
})
test('browser measures only matching app caches and decoded bytes; quota is separate', async () => {
  const namespace = '8a5edab28263' // SHA-256('/') prefix, matching the worker generator.
  const response = new Response('decoded body', { headers: { 'content-length': '2' } })
  const opened: string[] = []
  const cache = { keys: vi.fn(async () => [new Request('https://tikkunreader.com/core.js')]), match: vi.fn(async () => response.clone()) }
  const caches = { keys: vi.fn(async () => [`tikkun-shell-${namespace}-v1`, `tikkun-dependencies-${namespace}`, 'unrelated', 'tikkun-shell-other-v1']), open: vi.fn(async (name: string) => { opened.push(name); return cache }) }
  const snapshot: DownloadLibrarySnapshot = { supported: true, location: 'browser', phase: 'ready', entries: [], inventory: [{ audioId: 'x', digest: 'a'.repeat(64), byteLength: 50, url: 'https://tikkunreader.com/a' }], error: null, persistenceError: null, unavailableIntent: [] }
  const meter = createWebStorageMeter({ caches, storage: { estimate: async () => ({ usage: 200, quota: 1000 }) }, basePath: '', crypto: globalThis.crypto })
  const result = await meter.measure(snapshot)
  expect(opened).toEqual([`tikkun-shell-${namespace}-v1`, `tikkun-dependencies-${namespace}`])
  expect(result.categories.map((category) => category.bytes)).toEqual([12, 12, 50])
  expect(result.availableBytes).toBe(800)
  expect(result.availableLabel).toBe('Browser storage available (estimated)')
})
