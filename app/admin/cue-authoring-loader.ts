import { createMount, type MountScope } from '../lifecycle/mount.ts'
import {
  isCueAuthoringToggleShortcut,
  readCueAuthoringAccessState,
} from './access.ts'
import type {
  CueAuthoring,
  createCueAuthoring,
} from './cue-authoring.ts'

export interface CueAuthoringModule {
  createCueAuthoring: typeof createCueAuthoring
}

export interface CueAuthoringLoaderOptions {
  sessionStorage: Storage | null
  load?: () => Promise<CueAuthoringModule>
  mount(scope: MountScope, module: CueAuthoringModule): CueAuthoring
  onMounted(authoring: CueAuthoring): void
  onUnmounted(authoring: CueAuthoring): void
  onLoadError(error: unknown): void
}

export interface CueAuthoringLoader {
  isUnlocked(): boolean
  open(): void
  restoreIfOpen(): void
  handleShortcut(event: KeyboardEvent): boolean
  close(): void
}

export function createCueAuthoringLoader(
  scope: MountScope,
  options: CueAuthoringLoaderOptions
): CueAuthoringLoader {
  const mountFeature = createMount()
  let authoring: CueAuthoring | null = null
  let modulePromise: Promise<CueAuthoringModule> | null = null
  let loadPromise: Promise<CueAuthoring | null> | null = null
  let intentGeneration = 0
  let forceClosed = false

  const ensureLoaded = () => {
    if (authoring) return Promise.resolve(authoring)
    if (loadPromise) return loadPromise

    modulePromise ??= (options.load ?? (() => import('./cue-authoring.ts')))()
    const request = modulePromise
      .then((module) => {
        if (scope.signal.aborted) return null
        let mounted: CueAuthoring | null = null
        const destroy = mountFeature((featureScope) => {
          const feature = options.mount(featureScope, module)
          mounted = feature
          authoring = feature
          options.onMounted(feature)
          featureScope.own(() => {
            options.onUnmounted(feature)
            if (authoring === feature) authoring = null
          })
        })
        scope.own(destroy)
        const feature = mounted as CueAuthoring | null
        feature?.restoreAccessState()
        if (forceClosed) feature?.setVisible(false)
        return feature
      })
      .catch((error: unknown) => {
        modulePromise = null
        options.onLoadError(error)
        return null
      })
      .finally(() => {
        if (loadPromise === request) loadPromise = null
      })
    loadPromise = request
    return request
  }

  const close = () => {
    forceClosed = true
    intentGeneration += 1
    authoring?.setVisible(false)
  }

  const isUnlocked = () => {
    if (authoring) return authoring.isUnlocked()
    try {
      return readCueAuthoringAccessState(options.sessionStorage).unlocked
    } catch (error) {
      options.onLoadError(error)
      return false
    }
  }

  const open = () => {
    if (!isUnlocked()) return
    forceClosed = false
    const intent = ++intentGeneration
    void ensureLoaded().then((feature) => {
      if (!feature || intent !== intentGeneration || forceClosed) return
      feature.setVisible(true)
    })
  }

  const restoreIfOpen = () => {
    try {
      if (!readCueAuthoringAccessState(options.sessionStorage).panelOpen) return
    } catch (error) {
      options.onLoadError(error)
      return
    }
    forceClosed = false
    void ensureLoaded()
  }

  const handleShortcut = (event: KeyboardEvent) => {
    if (authoring) return authoring.handleKeydown(event)
    if (!isCueAuthoringToggleShortcut(event)) return false

    event.preventDefault()
    forceClosed = false
    const intent = ++intentGeneration
    void ensureLoaded().then((feature) => {
      if (!feature || intent !== intentGeneration || forceClosed) return
      feature.handleKeydown(event)
    })
    return true
  }

  scope.own(() => {
    forceClosed = true
    intentGeneration += 1
    authoring = null
    loadPromise = null
    modulePromise = null
  })

  return {
    isUnlocked,
    open,
    restoreIfOpen,
    handleShortcut,
    close,
  }
}
