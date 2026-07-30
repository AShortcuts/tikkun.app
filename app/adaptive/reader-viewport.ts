import type { Destroy, MountScope } from '../lifecycle/mount.ts'

export const COMPACT_READER_QUERY = '(max-width: 550px)'

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
    isCompact: () => mode === 'compact',
    onChange(listener) {
      listeners.add(listener)
      return scope.own(() => listeners.delete(listener))
    },
  }
}
