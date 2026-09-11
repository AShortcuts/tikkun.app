import { getNativeMedia, type NativeMediaPlugin } from '../platform/native-media.ts'
import { descriptorForRecording, type OfflineDownloadRecording } from './recording-download.ts'
import { parseRecordingInventory } from './recording-inventory.ts'
import { recordingAssetKey, type RecordingStorage } from './recording-storage.ts'
import type { DownloadIntentStore } from './download-intent.ts'

export function createNativeRecordingStorage(bridge: NativeMediaPlugin = getNativeMedia()): RecordingStorage {
  let destroyed = false
  return {
    supported: true,
    location: 'device',
    preflight: (assets) => bridge.preflight({ assets }),
    async inventory() {
      const response = await bridge.inventory()
      if (!response || typeof response !== 'object' || !('recordings' in response)) throw new Error('Invalid native media inventory.')
      return parseRecordingInventory({ type: 'RECORDING_LIBRARY', state: 'ready', recordings: response.recordings })
    },
    async download(asset, signal, progress) {
      signal.throwIfAborted()
      if (destroyed) throw new Error('Native media storage was destroyed.')
      const requestId = crypto.randomUUID()
      let failure: unknown
      let cancellation: Promise<void> | undefined
      const cancel = () => {
        cancellation ??= bridge.cancelDownload({ requestId }).catch((error: unknown) => { failure = error })
      }
      const listener = await bridge.addListener('progress', (value) => {
        if (!value || typeof value !== 'object' || !('requestId' in value) || value.requestId !== requestId || signal.aborted) return
        if (!('bytes' in value) || typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > asset.byteLength) {
          failure = new Error('Native media returned invalid progress.'); cancel(); return
        }
        progress(value.bytes)
      })
      try {
        signal.throwIfAborted()
        const request = bridge.download({ requestId, asset })
        signal.addEventListener('abort', cancel, { once: true })
        if (signal.aborted) cancel()
        const response = await request
        await cancellation
        if (failure) throw failure
        signal.throwIfAborted()
        const stored = parseRecordingInventory({ type: 'RECORDING_LIBRARY', state: 'ready', recordings: [response] })[0]
        if (recordingAssetKey(stored) !== recordingAssetKey(asset)) throw new Error('Native recording identity changed during download.')
        return stored
      } catch (error) {
        await cancellation
        if (failure) throw failure
        throw error
      } finally {
        signal.removeEventListener('abort', cancel)
        await listener.remove()
      }
    },
    remove: (asset) => bridge.remove({ asset }),
    destroy() { destroyed = true },
  }
}

export function createNativeDownloadIntent(bridge: NativeMediaPlugin = getNativeMedia()): DownloadIntentStore {
  return {
    async read() {
      const response = await bridge.readIntent()
      if (!response || typeof response !== 'object' || !('keys' in response) || !Array.isArray(response.keys) ||
          !response.keys.every((key): key is string => typeof key === 'string' && key.length > 0) ||
          new Set(response.keys).size !== response.keys.length) throw new Error('Invalid native download queue.')
      return response.keys
    },
    update: (add, remove) => bridge.updateIntent({ add, remove }),
  }
}

export async function resolveNativeRecording(recording: OfflineDownloadRecording, bridge: NativeMediaPlugin = getNativeMedia()): Promise<string> {
  const asset = descriptorForRecording(recording)
  if (!asset) return recording.playSrc
  const response = await bridge.resolve({ asset })
  if (!response || typeof response !== 'object' || !('url' in response)) throw new Error('Invalid native recording location.')
  if (response.url === null) return recording.playSrc
  if (typeof response.url !== 'string') throw new Error('Invalid native recording location.')
  const url = new URL(response.url)
  if (url.protocol !== 'file:' || url.host || url.search || url.hash) throw new Error('Native recording location is not a local file.')
  return response.url
}
