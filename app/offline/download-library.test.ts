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
  const inUse = vi.fn(() => false)
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

test('batch preflight includes active and queued audio but excludes verified copies', async () => {
  const f = fixture([asset('one'), asset('two'), asset('three'), asset('four'), asset('saved')])
  f.files.set(f.keys[4], f.assets[4])
  await f.library.enqueue(f.keys.slice(0, 3))
  await f.library.enqueue(f.keys.slice(3))
  expect(f.backend.preflight).toHaveBeenLastCalledWith(f.assets.slice(0, 4))
  expect(f.phases()).toEqual(['downloading', 'downloading', 'queued', 'queued', 'stored'])
})

test('destroying during preflight cannot persist or start the proposed batch', async () => {
  const f = fixture()
  let finish!: () => void
  vi.mocked(f.backend.preflight!).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const request = f.library.enqueue(f.keys)
  const rejected = expect(request).rejects.toThrow('destroyed')
  await vi.waitFor(() => expect(f.backend.preflight).toHaveBeenCalledOnce())
  f.library.destroy()
  finish()
  await rejected
  expect(f.intent.update).not.toHaveBeenCalled()
  expect(f.backend.download).not.toHaveBeenCalled()
})

test('destroying during intent persistence retains retry intent without starting transfers', async () => {
  const f = fixture()
  let finish!: () => void
  f.intent.update.mockImplementationOnce((add) => new Promise((resolve) => {
    finish = () => { add.forEach((key) => f.saved.add(key)); resolve() }
  }))
  const request = f.library.enqueue(f.keys)
  const rejected = expect(request).rejects.toThrow('destroyed')
  await vi.waitFor(() => expect(f.intent.update).toHaveBeenCalledOnce())
  f.library.destroy()
  finish()
  await rejected
  expect([...f.saved]).toEqual(f.keys)
  expect(f.backend.download).not.toHaveBeenCalled()
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

test('continues selective cleanup after one removal fails and reports partial results', async () => {
  const f = fixture()
  f.assets.forEach((recording, index) => f.files.set(f.keys[index], recording))
  vi.mocked(f.backend.remove).mockRejectedValueOnce(new Error('File busy'))
  await expect(f.library.remove(f.keys)).rejects.toThrow('Some recording downloads')
  expect(f.phases()).toEqual(['error', 'idle', 'idle'])
  expect(f.library.snapshot().inventory).toEqual([f.assets[0]])
})

test('does not transfer when persistence fails and retains verified files when cleanup persistence fails', async () => {
  const f = fixture()
  f.intent.update.mockRejectedValueOnce(new Error('Storage denied'))
  await expect(f.library.enqueue([f.keys[0]])).rejects.toThrow('Storage denied')
  expect(f.backend.download).not.toHaveBeenCalled()
  expect(f.library.snapshot().persistenceError).toBe('Storage denied')
  await f.library.enqueue([f.keys[0]])
  f.intent.update.mockRejectedValueOnce(new Error('Queue cleanup failed'))
  f.pending.get(f.keys[0])!.finish()
  await vi.waitFor(() => expect(f.library.snapshot().persistenceError).toBe('Queue cleanup failed'))
  expect(f.phases()[0]).toBe('stored')
  expect(f.library.snapshot().inventory).toHaveLength(1)
})

test('destroy aborts transfers, retains unfinished intent, and closes storage after settlement', async () => {
  const f = fixture()
  await f.library.enqueue(f.keys)
  f.library.destroy()
  await vi.waitFor(() => expect(f.backend.destroy).toHaveBeenCalledOnce())
  expect(f.saved.size).toBe(3)
  expect(f.pending.size).toBe(0)
  expect(f.backend.download).toHaveBeenCalledTimes(2)
  await expect(f.library.enqueue(f.keys)).rejects.toThrow('destroyed')
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

test('a failed dependency repair keeps the verified audio and never reports a complete package', async () => {
  const dependencies: RecordingDependencies = {
    check: vi.fn(async () => { throw new Error('Invalid published timings') }),
    prepare: vi.fn(async () => { throw new Error('Invalid published timings') }),
  }
  const f = fixture([asset('one')], dependencies)
  f.files.set(f.keys[0], f.assets[0])
  await f.library.refresh()
  expect(f.library.snapshot().entries[0]).toMatchObject({ phase: 'error', readiness: 'error' })
  await f.library.enqueue(f.keys)
  await vi.waitFor(() => expect(f.phases()).toEqual(['error']))
  expect(f.library.snapshot().inventory).toHaveLength(1)
  expect(f.backend.remove).not.toHaveBeenCalled()
  expect(f.backend.download).not.toHaveBeenCalled()
})

test('web package preflight includes saved audio with missing dependencies and precedes preparation', async () => {
  const dependencies: RecordingDependencies = {
    preflight: vi.fn(async () => { throw new Error('Not enough browser storage') }),
    check: async () => 'missing', prepare: vi.fn(async () => 'ready' as const),
  }
  const f = fixture([asset('one'), asset('two')], dependencies)
  f.files.set(f.keys[0], f.assets[0])
  await expect(f.library.enqueue(f.keys)).rejects.toThrow('Not enough browser storage')
  expect(dependencies.preflight).toHaveBeenCalledWith(f.assets, expect.any(AbortSignal))
  expect(f.intent.update).not.toHaveBeenCalled()
  expect(dependencies.prepare).not.toHaveBeenCalled()
  expect(f.backend.download).not.toHaveBeenCalled()
  expect(f.library.snapshot().inventory).toEqual([f.assets[0]])
})

test('destroy cancels worker package preflight without persisting the batch', async () => {
  const dependencies: RecordingDependencies = {
    preflight: vi.fn<NonNullable<RecordingDependencies['preflight']>>((_assets, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
    })), check: async () => 'missing', prepare: vi.fn(async () => 'ready' as const),
  }
  const f = fixture([asset('one')], dependencies)
  const request = f.library.enqueue(f.keys)
  const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(dependencies.preflight).toHaveBeenCalledOnce())
  f.library.destroy()
  await rejected
  expect(f.intent.update).not.toHaveBeenCalled()
  expect(dependencies.prepare).not.toHaveBeenCalled()
})

test('cancellation during dependency preparation cannot start audio afterward', async () => {
  let finish: ((value: 'ready') => void) | undefined
  const dependencies: RecordingDependencies = {
    check: async () => 'missing', prepare: vi.fn<RecordingDependencies['prepare']>(() => new Promise((resolve) => { finish = resolve })),
  }
  const f = fixture([asset('one')], dependencies)
  await f.library.enqueue(f.keys)
  await vi.waitFor(() => expect(dependencies.prepare).toHaveBeenCalledOnce())
  const cancelled = f.library.cancel(f.keys)
  await vi.waitFor(() => expect(vi.mocked(dependencies.prepare).mock.calls[0][1].aborted).toBe(true))
  finish!('ready')
  await cancelled
  expect(f.phases()).toEqual(['paused'])
  expect(f.backend.download).not.toHaveBeenCalled()
})

test('queue claims precede persistence and release after commit, cancellation and removal', async () => {
  const f = fixture()
  const held = new Set<string>()
  f.backend.protectQueued = vi.fn(async (asset) => {
    const key = recordingAssetKey(asset)
    held.add(key)
    return async () => { held.delete(key) }
  })
  await f.library.enqueue(f.keys)
  expect([...held]).toEqual(f.keys)
  f.pending.get(f.keys[0])!.finish()
  await vi.waitFor(() => expect(held.has(f.keys[0])).toBe(false))
  await f.library.remove(f.keys.slice(1))
  expect(held.size).toBe(0)
  expect(f.backend.download).toHaveBeenCalledTimes(3)
})

test('failed batch acquisition or persistence releases claims without starting work', async () => {
  const f = fixture()
  const release = vi.fn(async () => {})
  f.backend.protectQueued = vi.fn().mockResolvedValueOnce(release).mockRejectedValueOnce(new Error('Another tab is removing recordings'))
  await expect(f.library.enqueue(f.keys)).rejects.toThrow('Another tab')
  expect(release).toHaveBeenCalledOnce()
  expect(f.intent.update).not.toHaveBeenCalled()
  expect(f.backend.download).not.toHaveBeenCalled()
  vi.mocked(f.backend.protectQueued!).mockResolvedValue(release)
  f.intent.update.mockRejectedValueOnce(new Error('Storage denied'))
  await expect(f.library.enqueue(f.keys)).rejects.toThrow('Storage denied')
  expect(release).toHaveBeenCalledTimes(4)
  expect(f.backend.download).not.toHaveBeenCalled()
})

test('destroy during queue acquisition releases its late lease and cannot persist intent', async () => {
  const f = fixture()
  const release = vi.fn(async () => {})
  let finish!: () => void
  f.backend.protectQueued = vi.fn<NonNullable<RecordingStorage['protectQueued']>>(() => new Promise((resolve) => { finish = () => resolve(release) }))
  const request = f.library.enqueue([f.keys[0]])
  const failure = expect(request).rejects.toThrow('destroyed')
  await vi.waitFor(() => expect(f.backend.protectQueued).toHaveBeenCalledOnce())
  f.library.destroy()
  finish()
  await failure
  expect(release).toHaveBeenCalledOnce()
  expect(f.intent.update).not.toHaveBeenCalled()
  expect(f.backend.download).not.toHaveBeenCalled()
})

test('an immediate retry waits for the previous queue claim to release', async () => {
  const f = fixture([asset('one')])
  let finish!: () => void
  const release = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  f.backend.protectQueued = vi.fn().mockResolvedValueOnce(release).mockResolvedValue(async () => {})
  await f.library.enqueue(f.keys)
  f.pending.get(f.keys[0])!.fail(new Error('Disconnected'))
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce())
  const retry = f.library.enqueue(f.keys)
  expect(f.backend.download).toHaveBeenCalledOnce()
  finish()
  await retry
  expect(f.backend.download).toHaveBeenCalledTimes(2)
})

test('capacity is held until the last batch item settles and rolls back on enqueue failure', async () => {
  const release = vi.fn(async () => {})
  const dependencies: RecordingDependencies = {
    reserve: vi.fn(async () => release), preflight: vi.fn(async () => {}),
    check: async () => 'ready', prepare: async () => 'ready',
  }
  const f = fixture(undefined, dependencies)
  await f.library.enqueue(f.keys)
  expect(dependencies.preflight).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(f.pending.size).toBe(2))
  f.pending.get(f.keys[0])!.finish()
  await vi.waitFor(() => expect(f.backend.download).toHaveBeenCalledTimes(3))
  expect(release).not.toHaveBeenCalled()
  await f.library.cancel(f.keys.slice(1))
  expect(release).toHaveBeenCalledOnce()
  f.intent.update.mockRejectedValueOnce(new Error('Storage denied'))
  await expect(f.library.enqueue(f.keys.slice(1))).rejects.toThrow('Storage denied')
  expect(release).toHaveBeenCalledTimes(2)
  await f.library.enqueue(f.keys.slice(1))
  f.library.destroy()
  await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(3))
})

test('destroy during reservation releases a late reservation before backend teardown', async () => {
  let finish!: () => void
  const release = vi.fn(async () => {})
  const dependencies: RecordingDependencies = {
    reserve: vi.fn<NonNullable<RecordingDependencies['reserve']>>(() => new Promise((resolve) => { finish = () => resolve(release) })),
    check: async () => 'ready', prepare: async () => 'ready',
  }
  const f = fixture(undefined, dependencies)
  const request = f.library.enqueue(f.keys)
  const rejected = expect(request).rejects.toThrow('destroyed')
  await vi.waitFor(() => expect(dependencies.reserve).toHaveBeenCalledOnce())
  f.library.destroy(); finish(); await rejected
  expect(release).toHaveBeenCalledOnce()
  expect(f.intent.update).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(f.backend.destroy).toHaveBeenCalledOnce())
})
