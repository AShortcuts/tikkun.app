import type { MountScope } from '../lifecycle/mount.ts'
import type {
  CommandPalette,
  CommandPaletteOptions,
} from './command-palette.ts'

export interface CommandPaletteModule {
  createCommandPalette(
    scope: MountScope,
    options: CommandPaletteOptions
  ): CommandPalette
}

export interface LazyCommandPaletteOptions extends CommandPaletteOptions {
  load?: () => Promise<CommandPaletteModule>
  onLoadError(error: unknown): void
}

export type LazyCommandPalette = CommandPalette

export function createLazyCommandPalette(
  scope: MountScope,
  options: LazyCommandPaletteOptions
): LazyCommandPalette {
  const {
    load = () => import('./command-palette.ts'),
    onLoadError,
    ...paletteOptions
  } = options

  let palette: CommandPalette | null = null
  let modulePromise: Promise<CommandPaletteModule> | null = null
  let loadPromise: Promise<CommandPalette | null> | null = null
  let intentGeneration = 0
  let openRequested = false

  const ensureLoaded = () => {
    if (palette) return Promise.resolve(palette)
    if (loadPromise) return loadPromise

    modulePromise ??= load()
    const request = modulePromise
      .then((module) => {
        if (scope.signal.aborted) return null
        palette = module.createCommandPalette(scope, paletteOptions)
        return palette
      })
      .catch((error: unknown) => {
        modulePromise = null
        if (!scope.signal.aborted) onLoadError(error)
        return null
      })
      .finally(() => {
        if (loadPromise === request) loadPromise = null
      })
    loadPromise = request
    return request
  }

  const open = () => {
    if (scope.signal.aborted) return
    if (palette) {
      palette.open()
      return
    }

    openRequested = true
    const intent = ++intentGeneration
    void ensureLoaded().then((loadedPalette) => {
      if (
        scope.signal.aborted ||
        intent !== intentGeneration ||
        !openRequested
      ) {
        return
      }
      openRequested = false
      loadedPalette?.open()
    })
  }

  const close = () => {
    openRequested = false
    intentGeneration += 1
    palette?.close()
  }

  const toggle = () => {
    if (openRequested || palette?.isOpen()) {
      close()
      return
    }
    open()
  }

  const lazyPalette: LazyCommandPalette = {
    open,
    close,
    toggle,
    isOpen: () => openRequested || (palette?.isOpen() ?? false),
    refresh: () => palette?.refresh(),
  }

  scope.own(() => {
    openRequested = false
    intentGeneration += 1
    palette = null
    loadPromise = null
    modulePromise = null
  })

  return lazyPalette
}
