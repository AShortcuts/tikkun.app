import type { DownloadLibrary } from './download-library.ts'
import {
  descriptorForRecording,
  type OfflineDownloadRecording,
  type OfflineRecordingDownloadController,
  type OfflineRecordingDownloadPhase,
  type OfflineRecordingDownloadSnapshot,
  type OfflineRecordingRemovalResult,
} from './recording-download.ts'
import { recordingAssetKey, resolveRecordingAsset } from './recording-storage.ts'

// Settings owns only this selection adapter. Closing it never stops the library.
export function createSelectedRecordingDownload({ library, getRecording, baseUrl }: {
  library: DownloadLibrary
  getRecording(): OfflineDownloadRecording | null
  baseUrl: string
}): OfflineRecordingDownloadController {
  const listeners = new Set<(snapshot: OfflineRecordingDownloadSnapshot) => void>()
  let actionError: string | null = null
  let actionRecordingId: string | null = null
  let destroyed = false
  const descriptor = () => {
    const asset = descriptorForRecording(getRecording())
    return asset ? resolveRecordingAsset(asset, baseUrl) : null
  }
  const snapshot = (): OfflineRecordingDownloadSnapshot => {
    const state = library.snapshot()
    const recording = getRecording()
    let key: string | null = null
    let descriptorError: string | null = null
    try {
      const asset = descriptor()
      if (asset) key = recordingAssetKey(asset)
    } catch (error) { descriptorError = error instanceof Error ? error.message : 'Invalid recording identity.' }
    const entry = state.entries.find((entry) => entry.key === key)
    const stored = state.inventory.find((asset) => recordingAssetKey(asset) === key)
    const other = state.inventory.filter((asset) => recordingAssetKey(asset) !== key)
    const errorMessage = descriptorError ?? (actionRecordingId === (recording?.id ?? null) ? actionError : null) ??
      entry?.error ?? state.persistenceError ?? state.error ?? (stored && entry?.readiness === 'missing' ? 'Required offline text or timings are missing.' : null)
    let phase: OfflineRecordingDownloadPhase = 'idle'
    if (!state.supported) phase = 'unavailable'
    else if (errorMessage) phase = 'error'
    else if (!recording) phase = 'no-recording'
    else if (!key) phase = 'unavailable'
    else if (state.phase === 'checking' || state.phase === 'idle') phase = 'checking'
    else if (entry?.phase === 'removing' || entry?.phase === 'removal-pending') phase = 'removing'
    else if (entry && ['queued', 'downloading', 'verifying'].includes(entry.phase)) phase = 'downloading'
    else if (stored && entry?.phase === 'stored') phase = 'complete'
    return {
      supported: state.supported, phase, recordingId: recording?.id ?? null, recordingTitle: recording?.title ?? null,
      exactStored: Boolean(stored), downloadedBytes: stored?.byteLength ?? entry?.downloadedBytes ?? 0,
      totalBytes: recording?.mediaIdentity?.byteLength ?? 0,
      storedCount: state.inventory.length, storedBytes: state.inventory.reduce((total, asset) => total + asset.byteLength, 0),
      otherCount: other.length, otherBytes: other.reduce((total, asset) => total + asset.byteLength, 0),
      inventoryPhase: !state.supported ? 'unavailable' : state.phase === 'checking' || state.phase === 'idle' ? 'checking' : state.error ? 'error' : 'idle',
      inventoryErrorMessage: state.error, errorMessage,
      removalPending: entry?.phase === 'removal-pending',
      storageLocation: state.location,
      requiresDependencyRepair: Boolean(stored && entry && ['missing', 'error'].includes(entry.readiness)),
    }
  }
  const publish = () => { if (!destroyed) listeners.forEach((listener) => listener(snapshot())) }
  const unsubscribe = library.subscribe(publish)
  const act = async (action: () => Promise<void>): Promise<OfflineRecordingRemovalResult> => {
    if (destroyed) return { status: 'skipped', errorMessage: null }
    actionError = null
    actionRecordingId = getRecording()?.id ?? null
    try { await action(); return { status: 'completed', errorMessage: null } }
    catch (error) {
      actionError = error instanceof Error ? error.message : 'Recording operation failed.'
      return { status: 'failed', errorMessage: actionError }
    } finally { publish() }
  }
  const current = (expectedId?: string | null) => {
    if (expectedId !== undefined && getRecording()?.id !== expectedId) return null
    return descriptor()
  }
  const remove = async (keys: readonly string[]) => {
    const result = await act(() => library.remove(keys))
    if (result.status === 'completed' && library.snapshot().entries.some((entry) => keys.includes(entry.key) && entry.phase === 'removal-pending')) {
      return { status: 'pending' as const, errorMessage: null }
    }
    return result
  }
  const removalKeys = () => library.snapshot().entries.filter((entry) =>
    library.snapshot().inventory.some((asset) => recordingAssetKey(asset) === entry.key) ||
    ['queued', 'downloading', 'verifying', 'removal-pending'].includes(entry.phase)
  ).map((entry) => entry.key)
  return {
    getSnapshot: snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => { listeners.delete(listener) } },
    async refresh() { await act(() => library.refresh()) },
    async download(expectedId) {
      await act(async () => {
        const asset = current(expectedId)
        if (asset) await library.enqueue([recordingAssetKey(asset)])
      })
    },
    async remove(expectedId) {
      const asset = current(expectedId)
      if (!asset) return { status: 'skipped', errorMessage: null }
      return remove([recordingAssetKey(asset)])
    },
    async removeOthers(expectedId) {
      const asset = current(expectedId)
      if (!asset) return { status: 'skipped', errorMessage: null }
      const key = recordingAssetKey(asset)
      return remove(removalKeys().filter((candidate) => candidate !== key))
    },
    async removeAll() {
      const result = await act(() => library.refresh())
      return result.status === 'completed' ? remove(removalKeys()) : result
    },
    destroy() { destroyed = true; listeners.clear(); unsubscribe() },
  }
}
