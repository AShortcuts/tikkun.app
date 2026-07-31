import type { MountScope } from '../lifecycle/mount.ts'
import type {
  ReaderSettings,
  ReaderSettingsOptions,
} from './reader-settings.ts'

export interface ReaderSettingsModule {
  createReaderSettings(
    scope: MountScope,
    options: ReaderSettingsOptions
  ): ReaderSettings
}

export interface LazyReaderSettingsOptions extends ReaderSettingsOptions {
  load?: () => Promise<ReaderSettingsModule>
  onLoadError(error: unknown): void
}

export type LazyReaderSettings = ReaderSettings

export function createLazyReaderSettings(
  scope: MountScope,
  options: LazyReaderSettingsOptions
): LazyReaderSettings {
  const {
    load = () => import('./reader-settings.ts'),
    onLoadError,
    ...settingsOptions
  } = options

  const toggle =
    settingsOptions.document.querySelector<HTMLButtonElement>(
      '[data-target-id="settings-toggle"]'
    )
  if (!toggle) {
    throw new Error(
      'Lazy Reader Settings requires [data-target-id="settings-toggle"]'
    )
  }

  let settings: ReaderSettings | null = null
  let modulePromise: Promise<ReaderSettingsModule> | null = null
  let loadPromise: Promise<ReaderSettings | null> | null = null
  let pendingOpen: { returnFocus?: HTMLElement } | null = null
  let intentGeneration = 0

  const setLoading = (loading: boolean) => {
    if (loading) toggle.setAttribute('aria-busy', 'true')
    else toggle.removeAttribute('aria-busy')
  }

  const ensureLoaded = () => {
    if (settings) return Promise.resolve(settings)
    if (loadPromise) return loadPromise

    modulePromise ??= load()
    const request = modulePromise
      .then((module) => {
        if (scope.signal.aborted) return null
        settings = module.createReaderSettings(scope, settingsOptions)
        return settings
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

  const open = (openOptions: { returnFocus?: HTMLElement } = {}) => {
    if (scope.signal.aborted) return
    if (settings) {
      settings.open(openOptions)
      return
    }

    pendingOpen = openOptions
    setLoading(true)
    const intent = ++intentGeneration
    void ensureLoaded().then((loadedSettings) => {
      if (
        scope.signal.aborted ||
        intent !== intentGeneration ||
        pendingOpen === null
      ) {
        return
      }
      const nextOpen = pendingOpen
      pendingOpen = null
      setLoading(false)
      loadedSettings?.open(nextOpen)
    })
  }

  const close = (closeOptions?: { restoreFocus?: boolean }) => {
    const canceledPendingOpen = pendingOpen !== null
    pendingOpen = null
    intentGeneration += 1
    setLoading(false)
    return settings?.close(closeOptions) ?? canceledPendingOpen
  }

  const lazySettings: LazyReaderSettings = {
    open,
    close,
    sync: () => settings?.sync(),
  }

  toggle.addEventListener(
    'click',
    () => {
      if (pendingOpen !== null) {
        close()
        return
      }
      if (settings?.close()) return
      open({ returnFocus: toggle })
    },
    { signal: scope.signal }
  )

  scope.own(() => {
    pendingOpen = null
    intentGeneration += 1
    setLoading(false)
    settings = null
    loadPromise = null
    modulePromise = null
  })

  return lazySettings
}
