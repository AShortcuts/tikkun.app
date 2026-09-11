import { expect, test, vi } from 'vitest'
import { createWebRecordingDependencies } from './web-recording-dependencies.ts'
import type { OfflineWorkerRequestClient } from './worker-request.ts'
import type { RecordingDescriptor } from './recording-download.ts'
import type { RecordingDependencies } from './recording-dependencies.ts'

const asset: RecordingDescriptor = { audioId: 'one', title: 'One', url: 'https://tikkun.test/audio/one.m4a', digest: 'a'.repeat(64), byteLength: 100 }
function fixture() {
  const requests: OfflineWorkerRequestClient = {
    supported: true, destroy: vi.fn(), request: vi.fn<OfflineWorkerRequestClient['request']>(async (_message, receive) => {
      receive({ type: 'RECORDING_DEPENDENCIES', version: 'build-one', state: 'ready' })
      return 'complete'
    }),
  }
  const cues: RecordingDependencies & { sources(asset: RecordingDescriptor): readonly string[] } = {
    check: vi.fn(async () => 'ready' as const), prepare: vi.fn(async () => 'audio-only' as const), sources: () => ['audio-cues/test/1.json'],
  }
  const dependencies = createWebRecordingDependencies({ recordings: [], baseUrl: 'https://tikkun.test', serviceWorker: null, version: 'build-one', requests, cues })
  return { dependencies, requests, cues }
}

test('requires durable cache proof before semantic cue loading', async () => {
  const f = fixture()
  await expect(f.dependencies.check(asset)).resolves.toBe('ready')
  expect(f.requests.request).toHaveBeenCalledWith({ type: 'GET_RECORDING_DEPENDENCIES', version: 'build-one', cues: ['audio-cues/test/1.json'] }, expect.any(Function), expect.any(Object))
  vi.mocked(f.requests.request).mockImplementationOnce(async (_message, receive) => {
    receive({ type: 'RECORDING_DEPENDENCIES', version: 'build-one', state: 'missing' }); return 'complete'
  })
  await expect(f.dependencies.check(asset)).resolves.toBe('missing')
  expect(f.cues.check).toHaveBeenCalledOnce()
})

