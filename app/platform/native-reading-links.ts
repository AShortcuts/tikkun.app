import { isReaderHash } from '../view-model/navigation/reader-hash.ts'

export const NATIVE_READING_LINKS_CONTEXT = Symbol('native-reading-links')

export function readingHashFromNativeUrl(value: string): string | null {
  let url: URL
  try { url = new URL(value) }
  catch { return null }
  const web = url.origin === 'https://tikkunreader.com' && ['/reader/', '/reader'].includes(url.pathname)
  const widget = url.protocol === 'tikkunreader:' && url.hostname === 'reader' && url.pathname === '/' && !url.port
  if ((!web && !widget) || url.username || url.password) return null
  const hash = url.hash.split('?')[0]
  return isReaderHash(hash) ? hash : null
}

type ListenerHandle = { remove(): Promise<void> }
type AppLinks = {
  addListener(event: 'appUrlOpen', listener: (event: { url: string }) => void): Promise<ListenerHandle>
  getLaunchUrl(): Promise<{ url: string } | undefined>
}

export type NativeReadingLinks = ReturnType<typeof createNativeReadingLinks>

export function createNativeReadingLinks(options: {
  loadApp(): Promise<{ app: AppLinks }>
  readLaunchUrl?: boolean
  navigate(hash: string): Promise<void>
  reportError(error: unknown): void
}) {
  let finishReady!: () => void
  const ready = new Promise<void>(resolve => { finishReady = resolve })
  let started = false
  let disposed = false
  let initializing = true
  let queued: string | null = null
  let listener: ListenerHandle | null = null
  let draining: Promise<void> | null = null

  function drain(): Promise<void> {
    if (draining) return draining
    draining = (async () => {
      while (!disposed && queued !== null) {
        const hash = readingHashFromNativeUrl(queued)
        queued = null
        if (!hash) {
          options.reportError(new Error('This link is not a supported Tikkun reading.'))
          continue
        }
        try { await options.navigate(hash) }
        catch (error) { if (!disposed) options.reportError(error) }
      }
    })().finally(() => {
      draining = null
      if (!disposed && queued !== null) return drain()
    })
    return draining
  }

  async function removeListener(handle: ListenerHandle) {
    try { await handle.remove() }
    catch (error) { options.reportError(error) }
  }

  async function start() {
    if (started || disposed) return ready
    started = true
    try {
      const { app } = await options.loadApp()
      if (disposed) return
      listener = await app.addListener('appUrlOpen', ({ url }) => {
        if (disposed) return
        queued = url
        if (!initializing) void drain()
      })
      if (disposed) {
        await removeListener(listener)
        listener = null
        return
      }
      // Subscribe first: a newer open event must beat the launch URL response.
      const launch = options.readLaunchUrl === false ? undefined : await app.getLaunchUrl()
      queued ??= launch?.url ?? null
    } catch (error) {
      if (!disposed) options.reportError(error)
    } finally {
      initializing = false
      await drain()
      finishReady()
    }
  }

  function destroy() {
    disposed = true
    queued = null
    if (listener) {
      void removeListener(listener)
      listener = null
    }
    finishReady()
  }

  return { ready, start, destroy }
}
