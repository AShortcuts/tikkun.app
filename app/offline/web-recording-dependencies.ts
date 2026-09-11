import type { AudioRecording } from '../audio/types.ts'
import { createBundledRecordingDependencies } from './bundled-recording-dependencies.ts'
import type { RecordingDependencies } from './recording-dependencies.ts'
import type { RecordingDescriptor } from './recording-download.ts'
import { createOfflineWorkerRequestClient, type OfflineWorkerRequestClient } from './worker-request.ts'
import { createCapacityReservations, isCapacityAsset, type CapacityEstimate } from './capacity-reservations.ts'

export function createWebRecordingDependencies({ recordings, baseUrl, serviceWorker, version = import.meta.env.TIKKUN_CONTENT_VERSION,
  requests = createOfflineWorkerRequestClient({ serviceWorker, responseTimeoutMs: 120_000 }),
  cues = createBundledRecordingDependencies({ recordings, baseUrl }),
  capacity,
}: {
  recordings: readonly AudioRecording[]
  baseUrl: string
  serviceWorker: ServiceWorkerContainer | null
  version?: string
  requests?: OfflineWorkerRequestClient
  cues?: RecordingDependencies & { sources(asset: RecordingDescriptor): readonly string[] }
  capacity?: ReturnType<typeof createCapacityReservations>
}): RecordingDependencies & { destroy(): void } {
  const request = async (asset: RecordingDescriptor, prepare: boolean, signal?: AbortSignal) => {
    let ready: boolean | undefined
    if (!version) throw new Error('Offline content version is unavailable. Reload the app and try again.')
    const result = await requests.request({
      type: prepare ? 'PREPARE_RECORDING_DEPENDENCIES' : 'GET_RECORDING_DEPENDENCIES', version, cues: cues.sources(asset),
    }, (value) => {
      if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'RECORDING_DEPENDENCIES' || !('state' in value)) {
        throw new Error('Invalid offline dependency response.')
      }
      if (value.state === 'error') throw new Error('errorMessage' in value && typeof value.errorMessage === 'string' ? value.errorMessage : 'Offline content verification failed.')
      if (!('version' in value) || value.version !== version) throw new Error('Offline content belongs to another app build. Reload the app.')
      if (value.state === 'progress') return false
      if (value.state !== 'ready' && value.state !== 'missing') throw new Error('Invalid offline dependency state.')
      ready = value.state === 'ready'
      return true
    }, { signal, cancelMessage: { type: 'CANCEL_RECORDING_DEPENDENCIES' } })
    signal?.throwIfAborted()
    if (result === 'unavailable' || ready === undefined) throw new Error('Offline content storage is unavailable.')
    return ready
  }
  const measure = async (assets: readonly RecordingDescriptor[], signal: AbortSignal): Promise<CapacityEstimate> => {
      signal.throwIfAborted()
      if (!version) throw new Error('Offline content version is unavailable. Reload the app and try again.')
      let complete = false
      let estimate: CapacityEstimate | undefined
      const result = await requests.request({ type: 'PREFLIGHT_RECORDING_DOWNLOADS', version,
        recordings: assets, cues: [...new Set(assets.flatMap((asset) => cues.sources(asset)))],
      }, (value) => {
        if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'RECORDING_PREFLIGHT' || !('state' in value)) {
          throw new Error('Invalid offline download preflight response.')
        }
        if (value.state === 'error') throw new Error('errorMessage' in value && typeof value.errorMessage === 'string' ? value.errorMessage : 'Offline download preflight failed.')
        if (!('version' in value) || value.version !== version) throw new Error('Offline content belongs to another app build. Reload the app.')
        if (value.state === 'progress') return false
        if (value.state !== 'ready' || !('requiredBytes' in value) || typeof value.requiredBytes !== 'number' ||
          !Number.isSafeInteger(value.requiredBytes) || value.requiredBytes < 0 || !('availableBytes' in value) ||
          (value.availableBytes !== null && (typeof value.availableBytes !== 'number' || !Number.isSafeInteger(value.availableBytes) || value.availableBytes < 0))) {
          throw new Error('Invalid offline download preflight measurements.')
        }
        complete = true
        if ('reservationAssets' in value && Array.isArray(value.reservationAssets) && value.reservationAssets.every(isCapacityAsset)) {
          estimate = { assets: value.reservationAssets, availableBytes: value.availableBytes }
        }
        return true
      }, { signal, cancelMessage: { type: 'CANCEL_RECORDING_DEPENDENCIES' } })
      signal.throwIfAborted()
      if (result === 'unavailable' || !complete) throw new Error('Offline download preflight is unavailable.')
      if (!estimate) throw new Error('The offline worker needs an update before reserving download storage. Reload the app.')
      return estimate
  }
  return {
    preflight: async (assets, signal) => { await measure(assets, signal) },
    reserve: capacity ? (assets, signal) => capacity.reserve(() => measure(assets, signal), signal) : undefined,
    async check(asset) {
      if (!await request(asset, false)) return 'missing'
      // Semantic validation follows durable cache proof, never an import alone.
      return cues.check(asset)
    },
    async prepare(asset, signal) {
      if (!await request(asset, true, signal)) throw new Error('Required offline text or timings are missing.')
      return cues.prepare(asset, signal)
    },
    destroy: () => requests.destroy(),
  }
}
