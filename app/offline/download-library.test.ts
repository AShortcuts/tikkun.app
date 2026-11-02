import { afterEach, expect, test, vi } from 'vitest'
import { createDownloadLibrary, type DownloadLibrary } from './download-library.ts'
import type { RecordingDescriptor } from './recording-download.ts'
import type { StoredRecording } from './recording-inventory.ts'
import { recordingAssetKey, resolveRecordingAsset, type RecordingStorage } from './recording-storage.ts'
import type { RecordingDependencies } from './recording-dependencies.ts'

const asset = (id: string): RecordingDescriptor => ({
  audioId: id, title: id, url: `https://tikkun.test/audio/${id}.m4a`, digest: 'a'.repeat(64), byteLength: 100,
})
const libraries: DownloadLibrary[] = []
afterEach(() => { libraries.splice(0).forEach((library) => library.destroy()) })

function fixture(assets = [asset('one'), asset('two'), asset('three')], dependencies?: RecordingDependencies) {
  const files = new Map<string, StoredRecording>()
  const saved = new Set<string>()
  const pending = new Map<string, {
    finish(result?: StoredRecording): void
    fail(error: Error): void
    progress(bytes: number): void
    signal: AbortSignal
  }>()
  const backend: RecordingStorage = {
    supported: true,
    inventory: vi.fn(async () => [...files.values()]),
    preflight: vi.fn(async () => {}),
    download: vi.fn<RecordingStorage['download']>((recording, signal, progress) => new Promise((resolve, reject) => {
      const key = recordingAssetKey(recording)
      const fail = (error: Error) => { pending.delete(key); reject(error) }
      pending.set(key, {
        signal, progress, fail,
        finish(result = recording) { files.set(key, result); pending.delete(key); resolve(result) },
      })
      signal.addEventListener('abort', () => fail(new DOMException('Cancelled', 'AbortError')), { once: true })
      if (signal.aborted) fail(new DOMException('Cancelled', 'AbortError'))
    })),
    remove: vi.fn(async (recording) => { files.delete(recordingAssetKey(recording)) }),
    destroy: vi.fn(),
  }
  const intent = {
    read: vi.fn(async () => [...saved]),
    update: vi.fn(async (add: readonly string[], remove: readonly string[]) => {
      remove.forEach((key) => saved.delete(key)); add.forEach((key) => saved.add(key))
    }),
  }
  const inUse = vi.fn<(asset: RecordingDescriptor) => boolean>(() => false)
  const library = createDownloadLibrary({ assets, backend, intent, inUse, dependencies })
  libraries.push(library)
  const keys = assets.map(recordingAssetKey)
  const phases = () => library.snapshot().entries.map((entry) => entry.phase)
  return { library, keys, phases, pending, saved, files, backend, intent, inUse, assets }
}

test('normalizes catalog URLs to worker inventory identities and rejects malformed assets', () => {
  const recording = { ...asset('one'), url: '/audio/one.m4a' }
  expect(resolveRecordingAsset(recording, 'https://tikkun.test/reader/')).toEqual(asset('one'))
  expect(() => resolveRecordingAsset({ ...recording, byteLength: 0 }, 'https://tikkun.test')).toThrow('identity')
  expect(() => resolveRecordingAsset({ ...recording, url: 'file:///private/audio.m4a' }, 'https://tikkun.test')).toThrow('identity')
})

test('deduplicates physical assets and keeps at most two transfers active', async () => {
  const f = fixture([asset('one'), asset('two'), asset('three'), { ...asset('one'), audioId: 'alias' }])
  await f.library.enqueue(f.keys)
  expect(f.backend.download).toHaveBeenCalledTimes(2)
  expect(f.phases()).toEqual(['downloading', 'downloading', 'queued'])
  expect(f.backend.preflight).toHaveBeenCalledExactlyOnceWith(f.assets.slice(0, 3))
  await f.library.enqueue(f.keys)
  expect(f.backend.download).toHaveBeenCalledTimes(2)
  expect(f.backend.preflight).toHaveBeenCalledOnce()
  f.pending.get(f.keys[0])!.progress(100)
  expect(f.phases()[0]).toBe('verifying')
  expect(f.library.snapshot().inventory).toHaveLength(0)
  f.pending.get(f.keys[0])!.finish()
  await vi.waitFor(() => expect(f.backend.download).toHaveBeenCalledTimes(3))
  expect(f.phases()).toEqual(['stored', 'downloading', 'downloading'])
  expect(f.saved.has(f.keys[0])).toBe(false)
})

test('restores unfinished intent as paused without restarting transfers', async () => {
  const f = fixture()
  f.saved.add(f.keys[0]); f.saved.add('obsolete')
  f.files.set(f.keys[1], f.assets[1])
  await f.library.refresh()
  expect(f.phases()).toEqual(['paused', 'stored', 'idle'])
  expect(f.library.snapshot().unavailableIntent).toEqual(['obsolete'])
  expect(f.backend.download).not.toHaveBeenCalled()
})

test('rejects a low-space batch before persisting intent or starting transfers', async () => {
  const f = fixture()
  vi.mocked(f.backend.preflight!).mockRejectedValueOnce(new Error('Not enough storage'))
  await expect(f.library.enqueue(f.keys)).rejects.toThrow('Not enough storage')
  expect(f.phases()).toEqual(['idle', 'idle', 'idle'])
  expect(f.intent.update).not.toHaveBeenCalled()
  expect(f.backend.download).not.toHaveBeenCalled()
  await f.library.enqueue([f.keys[0]])
  expect(f.backend.preflight).toHaveBeenLastCalledWith([f.assets[0]])
  expect(f.backend.download).toHaveBeenCalledOnce()
})

