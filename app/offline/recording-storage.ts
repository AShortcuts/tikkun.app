import type { StoredRecording } from './recording-inventory.ts'
import { parseRecordingInventory } from './recording-inventory.ts'
import { parseRecordingDownloadMessage, type RecordingDescriptor } from './recording-download.ts'
import { createOfflineWorkerRequestClient, type OfflineWorkerRequestClient } from './worker-request.ts'
import { protectQueuedRecording } from './queue-protection.ts'

export interface RecordingStorage {
  readonly supported: boolean
  readonly location?: 'browser' | 'device'
  inventory(): Promise<readonly StoredRecording[]>
  // Advisory batch check when the backend can measure its download capacity.
  preflight?(assets: readonly RecordingDescriptor[]): Promise<void>
  protectQueued?(asset: RecordingDescriptor, signal: AbortSignal): Promise<() => Promise<void>>
  download(asset: RecordingDescriptor, signal: AbortSignal, progress: (bytes: number) => void): Promise<StoredRecording>
  remove(asset: RecordingDescriptor): Promise<void>
  destroy(): void
}

export function recordingAssetKey(asset: Pick<StoredRecording, 'url' | 'digest' | 'byteLength'>) {
  return JSON.stringify([asset.url, asset.digest, asset.byteLength])
}

export function resolveRecordingAsset(asset: RecordingDescriptor, baseUrl: string): RecordingDescriptor {
  const url = new URL(asset.url, baseUrl)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash ||
    !asset.audioId || !/^[a-f0-9]{64}$/.test(asset.digest) ||
    !Number.isSafeInteger(asset.byteLength) || asset.byteLength <= 0) {
    throw new Error('Invalid downloadable recording identity.')
  }
  return { ...asset, url: url.href }
}

export function createWebRecordingStorage({
  serviceWorker,
  locks = globalThis.navigator?.locks ?? null,
  requests = createOfflineWorkerRequestClient({ serviceWorker, responseTimeoutMs: 120_000 }),
}: {
  serviceWorker: ServiceWorkerContainer | null
  locks?: LockManager | null
  requests?: OfflineWorkerRequestClient
}): RecordingStorage {
  const requireSupport = (result: string) => {
    if (result === 'unavailable') throw new Error('Offline recording storage is unavailable.')
  }
  return {
    supported: requests.supported,
    async protectQueued(asset, signal) {
      signal.throwIfAborted()
      const registration = await serviceWorker?.getRegistration()
      if (!registration) throw new Error('The offline worker is unavailable for download queue coordination.')
      return protectQueuedRecording(locks, registration.scope, asset.url, signal)
    },
    async inventory() {
      let inventory: readonly StoredRecording[] | undefined
      requireSupport(await requests.request({ type: 'GET_RECORDING_LIBRARY' }, (value) => {
        inventory = parseRecordingInventory(value)
        return true
      }))
      if (!inventory) throw new Error('The worker returned no recording inventory.')
      return inventory
    },
    async download(asset, signal, progress) {
      signal.throwIfAborted()
      let stored = false
      requireSupport(await requests.request({ type: 'DOWNLOAD_RECORDING', recording: asset }, (value) => {
        const message = parseRecordingDownloadMessage(value, asset.audioId)
        if (message.state === 'error') throw new Error(message.errorMessage ?? 'Recording download failed.')
        if (message.totalBytes !== asset.byteLength) throw new Error('Recording size changed during download.')
        progress(message.downloadedBytes)
        stored = message.state === 'complete' && message.exactStored
        return stored
      }, { signal, cancelMessage: { type: 'CANCEL_RECORDING_DOWNLOAD' } }))
      signal.throwIfAborted()
      if (!stored) throw new Error('The recording was not verified after download.')
      return { audioId: asset.audioId, digest: asset.digest, byteLength: asset.byteLength, url: asset.url }
    },
    async remove(asset) {
      let removed = false
      requireSupport(await requests.request({ type: 'REMOVE_RECORDING_DOWNLOAD', recording: asset }, (value) => {
        const message = parseRecordingDownloadMessage(value, asset.audioId)
        if (message.state === 'error') throw new Error(message.errorMessage ?? 'Recording removal failed.')
        removed = message.state === 'idle' && !message.exactStored
        return removed
      }))
      if (!removed) throw new Error('The recording could not be removed.')
    },
    destroy: () => requests.destroy(),
  }
}
