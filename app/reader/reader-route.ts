import type { CalendarSettings } from '../calendar-settings.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type createParshaPicker from '../components/ParshaPicker.ts'
import PageNotFoundPage from '../components/PageNotFoundPage.ts'
import { mountCueAnalyticsRoute } from '../components/cue-analytics-route.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import type { NavigationAction } from '../navigation/actions.ts'
import type { LastReading } from '../reading/last-reading.ts'
import { ScrollViewModel } from '../view-model/scroll-view-model.ts'
import { preserveSemanticParshaRoute } from '../view-model/navigation/reader-hash.ts'
import {
  parseUrl,
  type AppRoute,
} from '../view-model/navigation/url-parser.ts'
import type { ReaderShell } from './reader-shell.ts'
import { updateReaderAppBanner } from '../platform/smart-app-banner.ts'
import { createArrivalCue } from './arrival-cue.ts'
import { isNativeApp } from '../platform/native.ts'
import type { ReaderSwipeDestination } from './reader-swipe-back.ts'
import type { AliyahNavigationTarget } from '../reading/aliyah-navigation/model.ts'

export const INITIAL_READER_TITLE = 'תיקון קוראים'

export function formatTopBarTitle(title: string | undefined) {
  return title?.replace(/^פרשת /, '') ?? INITIAL_READER_TITLE
}

const DEFAULT_READER_HASH = '#/next'
const OPTIONAL_ROUTE_TITLE = 'תיקון קוראים'

export interface ReaderRouteRendering {
  readonly ready: Promise<unknown>
  readonly complete: Promise<unknown>
  failureHandled?(): boolean
  isCurrent(): boolean
  getMountedPageNode(pageNumber: number): HTMLElement | null
}

export interface ReaderRouteHost {
  renderReader(
    model: ScrollViewModel,
    context?: { hash: string; aliyahTarget?: AliyahNavigationTarget },
  ): ReaderRouteRendering
  leaveReader(): void
  openAbout(): void
  readerRouteChanged(hash: string): void
  readerReady(): void
  preparePicker(): void
  pickerChanged(open: boolean): void
  pickerLoadFailed(error: unknown): void
  captureReadingPosition(): LastReading | null
  showReturnToPreviousReading(lastReading: LastReading): void
  dismissLastReadingPrompt(): void
  saveReadingPosition(): void
}

export interface ReaderRouteSnapshot {
  readonly view: AppRoute['view'] | null
  readonly hashPath: string
  readonly currentReaderHash: string | null
  readonly title: string
  readonly pickerOpen: boolean
}

export interface ReaderRoute {
  start(launch?: { resumeHash: string | null }): Promise<void>
  navigate(
    hash: string,
    options?: {
      saveReadingAfterRender?: boolean
      offerReturnToPreviousReading?: boolean
    }
  ): void
  navigateAndWait(hash: string): Promise<boolean>
  syncScrolledReading(hash: string): boolean
  toggleAbout(options?: PickerOpenOptions): void
  togglePicker(options?: PickerOpenOptions): void
  preparePickerSwipe(): Promise<ReaderSwipeDestination | null>
  focusPickerSearch(): boolean
  refreshPickerSearch(): void
  closePicker(): void
  setTitle(title: string): void
  snapshot(): ReaderRouteSnapshot
}

export interface PickerOpenOptions {
  animate?: boolean
  focusSearch?: boolean
}

export interface ReaderRouteOptions {
  document: Document
  view: Window
  shell: ReaderShell
  host: ReaderRouteHost
  createGenerator(): LeiningGenerator
  getCalendarSettings(): CalendarSettings
  updateCalendarSettings(settings: CalendarSettings): void
  getSearchActions?(): NavigationAction[]
  isBookmarkAction?(action: NavigationAction): boolean
  formatSearchBadge?(label: string): string
  loadParshaPicker?: () => Promise<ParshaPickerModule>
}

export interface ParshaPickerModule {
  default: typeof createParshaPicker
}

