import type { Destroy, MountScope } from '../lifecycle/mount.ts'

export const COMPACT_READER_QUERY = '(max-width: 550px)'

interface ReaderViewportWindow {
  readonly innerWidth: number
  readonly innerHeight: number
  readonly document?: { readonly documentElement: Pick<Element, 'clientWidth' | 'clientHeight'> }
}

/** WebKit's inner dimensions change during pinch zoom; CSS layout dimensions do not. */
export function readerLayoutViewport(view: ReaderViewportWindow) {
  const root = view.document?.documentElement
  return {
    width: root?.clientWidth ?? view.innerWidth,
    height: root?.clientHeight ?? view.innerHeight,
  }
}

export function isMobileReaderViewport(
  view: ReaderViewportWindow
): boolean {
  const { width, height } = readerLayoutViewport(view)
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    Math.min(width, height) <= 550
  )
}

export type ReaderViewportMode = 'compact' | 'wide'

export interface ReaderViewport {
  readonly mode: ReaderViewportMode
  isCompact(): boolean
  onChange(listener: (mode: ReaderViewportMode) => void): Destroy
}

export function createReaderViewport(
  scope: MountScope,
  view: Pick<Window, 'matchMedia'>
): ReaderViewport {
  const mediaQuery = view.matchMedia(COMPACT_READER_QUERY)
  const listeners = new Set<(mode: ReaderViewportMode) => void>()
  let mode: ReaderViewportMode = mediaQuery.matches ? 'compact' : 'wide'

  mediaQuery.addEventListener(
    'change',
    (event) => {
      const nextMode: ReaderViewportMode = event.matches ? 'compact' : 'wide'
      if (nextMode === mode) return
      mode = nextMode
      for (const listener of [...listeners]) listener(mode)
    },
    { signal: scope.signal }
  )

  return {
    get mode() {
      return mode
    },
    isCompact: () => mediaQuery.matches,
    onChange(listener) {
      listeners.add(listener)
      return scope.own(() => listeners.delete(listener))
    },
  }
}
