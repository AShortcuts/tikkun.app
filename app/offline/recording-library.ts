import { listRecordings } from '../audio/library.ts'
import { getWebServiceWorker, isNativeApp } from '../platform/native.ts'
import { createDownloadLibrary } from './download-library.ts'
import { createDownloadIntentStore } from './download-intent.ts'
import { descriptorForRecording, type RecordingDescriptor } from './recording-download.ts'
import { createWebRecordingStorage, resolveRecordingAsset } from './recording-storage.ts'
import { createNativeRecordingStorage, createNativeDownloadIntent } from './native-recording-storage.ts'
import type { RecordingDependencies } from './recording-dependencies.ts'
import { createCapacityReservations } from './capacity-reservations.ts'

export function createRecordingLibrary({ baseUrl, navigator, storage, inUse }: {
  baseUrl: string
  navigator: Navigator
  storage: Storage | null
  inUse: (asset: RecordingDescriptor) => boolean
}) {
  const recordings = listRecordings()
  // Vite development does not ship the production offline worker.
  const serviceWorker = import.meta.env.DEV ? null : getWebServiceWorker(navigator)
  const nativeStorage = import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN && isNativeApp()
  let dependencyOwner: Promise<RecordingDependencies> | undefined
  const recordingDependencies = () => dependencyOwner ??= (nativeStorage
    ? import('./bundled-recording-dependencies.ts')
      .then(({ createBundledRecordingDependencies }) => createBundledRecordingDependencies({ recordings, baseUrl }))
    : import('./web-recording-dependencies.ts')
      .then(({ createWebRecordingDependencies }) => createWebRecordingDependencies({ recordings, baseUrl, serviceWorker,
        capacity: createCapacityReservations(storage, navigator.locks ?? null) })))
    .catch((error: unknown) => { dependencyOwner = undefined; throw error })
  return createDownloadLibrary({
    assets: recordings.flatMap((recording) => {
      const asset = descriptorForRecording(recording)
      return asset ? [resolveRecordingAsset(asset, baseUrl)] : []
    }),
    backend: nativeStorage ? createNativeRecordingStorage() : createWebRecordingStorage({ serviceWorker, locks: navigator.locks ?? null }),
    intent: nativeStorage ? createNativeDownloadIntent() : createDownloadIntentStore(storage, navigator.locks ?? null),
    dependencies: {
      reserve: nativeStorage ? undefined : async (assets, signal) => {
        const owner = await recordingDependencies()
        if (!owner.reserve) throw new Error('Offline capacity reservations are unavailable.')
        return owner.reserve(assets, signal)
      },
      preflight: nativeStorage ? undefined : async (assets, signal) => {
        const owner = await recordingDependencies()
        if (!owner.preflight) throw new Error('Offline download preflight is unavailable.')
        await owner.preflight(assets, signal)
      },
      check: async (asset) => (await recordingDependencies()).check(asset),
      prepare: async (asset, signal) => (await recordingDependencies()).prepare(asset, signal),
      destroy: () => {
        void dependencyOwner?.then((owner) => owner.destroy?.(),
          (error: unknown) => console.error('Offline content initialization failed', error))
      },
    },
    inUse,
  })
}
