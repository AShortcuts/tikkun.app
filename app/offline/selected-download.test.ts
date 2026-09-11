import { afterEach, expect, test, vi } from 'vitest'
import { createDownloadLibrary, type DownloadLibrary } from './download-library.ts'
import { createSelectedRecordingDownload } from './selected-download.ts'
import { descriptorForRecording, type OfflineDownloadRecording } from './recording-download.ts'
import { recordingAssetKey, resolveRecordingAsset, type RecordingStorage } from './recording-storage.ts'
import type { StoredRecording } from './recording-inventory.ts'

const libraries: DownloadLibrary[] = []
afterEach(() => { libraries.splice(0).forEach((library) => library.destroy()) })
function setup() {
  const recording: OfflineDownloadRecording = {
    id: 'first', title: 'First aliyah', status: 'available', playSrc: '/audio/first.m4a',
    mediaIdentity: { algorithm: 'sha256', digest: 'a'.repeat(64), byteLength: 100 },
  }
  let current: OfflineDownloadRecording | null = recording
  const asset = resolveRecordingAsset(descriptorForRecording(recording)!, 'https://tikkun.test/reader/')
  const files = new Map<string, StoredRecording>()
  const backend: RecordingStorage = {
    supported: true,
    inventory: async () => [...files.values()],
    download: vi.fn(async (asset) => { files.set(recordingAssetKey(asset), asset); return asset }),
    remove: vi.fn(async (asset) => { files.delete(recordingAssetKey(asset)) }),
    destroy: vi.fn(),
  }
  const inUse = vi.fn(() => false)
  const library = createDownloadLibrary({
    assets: [asset], backend, inUse,
    intent: { read: async () => [], update: async () => {} },
  })
  libraries.push(library)
  const adapter = () => createSelectedRecordingDownload({ library, getRecording: () => current, baseUrl: 'https://tikkun.test/reader/' })
  return { library, adapter, backend, files, asset, inUse, setCurrent: (value: OfflineDownloadRecording | null) => { current = value } }
}

test('Settings and a second subscriber share verified counts and selective removal', async () => {
  const f = setup()
  const settings = f.adapter()
  const other = f.adapter()
  await settings.refresh()
  expect(settings.getSnapshot()).toMatchObject({ phase: 'idle', exactStored: false })
  await settings.download('first')
  await vi.waitFor(() => expect(other.getSnapshot()).toMatchObject({ phase: 'complete', storedCount: 1, storedBytes: 100 }))
  expect(f.backend.download).toHaveBeenCalledOnce()
  await expect(other.remove('first')).resolves.toMatchObject({ status: 'completed' })
  expect(settings.getSnapshot()).toMatchObject({ phase: 'idle', storedCount: 0 })
  settings.destroy(); other.destroy()
})

test('rejects stale selection commands and does not destroy the library when Settings closes', async () => {
  const f = setup()
  const settings = f.adapter()
  await settings.download('previous')
  expect(f.backend.download).not.toHaveBeenCalled()
  await expect(settings.remove('previous')).resolves.toMatchObject({ status: 'skipped' })
  settings.destroy()
  expect(f.backend.destroy).not.toHaveBeenCalled()
  await f.library.enqueue([recordingAssetKey(f.asset)])
  await vi.waitFor(() => expect(f.library.snapshot().inventory).toHaveLength(1))
})

test('shows pending removal without announcing a file was deleted during playback', async () => {
  const f = setup()
  f.files.set(recordingAssetKey(f.asset), f.asset)
  f.inUse.mockReturnValue(true)
  const settings = f.adapter()
  await settings.refresh()
  await expect(settings.remove('first')).resolves.toMatchObject({ status: 'pending' })
  expect(settings.getSnapshot()).toMatchObject({ phase: 'removing', removalPending: true, exactStored: true })
  f.inUse.mockReturnValue(false)
  await f.library.releasePlayback()
  expect(settings.getSnapshot()).toMatchObject({ phase: 'idle', exactStored: false })
  settings.destroy()
})

test('includes obsolete inventory and supports clear-all with no selected recording', async () => {
  const f = setup()
  const old = { ...f.asset, audioId: 'old', url: 'https://tikkun.test/audio/old.m4a', byteLength: 50 }
  f.files.set(recordingAssetKey(old), old)
  f.setCurrent(null)
  const settings = f.adapter()
  await settings.refresh()
  expect(settings.getSnapshot()).toMatchObject({ phase: 'no-recording', storedCount: 1, otherBytes: 50 })
  await expect(settings.removeAll()).resolves.toMatchObject({ status: 'completed' })
  expect(f.backend.remove).toHaveBeenCalledOnce()
  expect(settings.getSnapshot().storedCount).toBe(0)
  settings.destroy()
})

test('surfaces backend failures without unhandled fire-and-forget action rejections', async () => {
  const f = setup()
  const settings = f.adapter()
  vi.mocked(f.backend.download).mockRejectedValueOnce(new Error('Download denied'))
  await settings.download('first')
  await vi.waitFor(() => expect(settings.getSnapshot()).toMatchObject({ phase: 'error', errorMessage: 'Download denied' }))
  settings.destroy()
})
