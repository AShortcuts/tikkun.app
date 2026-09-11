import { expect, test, vi } from 'vitest'
import type { NativeMediaPlugin } from '../platform/native-media.ts'
import { createNativeDownloadIntent, createNativeRecordingStorage, resolveNativeRecording } from './native-recording-storage.ts'
import type { RecordingDescriptor } from './recording-download.ts'

const asset: RecordingDescriptor = {
  audioId: 'one', title: 'One', url: 'https://tikkunreader.com/audio/one.m4a', digest: 'a'.repeat(64), byteLength: 100,
}
function harness() {
  let callback: ((value: unknown) => void) | undefined
  const removeListener = vi.fn(async () => {})
  const bridge: NativeMediaPlugin = {
    inventory: vi.fn(async () => ({ recordings: [asset] })),
    preflight: vi.fn(async () => {}),
    download: vi.fn(async () => asset), cancelDownload: vi.fn(async () => {}),
    remove: vi.fn(async () => {}), resolve: vi.fn(async () => ({ url: null })),
    metrics: vi.fn(async () => ({})), clearTemporary: vi.fn(async () => {}),
    readIntent: vi.fn(async () => ({ keys: ['one'] })), updateIntent: vi.fn(async () => {}),
    addListener: vi.fn(async (_event, listener) => { callback = listener; return { remove: removeListener } }),
  }
  return { bridge, removeListener, emit: (value: unknown) => callback?.(value), storage: createNativeRecordingStorage(bridge) }
}

test('native inventory retains verified metadata and labels device storage', async () => {
  const { storage, bridge } = harness()
  expect(storage.location).toBe('device')
  await expect(storage.inventory()).resolves.toEqual([expect.objectContaining({ audioId: 'one', byteLength: 100 })])
  vi.mocked(bridge.inventory).mockResolvedValueOnce({ recordings: [{ ...asset, digest: 'bad' }] })
  await expect(storage.inventory()).rejects.toThrow('Invalid')
})

test('native batch preflight forwards physical assets and propagates low-space rejection', async () => {
  const { storage, bridge } = harness()
  await storage.preflight!([asset])
  expect(bridge.preflight).toHaveBeenCalledExactlyOnceWith({ assets: [asset] })
  vi.mocked(bridge.preflight).mockRejectedValueOnce(new Error('Not enough storage. Remove downloads or choose fewer recordings.'))
  await expect(storage.preflight!([asset])).rejects.toThrow('Not enough storage')
  expect(bridge.download).not.toHaveBeenCalled()
})

test('filters progress by request identity and releases its listener after commit', async () => {
  const { storage, bridge, emit, removeListener } = harness()
  vi.mocked(bridge.download).mockImplementationOnce(async ({ requestId }) => {
    emit({ requestId: 'other', bytes: 70 }); emit({ requestId, bytes: 30 }); return asset
  })
  const progress = vi.fn()
  await storage.download(asset, new AbortController().signal, progress)
  expect(progress).toHaveBeenCalledExactlyOnceWith(30)
  expect(removeListener).toHaveBeenCalledOnce()
})

test('cancellation waits for native transfer settlement and removes only its own listener', async () => {
  const { storage, bridge, removeListener } = harness()
  const controller = new AbortController()
  let fail: ((error: Error) => void) | undefined
  vi.mocked(bridge.download).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
  const request = storage.download(asset, controller.signal, vi.fn())
  const rejection = expect(request).rejects.toThrow('Cancelled')
  await vi.waitFor(() => expect(bridge.download).toHaveBeenCalledOnce())
  controller.abort()
  await vi.waitFor(() => expect(bridge.cancelDownload).toHaveBeenCalledOnce())
  expect(removeListener).not.toHaveBeenCalled()
  fail!(new Error('Cancelled'))
  await rejection
  expect(removeListener).toHaveBeenCalledOnce()
})

test('does not start an aborted request and rejects mismatched committed identity', async () => {
  const { storage, bridge } = harness()
  const controller = new AbortController(); controller.abort()
  await expect(storage.download(asset, controller.signal, vi.fn())).rejects.toMatchObject({ name: 'AbortError' })
  expect(bridge.download).not.toHaveBeenCalled()
  vi.mocked(bridge.download).mockResolvedValueOnce({ ...asset, byteLength: 99 })
  await expect(storage.download(asset, new AbortController().signal, vi.fn())).rejects.toThrow('identity changed')
})

test('native queue persistence does not depend on Web Locks', async () => {
  const { bridge } = harness()
  const intent = createNativeDownloadIntent(bridge)
  await expect(intent.read()).resolves.toEqual(['one'])
  await intent.update(['two'], ['one'])
  expect(bridge.updateIntent).toHaveBeenCalledWith({ add: ['two'], remove: ['one'] })
  vi.mocked(bridge.readIntent).mockResolvedValueOnce({ keys: ['one', 'one'] })
  await expect(intent.read()).rejects.toThrow('Invalid native download queue')
})

test('playback resolves a verified local file and streams only when no saved copy exists', async () => {
  const { bridge } = harness()
  const recording = { id: asset.audioId, title: asset.title, status: 'available' as const, playSrc: asset.url,
    mediaIdentity: { algorithm: 'sha256' as const, digest: asset.digest, byteLength: asset.byteLength } }
  await expect(resolveNativeRecording(recording, bridge)).resolves.toBe(asset.url)
  vi.mocked(bridge.resolve).mockResolvedValueOnce({ url: 'file:///owned/recording.m4a' })
  await expect(resolveNativeRecording(recording, bridge)).resolves.toBe('file:///owned/recording.m4a')
  vi.mocked(bridge.resolve).mockRejectedValueOnce(new Error('Stored file is corrupt'))
  await expect(resolveNativeRecording(recording, bridge)).rejects.toThrow('corrupt')
  vi.mocked(bridge.resolve).mockResolvedValueOnce({ url: 'https://other.test/recording.m4a' })
  await expect(resolveNativeRecording(recording, bridge)).rejects.toThrow('not a local file')
})