function requiredElement<T extends Element>(
  document: Document,
  selector: string
): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Reader Route requires ${selector}`)
  return element
}

function pageNumberFromPageRouteHash(hash: string | null) {
  if (!hash) return null
  const [, page] = hash.match(/^#\/(?:torah|esther)\/page\/(\d+)$/) ?? []
  if (!page) return null
  const pageNumber = Number(page)
  return Number.isInteger(pageNumber) ? pageNumber : null
}

export function createReaderRoute(
  scope: MountScope,
  options: ReaderRouteOptions
): ReaderRoute {
  const { document, view, shell, host } = options
  const arrivalCue = createArrivalCue(scope, document, view)
  const optionalView = requiredElement<HTMLElement>(
    document,
    '[data-target-id="about-view"]'
  )
  const readerShell = requiredElement<HTMLElement>(
    document,
    '[data-target-id="reader-shell"]'
  )

  let started = false
  let startup: {
    resolve(): void
    reject(error: unknown): void
  } | null = null
  const finishStartup = () => {
    startup?.resolve()
    startup = null
  }
  let optionalRouteController: AbortController | null = null
  let picker: ReturnType<typeof createParshaPicker> | null = null
  let pickerLoading = false
  let pickerRequestGeneration = 0
  let pickerModulePromise: Promise<ParshaPickerModule> | null = null
  let pickerFocusSearchPending = false
  let pickerReturnView: 'not-found' | null = null
  let activeRendering: ReaderRouteRendering | null = null
  let navigationWaitRevision = 0
  let currentReaderHash: string | null = null
  let lastReaderHash = DEFAULT_READER_HASH
  let currentTitle = INITIAL_READER_TITLE
  let saveReadingAfterRender = false
  let returnReadingAfterRender: LastReading | null = null
  let pickerReturnReading: LastReading | null = null
  let pickerReturnFocus: HTMLElement | null = null

  const hashPath = (hash = view.location.hash) => hash.split('?', 1)[0]
  const parseHash = (hash: string) =>
    parseUrl(options.createGenerator(), hashPath(hash).replace(/^#/, ''))
  const parseCurrentRoute = () => parseHash(view.location.hash)

  const setTitle = (title: string) => {
    currentTitle = title
    shell.setTitle(title)
  }

  const abortOptionalRoute = () => {
    optionalRouteController?.abort()
    optionalRouteController = null
  }

  const destroyPicker = () => {
    picker?.destroy()
    picker = null
  }

  const closePicker = () => {
    const hadPicker = Boolean(picker) || pickerLoading
    const returnFocus = pickerReturnFocus
    const restoreNotFound =
      pickerReturnView === 'not-found' &&
      parseCurrentRoute()?.view === 'not-found'
    pickerRequestGeneration += 1
    pickerLoading = false
    pickerReturnView = null
    pickerReturnReading = null
    pickerReturnFocus = null
    pickerFocusSearchPending = false
    destroyPicker()
    shell.setPickerOpen(false)
    host.pickerChanged(false)
    if (restoreNotFound) shell.setView('optional')
    if (hadPicker) {
      returnFocus?.focus({ preventScroll: true })
      if (document.activeElement !== returnFocus) shell.focusTitle()
    }
  }

  const navigate = (
    hash: string,
    navigationOptions: {
      saveReadingAfterRender?: boolean
      offerReturnToPreviousReading?: boolean
    } = {}
  ) => {
    returnReadingAfterRender = navigationOptions.offerReturnToPreviousReading
      ? pickerReturnReading ?? host.captureReadingPosition()
      : null
    if (navigationOptions.saveReadingAfterRender) {
      saveReadingAfterRender = true
      host.dismissLastReadingPrompt()
    }
    if (picker || pickerLoading) closePicker()

    if (view.location.hash === hash) {
      const route = parseHash(hash)
      if (route) renderRoute(route)
      return
    }
    view.location.hash = hash
  }

  const navigateAndWait = async (hash: string) => {
    if (scope.signal.aborted) return false
    const revision = ++navigationWaitRevision
    const requested = parseHash(hash)
    if (requested?.view !== 'reader') throw new Error('The requested reading is unavailable.')
    const expectedHash = requested.canonicalHash ?? hashPath(hash)
    if (view.location.hash !== hash) {
      // The route's hashchange listener is registered first and installs the
      // current rendering before this listener releases the navigation wait.
      await new Promise<void>((resolve) => {
        const settled = (event: Event) => {
          if (obsoleteHashChange(event)) return
          view.removeEventListener('hashchange', settled)
          scope.signal.removeEventListener('abort', settled)
          resolve()
        }
        view.addEventListener('hashchange', settled)
        scope.signal.addEventListener('abort', settled, { once: true })
        navigate(hash)
      })
    } else {
      navigate(hash)
    }
    const rendering = activeRendering
    if (scope.signal.aborted || revision !== navigationWaitRevision || !rendering || currentReaderHash !== expectedHash) return false
    try {
      await rendering.complete
    } catch (error) {
      if (activeRendering !== rendering || !rendering.isCurrent() || rendering.failureHandled?.()) return false
      throw error
    }
    return !scope.signal.aborted && revision === navigationWaitRevision && activeRendering === rendering && rendering.isCurrent()
  }

  function obsoleteHashChange(event: Event) {
    return 'newURL' in event && typeof event.newURL === 'string' && event.newURL !== view.location.href
  }

  const syncScrolledReading = (hash: string) => {
    const requestedHash = hashPath(hash)
    if (
      !started ||
      currentReaderHash === null ||
      !shell.isReaderVisible() ||
      !requestedHash
    ) {
      return false
    }
    if (requestedHash === currentReaderHash && requestedHash === hashPath()) {
      return false
    }

    const route = parseHash(requestedHash)
    if (route?.view !== 'reader') return false

    const nextReaderHash = preserveSemanticParshaRoute(
      currentReaderHash,
      route.canonicalHash ?? requestedHash
    )
    if (!nextReaderHash) return false

    const nextUrl = new URL(view.location.href)
    nextUrl.hash = nextReaderHash
    const changed = nextUrl.href !== view.location.href
    if (changed) {
      view.history.replaceState(view.history.state, '', nextUrl)
    }
    updateReaderAppBanner(document, view.location)

    currentReaderHash = nextReaderHash
    lastReaderHash = nextReaderHash
    return changed
  }

  const loadPickerModule = () => {
    pickerModulePromise ??= (
      options.loadParshaPicker ?? (() => import('../components/ParshaPicker.ts'))
    )().catch((error: unknown) => {
      pickerModulePromise = null
      throw error
    })
    return pickerModulePromise
  }

  const restoreViewAfterPickerFailure = () => {
    const restoreNotFound =
      pickerReturnView === 'not-found' &&
      parseCurrentRoute()?.view === 'not-found'
    pickerReturnView = null
    pickerFocusSearchPending = false
    shell.setPickerOpen(false)
    host.pickerChanged(false)
    if (restoreNotFound) shell.setView('optional')
  }

  const openPicker = (
    returnView: 'not-found' | null = null,
    { animate = false, focusSearch = !animate }: PickerOpenOptions = {},
    preview = false
  ) => {
    pickerReturnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    destroyPicker()
    const animateOnOpen = animate
    const requestGeneration = ++pickerRequestGeneration
    pickerLoading = true
    pickerFocusSearchPending = focusSearch
    pickerReturnView = returnView
    pickerReturnReading = host.captureReadingPosition()
    host.preparePicker()

    return loadPickerModule()
      .then(({ default: createPicker }) => {
        if (
          scope.signal.aborted ||
          requestGeneration !== pickerRequestGeneration ||
          !pickerLoading
        ) {
          return null
        }

        const nextPicker = createPicker(options.createGenerator(), {
          calendarSettings: options.getCalendarSettings(),
          animateOnOpen,
          onCalendarSettingsChange: (settings) => {
            options.updateCalendarSettings(settings)
            if (!picker) return
            const nextReturnView = pickerReturnView
            closePicker()
            openPicker(nextReturnView)
          },
          navigate: (hash) => {
            navigate(hash, {
              saveReadingAfterRender: true,
              offerReturnToPreviousReading: true,
            })
          },
          getActions: options.getSearchActions,
          requestClose: closePicker,
          isBookmarkAction: options.isBookmarkAction,
          formatBadge: options.formatSearchBadge,
        })

        try {
          if (preview) {
            nextPicker.node.classList.add('reader-swipe-destination')
            nextPicker.node.inert = true
            nextPicker.node.setAttribute('aria-hidden', 'true')
          }
          readerShell.appendChild(nextPicker.node)
          nextPicker.onMount()
          picker = nextPicker
          pickerLoading = false
          if (preview) return nextPicker
          if (pickerReturnView === 'not-found') shell.setView('reader')
          shell.setPickerOpen(true)
          host.pickerChanged(true)
          const shouldFocusSearch = pickerFocusSearchPending
          pickerFocusSearchPending = false
          if (shouldFocusSearch) nextPicker.focusSearch()
          else nextPicker.node.focus({ preventScroll: true })
          return nextPicker
        } catch (error) {
          nextPicker.destroy()
          if (requestGeneration !== pickerRequestGeneration) return null
          pickerLoading = false
          restoreViewAfterPickerFailure()
          host.pickerLoadFailed(error)
          return null
        }
      })
      .catch((error: unknown) => {
        if (
          scope.signal.aborted ||
          requestGeneration !== pickerRequestGeneration
        ) {
          return null
        }
        pickerLoading = false
        restoreViewAfterPickerFailure()
        host.pickerLoadFailed(error)
        return null
      })
  }

  const preparePickerSwipe = async (): Promise<ReaderSwipeDestination | null> => {
    if (picker || pickerLoading || !shell.isReaderVisible()) return null
    const preview = await openPicker(null, { focusSearch: false }, true)
    if (!preview) return null
    return {
      element: preview.node,
      commit: () => {
        if (picker !== preview) return
        preview.node.classList.remove('reader-swipe-destination')
        preview.node.style.removeProperty('transform')
        preview.node.style.removeProperty('transition')
        preview.node.inert = false
        preview.node.removeAttribute('aria-hidden')
        shell.setPickerOpen(true)
        host.pickerChanged(true)
        preview.node.focus({ preventScroll: true })
      },
      cancel: () => { if (picker === preview) closePicker() },
    }
  }

  const togglePicker = (pickerOptions: PickerOpenOptions = {}) => {
    const route = parseCurrentRoute()
    const isRenderedReaderView = Boolean(
      activeRendering?.isCurrent() && shell.isReaderVisible()
    )

    if (route?.view !== 'reader' && !isRenderedReaderView) {
      navigate(lastReaderHash)
      return
    }

    if (picker || pickerLoading) closePicker()
    else openPicker(null, pickerOptions)
  }

  const focusPickerSearch = () => {
    if (picker) {
      picker.focusSearch()
      return true
    }
    if (!pickerLoading) return false
    pickerFocusSearchPending = true
    return true
  }

  const refreshPickerSearch = () => {
    picker?.refreshSearch()
  }

  const revealPageNumber = (
    hash: string,
    rendering: ReaderRouteRendering
  ) => {
    const pageNumber = pageNumberFromPageRouteHash(hash)
    if (!pageNumber) return

    const marker = rendering
      .getMountedPageNode(pageNumber)
      ?.querySelector<HTMLElement>('.tikkun-page-number')
    if (!marker) return

    marker.classList.remove('mod-route-reveal')
    void marker.offsetWidth
    marker.classList.add('mod-route-reveal')
    view.setTimeout(() => {
      marker.classList.remove('mod-route-reveal')
    }, 1900)
  }

  const leaveReader = () => {
    arrivalCue.clear()
    activeRendering = null
    host.leaveReader()
    abortOptionalRoute()
  }

  const renderNotFound = () => {
    leaveReader()
    closePicker()
    shell.setView('optional')
    optionalView.innerHTML = PageNotFoundPage()
    requiredElement<HTMLButtonElement>(
      document,
      '[data-target-id="open-reading-index"]'
    ).addEventListener(
      'click',
      () => {
        openPicker('not-found', { animate: true })
      },
      { signal: scope.signal }
    )
    setTitle(OPTIONAL_ROUTE_TITLE)
  }

  const renderOptionalRoute = (route: Extract<AppRoute, {
    view: 'about' | 'cue-analytics'
  }>) => {
    leaveReader()
    if (route.view === 'about') {
      host.openAbout()
      return
    }

    shell.setView('optional')
    optionalView.innerHTML =
      '<section class="about-card" aria-busy="true"><h2>Loading Cue Analytics</h2></section>'

    const controller = new AbortController()
    optionalRouteController = controller
    void mountCueAnalyticsRoute(optionalView, {
      signal: controller.signal,
    }).catch((error) => {
      if (controller.signal.aborted) return
      console.error('Failed to load Cue Data analytics', error)
      optionalView.innerHTML =
        '<section class="about-card"><h2>Analytics unavailable</h2><p>Reload this page to try again.</p></section>'
    })
    setTitle(OPTIONAL_ROUTE_TITLE)
  }

  const renderReaderRoute = (
    route: Extract<AppRoute, { view: 'reader' }>,
    previousReading: LastReading | null
  ) => {
    abortOptionalRoute()
    arrivalCue.clear()
    setTitle(formatTopBarTitle(route.model.initialTitle))
    shell.setView('reader')
    optionalView.innerHTML = ''

    const nextReaderHash =
      (route.canonicalHash ?? hashPath()) || lastReaderHash
    const canonicalUrl = new URL(view.location.href)
    canonicalUrl.hash = nextReaderHash
    if (canonicalUrl.href !== view.location.href) {
      view.history.replaceState(null, '', canonicalUrl)
    }
    updateReaderAppBanner(document, view.location)

    const readerRouteChanged =
      currentReaderHash !== null && currentReaderHash !== nextReaderHash
    if (readerRouteChanged) host.readerRouteChanged(nextReaderHash)
    if (readerRouteChanged && (picker || pickerLoading)) closePicker()

    currentReaderHash = nextReaderHash
    lastReaderHash = nextReaderHash

    const rendering = host.renderReader(route.model, {
      hash: nextReaderHash,
      aliyahTarget: route.aliyahTarget,
    })
    activeRendering = rendering
    const shouldSaveReading = saveReadingAfterRender
    saveReadingAfterRender = false
    const isCurrent = () =>
      activeRendering === rendering && rendering.isCurrent()

    const readerReady = rendering.ready.then((line) => {
      if (!isCurrent()) return
      host.readerReady()
      if (previousReading && previousReading.hash !== nextReaderHash) {
        host.showReturnToPreviousReading(previousReading)
      }
      return line
    })

    void Promise.all([readerReady, rendering.complete])
      .then(([line]) => {
        if (!isCurrent()) return
        if (shouldSaveReading) host.saveReadingPosition()
        revealPageNumber(nextReaderHash, rendering)
        if (!pageNumberFromPageRouteHash(nextReaderHash) && line instanceof HTMLElement) {
          arrivalCue.show(line, 'pageNumber' in route.model.initialLocation ? undefined : route.model.initialLocation)
        }
        finishStartup()
      })
      .catch((error) => {
        if (!isCurrent()) return
        console.error('Failed to render reader route', error)
        if (rendering.failureHandled?.()) {
          finishStartup()
          return
        }
        startup?.reject(error)
        startup = null
      })
  }

  function renderRoute(route: AppRoute) {
    const previousReading = returnReadingAfterRender
    returnReadingAfterRender = null
    if (route.view === 'about' && isNativeApp()) {
      navigate(lastReaderHash)
      return
    }
    if (route.view === 'not-found') {
      renderNotFound()
      finishStartup()
      return
    }
    if (route.view === 'about' || route.view === 'cue-analytics') {
      renderOptionalRoute(route)
      finishStartup()
      return
    }
    renderReaderRoute(route, previousReading)
  }

  const toggleAbout = (options: PickerOpenOptions = {}) => {
    if (isNativeApp()) togglePicker({ focusSearch: false, ...options })
    else host.openAbout()
  }

  const snapshot = (): ReaderRouteSnapshot => ({
    view: parseCurrentRoute()?.view ?? null,
    hashPath: hashPath(),
    currentReaderHash,
    title: currentTitle,
    pickerOpen: Boolean(picker) || pickerLoading,
  })

  const start = (launch?: { resumeHash: string | null }) => {
    if (started) throw new Error('Reader Route is already started')
    started = true
    const ready = new Promise<void>((resolve, reject) => {
      startup = { resolve, reject }
    })

    view.addEventListener(
      'hashchange',
      (event) => {
        if (obsoleteHashChange(event)) return
        if (currentReaderHash === hashPath() && activeRendering?.isCurrent() && shell.isReaderVisible()) return
        const route = parseCurrentRoute()
        if (route) renderRoute(route)
        else returnReadingAfterRender = null
      },
      { signal: scope.signal }
    )

    const useLaunch = !view.location.hash && launch !== undefined
    const resumeHash = useLaunch ? launch.resumeHash : null
    const resumeRoute = resumeHash ? parseHash(resumeHash) : null
    const resumedReading = resumeHash && resumeRoute?.view === 'reader'
      ? { ...resumeRoute, canonicalHash: resumeRoute.canonicalHash ?? hashPath(resumeHash) }
      : null
    const initialRoute =
      resumedReading ?? parseCurrentRoute() ?? {
        view: 'reader' as const,
        canonicalHash: DEFAULT_READER_HASH,
        model: ScrollViewModel.forDate(options.createGenerator(), new Date()),
      }
    renderRoute(initialRoute)
    if (useLaunch && !resumedReading) openPicker(null, { focusSearch: false })
    return ready
  }

  scope.own(() => {
    abortOptionalRoute()
    startup = null
    activeRendering = null
    pickerRequestGeneration += 1
    pickerLoading = false
    pickerModulePromise = null
    returnReadingAfterRender = null
    pickerReturnReading = null
    destroyPicker()
  })

  return {
    start,
    navigate,
    navigateAndWait,
    syncScrolledReading,
    toggleAbout,
    togglePicker,
    preparePickerSwipe,
    focusPickerSearch,
    refreshPickerSearch,
    closePicker,
    setTitle,
    snapshot,
  }
}
