import { base } from '$app/paths'
import { flushSync, mount, unmount } from 'svelte'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import type { AudioNarrator, AudioRecording } from '../audio/types.ts'
import type { DownloadLibrary } from '../offline/download-library.ts'
import { listMediaReadings } from '../offline/media-readings.ts'
import { createNativeStorageMeter, createWebStorageMeter } from '../offline/storage-metrics.ts'
import { getNativeMedia } from '../platform/native-media.ts'
import MediaPanel from './MediaPanel.svelte'

export interface MediaPanelApi {
  open(options?: { returnFocus?: HTMLElement; tab?: 'media' | 'storage'; narratorId?: string }): void
  close(): void
}

export function createMediaPanel(scope: MountScope, options: {
  document: Document
  generator: LeiningGenerator
  library: DownloadLibrary
  recordings: readonly AudioRecording[]
  narrators: readonly AudioNarrator[]
  narratorId: string
}): MediaPanelApi {
  const readings = listMediaReadings(options.generator, options.recordings)
  const view = options.document.defaultView
  if (!view) throw new Error('Media requires an active window.')
  const target = options.document.createElement('div')
  target.dataset.targetId = 'media-panel-root'
  options.document.body.append(target)
  let api: MediaPanelApi | undefined
  const getApi = () => api
  const component = mount(MediaPanel, { target, props: {
    library: options.library,
    readings,
    recordings: options.recordings,
    narrators: options.narrators,
    initialNarrator: options.narratorId,
    baseUrl: options.document.baseURI,
    meter: options.library.snapshot().location === 'device' ? createNativeStorageMeter(getNativeMedia())
      : createWebStorageMeter({ caches: view.caches, storage: view.navigator.storage, crypto: view.crypto, basePath: base }),
    connect: (connected: MediaPanelApi) => { api = connected },
  } })
  flushSync()
  const connected = getApi()
  if (!connected) { void unmount(component); target.remove(); throw new Error('Media panel did not connect.') }
  scope.own(() => {
    connected.close()
    void unmount(component).then(() => target.remove(), (error: unknown) => console.error('Could not unmount Media', error))
  })
  return connected
}