test('prepare forwards cancellation and distinguishes published audio-only content', async () => {
  const f = fixture()
  const controller = new AbortController()
  await expect(f.dependencies.prepare(asset, controller.signal)).resolves.toBe('audio-only')
  expect(f.requests.request).toHaveBeenCalledWith(expect.objectContaining({ type: 'PREPARE_RECORDING_DEPENDENCIES' }), expect.any(Function), {
    signal: controller.signal, cancelMessage: { type: 'CANCEL_RECORDING_DEPENDENCIES' },
  })
  controller.abort()
  await expect(f.dependencies.prepare(asset, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(f.cues.prepare).toHaveBeenCalledOnce()
  f.dependencies.destroy()
  expect(f.requests.destroy).toHaveBeenCalledOnce()
})

test.each([
  [{ type: 'RECORDING_DEPENDENCIES', version: 'old', state: 'ready' }, 'another app build'],
  [{ type: 'RECORDING_DEPENDENCIES', version: 'build-one', state: 'error', errorMessage: 'Storage full' }, 'Storage full'],
  [{ type: 'RECORDING_DEPENDENCIES', version: 'build-one', state: 'invented' }, 'Invalid offline dependency state'],
  [{}, 'Invalid offline dependency response'],
])('does not claim readiness for an invalid response', async (value, message) => {
  const f = fixture()
  vi.mocked(f.requests.request).mockImplementationOnce(async (_message, receive) => { receive(value); return 'complete' })
  await expect(f.dependencies.check(asset)).rejects.toThrow(message as string)
  expect(f.cues.check).not.toHaveBeenCalled()
})

test('progress does not complete a request and unsupported storage cannot succeed', async () => {
  const f = fixture()
  vi.mocked(f.requests.request).mockImplementationOnce(async (_message, receive) => {
    expect(receive({ type: 'RECORDING_DEPENDENCIES', version: 'build-one', state: 'progress' })).toBe(false)
    receive({ type: 'RECORDING_DEPENDENCIES', version: 'build-one', state: 'ready' }); return 'complete'
  })
  await expect(f.dependencies.check(asset)).resolves.toBe('ready')
  vi.mocked(f.requests.request).mockResolvedValueOnce('unavailable')
  await expect(f.dependencies.check(asset)).rejects.toThrow('unavailable')
})

test('batch preflight sends all recording identities and unique cue sources without loading cues', async () => {
  const f = fixture()
  vi.mocked(f.requests.request).mockImplementationOnce(async (_message, receive) => {
    expect(receive({ type: 'RECORDING_PREFLIGHT', version: 'build-one', state: 'progress' })).toBe(false)
    receive({ type: 'RECORDING_PREFLIGHT', version: 'build-one', state: 'ready', requiredBytes: 900, availableBytes: null,
      reservationAssets: [{ url: asset.url, byteLength: asset.byteLength }] })
    return 'complete'
  })
  const controller = new AbortController()
  const assets = [asset, { ...asset, audioId: 'alias' }]
  await f.dependencies.preflight!(assets, controller.signal)
  expect(f.requests.request).toHaveBeenCalledExactlyOnceWith({ type: 'PREFLIGHT_RECORDING_DOWNLOADS', version: 'build-one',
    recordings: assets, cues: ['audio-cues/test/1.json'],
  }, expect.any(Function), { signal: controller.signal, cancelMessage: { type: 'CANCEL_RECORDING_DEPENDENCIES' } })
  expect(f.cues.check).not.toHaveBeenCalled()
  expect(f.cues.prepare).not.toHaveBeenCalled()
})

test.each([
  [{ type: 'RECORDING_PREFLIGHT', version: 'old', state: 'ready' }, 'another app build'],
  [{ type: 'RECORDING_PREFLIGHT', version: 'build-one', state: 'error', errorMessage: 'Not enough browser storage' }, 'Not enough browser storage'],
  [{ type: 'RECORDING_PREFLIGHT', version: 'build-one', state: 'ready', requiredBytes: -1, availableBytes: 0 }, 'measurements'],
  [{ type: 'RECORDING_PREFLIGHT', version: 'build-one', state: 'ready', requiredBytes: 0 }, 'measurements'],
  [{ type: 'RECORDING_PREFLIGHT', version: 'build-one', state: 'ready', requiredBytes: 0, availableBytes: null }, 'needs an update'],
  [{ type: 'RECORDING_PREFLIGHT', version: 'build-one', state: 'ready', requiredBytes: 0, availableBytes: null, reservationAssets: [{ url: 'file:///bad', byteLength: 1 }] }, 'needs an update'],
  [{ type: 'RECORDING_DEPENDENCIES', version: 'build-one', state: 'ready' }, 'response'],
])('preflight rejects stale or invalid measurement responses', async (value, message) => {
  const f = fixture()
  vi.mocked(f.requests.request).mockImplementationOnce(async (_message, receive) => { receive(value); return 'complete' })
  await expect(f.dependencies.preflight!([asset], new AbortController().signal)).rejects.toThrow(message as string)
})

test('preflight cannot succeed after cancellation or without a worker response', async () => {
  const f = fixture()
  const controller = new AbortController(); controller.abort()
  await expect(f.dependencies.preflight!([asset], controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(f.requests.request).not.toHaveBeenCalled()
  vi.mocked(f.requests.request).mockResolvedValueOnce('unavailable')
  await expect(f.dependencies.preflight!([asset], new AbortController().signal)).rejects.toThrow('unavailable')
  vi.mocked(f.requests.request).mockResolvedValueOnce('complete')
  await expect(f.dependencies.preflight!([asset], new AbortController().signal)).rejects.toThrow('unavailable')
})
