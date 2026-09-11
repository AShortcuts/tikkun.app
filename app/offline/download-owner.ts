import type { DownloadLibrary } from './download-library.ts'
import type { RecordingDescriptor } from './recording-download.ts'

export const DOWNLOAD_OWNER_CONTEXT = Symbol('download-owner')
type PlaybackUse = (asset: RecordingDescriptor) => boolean

// Root-layout owned, but initialized only when Reader first needs the library.
// Type-only imports keep platform backends and catalogs out of public routes.
export function createDownloadOwner() {
  let library: DownloadLibrary | undefined
  let destroyed = false
  const playback = new Set<PlaybackUse>()
  const cleanups: (() => void)[] = []
  const refresh = () => {
    if (!library || destroyed || !library.snapshot().supported || library.snapshot().phase === 'idle') return
    void library.refresh().catch((error: unknown) => console.error('Could not refresh recording downloads', error))
  }
  return {
    getLibrary(create: (inUse: PlaybackUse) => DownloadLibrary, events: {
      view: Window
      document: Document
      intentKey: string
    }) {
      if (destroyed) throw new Error('Download owner was destroyed.')
      if (!library) {
        library = create((asset) => [...playback].some((inUse) => inUse(asset)))
        const { view, document, intentKey } = events
        const storage = (event: StorageEvent) => { if (event.key === intentKey || event.key === null) refresh() }
        const visible = () => { if (document.visibilityState === 'visible') refresh() }
        view.addEventListener('focus', refresh)
        view.addEventListener('storage', storage)
        document.addEventListener('visibilitychange', visible)
        cleanups.push(() => {
          view.removeEventListener('focus', refresh)
          view.removeEventListener('storage', storage)
          document.removeEventListener('visibilitychange', visible)
        })
      }
      return library
    },
    protectPlayback(inUse: PlaybackUse) {
      if (destroyed) throw new Error('Download owner was destroyed.')
      // Separate registrations even if callers happen to pass the same predicate.
      const protection: PlaybackUse = (asset) => inUse(asset)
      playback.add(protection)
      return async () => {
        if (!playback.delete(protection) || destroyed) return
        await library?.releasePlayback()
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      cleanups.splice(0).forEach((cleanup) => cleanup())
      playback.clear()
      library?.destroy()
      library = undefined
    },
  }
}

export type DownloadOwner = ReturnType<typeof createDownloadOwner>