test('retry preserves completed assets and queues only missing recordings', async () => {
  const f = fixture()
  await f.library.enqueue(f.keys.slice(0, 2))
  f.pending.get(f.keys[0])!.finish()
  f.pending.get(f.keys[1])!.fail(new Error('Network disconnected'))
  await vi.waitFor(() => expect(f.phases()).toEqual(['stored', 'error', 'idle']))
  await f.library.enqueue(f.keys.slice(0, 2))
  expect(f.backend.download).toHaveBeenCalledTimes(3)
  expect(f.phases()).toEqual(['stored', 'downloading', 'idle'])
})

test('rejects an identity mismatch instead of claiming a completed recording', async () => {
  const f = fixture()
  await f.library.enqueue([f.keys[0]])
  f.pending.get(f.keys[0])!.finish(asset('wrong'))
  await vi.waitFor(() => expect(f.phases()[0]).toBe('error'))
  expect(f.library.snapshot().inventory).toHaveLength(0)
  expect(f.saved.has(f.keys[0])).toBe(true)
})

test('cancels active and queued work without starting queued selections', async () => {
  const f = fixture()
  await f.library.enqueue(f.keys)
  await f.library.cancel(f.keys)
  expect(f.phases()).toEqual(['paused', 'paused', 'paused'])
  expect(f.backend.download).toHaveBeenCalledTimes(2)
  expect(f.saved.size).toBe(3)
  expect(f.pending.size).toBe(0)
})

test('defers deletion until playback releases the file', async () => {
  const f = fixture()
  f.files.set(f.keys[0], f.assets[0])
  f.inUse.mockReturnValue(true)
  await f.library.remove([f.keys[0]])
  expect(f.phases()[0]).toBe('removal-pending')
  expect(f.backend.remove).not.toHaveBeenCalled()
  await f.library.releasePlayback()
  expect(f.backend.remove).not.toHaveBeenCalled()
  f.inUse.mockReturnValue(false)
  await f.library.releasePlayback()
  expect(f.phases()[0]).toBe('idle')
  expect(f.files.size).toBe(0)
})

test('does not download audio until dependencies are ready, and retains intent on failure', async () => {
  const dependencies: RecordingDependencies = {
    check: vi.fn<RecordingDependencies['check']>(async () => 'missing'),
    prepare: vi.fn(async () => { throw new Error('Published timings unavailable') }),
  }
  const f = fixture([asset('one')], dependencies)
  await f.library.enqueue(f.keys)
  await vi.waitFor(() => expect(f.phases()).toEqual(['error']))
  expect(f.backend.download).not.toHaveBeenCalled()
  expect(f.library.snapshot().entries[0]).toMatchObject({ readiness: 'error', error: 'Published timings unavailable' })
  expect(f.saved.has(f.keys[0])).toBe(true)
  vi.mocked(dependencies.prepare).mockResolvedValueOnce('ready')
  await f.library.enqueue(f.keys)
  await vi.waitFor(() => expect(f.backend.download).toHaveBeenCalledOnce())
  f.pending.get(f.keys[0])!.finish()
  await vi.waitFor(() => expect(f.phases()).toEqual(['stored']))
  expect(f.library.snapshot().entries[0].readiness).toBe('ready')
})

test('reconciles missing dependencies without hiding audio bytes and repairs without re-downloading audio', async () => {
  const dependencies: RecordingDependencies = {
    check: vi.fn<RecordingDependencies['check']>(async () => 'missing'), prepare: vi.fn<RecordingDependencies['prepare']>(async () => 'audio-only'),
  }
  const f = fixture([asset('one')], dependencies)
  f.files.set(f.keys[0], f.assets[0])
  await f.library.refresh()
  expect(f.library.snapshot().entries[0]).toMatchObject({ phase: 'paused', readiness: 'missing', downloadedBytes: 100 })
  expect(f.library.snapshot().inventory).toHaveLength(1)
  await f.library.enqueue(f.keys)
  await vi.waitFor(() => expect(f.phases()).toEqual(['stored']))
  expect(f.library.snapshot().entries[0].readiness).toBe('audio-only')
  expect(f.backend.download).not.toHaveBeenCalled()
  expect(f.backend.preflight).not.toHaveBeenCalled()
})

test('removes a copy superseded by re-published bytes once playback releases it, without downloading', async () => {
  const f = fixture()
  const old = { ...f.assets[0], url: 'https://tikkun.test/audio/one.m4a?tikkun-media=old', digest: 'b'.repeat(64) }
  const withdrawn = { ...asset('gone'), digest: 'c'.repeat(64) }
  f.files.set(recordingAssetKey(old), old)
  f.files.set(recordingAssetKey(withdrawn), withdrawn)
  f.saved.add(recordingAssetKey(old))
  f.inUse.mockImplementation((recording) => recording.digest === old.digest)
  await f.library.refresh()
  await vi.waitFor(() => expect(f.library.snapshot().entries.find((entry) => entry.key === recordingAssetKey(old))?.phase).toBe('removal-pending'))
  expect(f.backend.remove).not.toHaveBeenCalled()
  f.inUse.mockReturnValue(false)
  await f.library.releasePlayback()
  expect(f.backend.remove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ digest: old.digest }))
  expect(f.files.has(recordingAssetKey(old))).toBe(false)
  expect(f.files.has(recordingAssetKey(withdrawn))).toBe(true)
  expect(f.library.snapshot().entries.map((entry) => entry.key)).not.toContain(recordingAssetKey(old))
  expect(f.library.snapshot().unavailableIntent).toEqual([])
  expect(f.saved.has(recordingAssetKey(old))).toBe(false)
  expect(f.backend.download).not.toHaveBeenCalled()
  expect(f.phases()).toEqual(['idle', 'idle', 'idle', 'stored'])
})
