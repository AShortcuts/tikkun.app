import type { CalendarSettings } from '../calendar-settings.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type createParshaPicker from '../components/ParshaPicker.ts'
import PageNotFoundPage from '../components/PageNotFoundPage.ts'
import { mountCueAnalyticsRoute } from '../components/cue-analytics-route.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import { ScrollViewModel } from '../view-model/scroll-view-model.ts'
import {
  canonicalReaderUrl,
  generateAboutUrl,
  parseUrl,
  type AppRoute,
} from '../view-model/navigation/url-parser.ts'
import type { ReaderShell } from './reader-shell.ts'

export const INITIAL_READER_TITLE = 'בראשית'

const DEFAULT_READER_HASH = '#/next'
const OPTIONAL_ROUTE_TITLE = 'תיקון קוראים'

export interface ReaderRouteRendering {
  readonly ready: Promise<unknown>
  readonly complete: Promise<unknown>
  isCurrent(): boolean
  getMountedPageNode(pageNumber: number): HTMLElement | null
}

export interface ReaderRouteHost {
  renderReader(
    model: ScrollViewModel
  ): ReaderRouteRendering
  leaveReader(): void
  readerRouteChanged(hash: string): void
  readerReady(): void
  preparePicker(): void
  pickerChanged(open: boolean): void
  pickerLoadFailed(error: unknown): void
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
  start(): void
  navigate(
    hash: string,
    options?: { saveReadingAfterRender?: boolean }
  ): void
  toggleAbout(): void
  togglePicker(): void
  closePicker(): void
  setTitle(title: string): void
  snapshot(): ReaderRouteSnapshot
}

export interface ReaderRouteOptions {
  document: Document
  view: Window
  shell: ReaderShell
  host: ReaderRouteHost
  createGenerator(): LeiningGenerator
  getCalendarSettings(): CalendarSettings
  updateCalendarSettings(settings: CalendarSettings): void
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
  const optionalView = requiredElement<HTMLElement>(
    document,
    '[data-target-id="about-view"]'
  )
  const readerShell = requiredElement<HTMLElement>(
    document,
    '[data-target-id="reader-shell"]'
  )

  let started = false
  let optionalRouteController: AbortController | null = null
  let picker: ReturnType<typeof createParshaPicker> | null = null
  let pickerLoading = false
  let pickerRequestGeneration = 0
  let pickerModulePromise: Promise<ParshaPickerModule> | null = null
  let pickerReturnView: 'not-found' | null = null
  let activeRendering: ReaderRouteRendering | null = null
  let currentReaderHash: string | null = null
  let lastReaderHash = DEFAULT_READER_HASH
  let currentTitle = INITIAL_READER_TITLE
  let saveReadingAfterRender = false

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
    const restoreNotFound =
      pickerReturnView === 'not-found' &&
      parseCurrentRoute()?.view === 'not-found'
    pickerRequestGeneration += 1
    pickerLoading = false
    pickerReturnView = null
    destroyPicker()
    shell.setPickerOpen(false)
    host.pickerChanged(false)
    if (restoreNotFound) shell.setView('optional')
  }

  const navigate = (
    hash: string,
    navigationOptions: { saveReadingAfterRender?: boolean } = {}
  ) => {
    if (navigationOptions.saveReadingAfterRender) {
      saveReadingAfterRender = true
      host.dismissLastReadingPrompt()
    }

    if (view.location.hash === hash) {
      const route = parseHash(hash)
      if (route) renderRoute(route)
      return
    }
    view.location.hash = hash
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
    shell.setPickerOpen(false)
    host.pickerChanged(false)
    if (restoreNotFound) shell.setView('optional')
  }

  const openPicker = (returnView: 'not-found' | null = null) => {
    destroyPicker()
    const requestGeneration = ++pickerRequestGeneration
    pickerLoading = true
    pickerReturnView = returnView
    host.preparePicker()

    void loadPickerModule()
      .then(({ default: createPicker }) => {
        if (
          scope.signal.aborted ||
          requestGeneration !== pickerRequestGeneration ||
          !pickerLoading
        ) {
          return
        }

        const nextPicker = createPicker(options.createGenerator(), {
          calendarSettings: options.getCalendarSettings(),
          onCalendarSettingsChange: (settings) => {
            options.updateCalendarSettings(settings)
            if (!picker) return
            const nextReturnView = pickerReturnView
            closePicker()
            openPicker(nextReturnView)
          },
          navigate: (hash) => {
            navigate(hash, { saveReadingAfterRender: true })
          },
        })

        try {
          readerShell.appendChild(nextPicker.node)
          nextPicker.onMount()
          picker = nextPicker
          pickerLoading = false
          if (pickerReturnView === 'not-found') shell.setView('reader')
          shell.setPickerOpen(true)
          host.pickerChanged(true)
        } catch (error) {
          nextPicker.destroy()
          if (requestGeneration !== pickerRequestGeneration) return
          pickerLoading = false
          restoreViewAfterPickerFailure()
          host.pickerLoadFailed(error)
        }
      })
      .catch((error: unknown) => {
        if (
          scope.signal.aborted ||
          requestGeneration !== pickerRequestGeneration
        ) {
          return
        }
        pickerLoading = false
        restoreViewAfterPickerFailure()
        host.pickerLoadFailed(error)
      })
  }

  const togglePicker = () => {
    const route = parseCurrentRoute()
    const isRenderedReaderView = Boolean(
      activeRendering?.isCurrent() && shell.isReaderVisible()
    )

    if (route?.view !== 'reader' && !isRenderedReaderView) {
      navigate(lastReaderHash)
      return
    }

    if (picker || pickerLoading) closePicker()
    else openPicker()
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
        openPicker('not-found')
      },
      { signal: scope.signal }
    )
    setTitle(OPTIONAL_ROUTE_TITLE)
  }

  const renderOptionalRoute = (route: Extract<AppRoute, {
    view: 'about' | 'cue-analytics'
  }>) => {
    leaveReader()
    shell.setView('optional')
    optionalView.innerHTML =
      route.view === 'about'
        ? '<section class="about-card" aria-busy="true"><h2>Loading About</h2></section>'
        : '<section class="about-card" aria-busy="true"><h2>Loading Cue Analytics</h2></section>'

    const controller = new AbortController()
    optionalRouteController = controller
    if (route.view === 'about') {
      void import('../components/AboutPage.ts')
        .then(({ default: AboutPage }) => {
          if (!controller.signal.aborted) optionalView.innerHTML = AboutPage()
        })
        .catch((error) => {
          if (controller.signal.aborted) return
          console.error('Failed to load the About page', error)
          optionalView.innerHTML =
            '<section class="about-card"><h2>About unavailable</h2><p>Reload this page to try again.</p></section>'
        })
    } else {
      void mountCueAnalyticsRoute(optionalView, {
        signal: controller.signal,
      }).catch((error) => {
        if (controller.signal.aborted) return
        console.error('Failed to load Cue Data analytics', error)
        optionalView.innerHTML =
          '<section class="about-card"><h2>Analytics unavailable</h2><p>Reload this page to try again.</p></section>'
      })
    }
    setTitle(OPTIONAL_ROUTE_TITLE)
  }

  const renderReaderRoute = (route: Extract<AppRoute, { view: 'reader' }>) => {
    abortOptionalRoute()
    shell.setView('reader')
    optionalView.innerHTML = ''

    const nextReaderHash =
      (route.canonicalHash ?? hashPath()) || lastReaderHash
    const canonicalUrl = canonicalReaderUrl(
      new URL(view.location.href),
      nextReaderHash
    )
    if (canonicalUrl.href !== view.location.href) {
      view.history.replaceState(null, '', canonicalUrl)
    }

    const readerRouteChanged =
      currentReaderHash !== null && currentReaderHash !== nextReaderHash
    if (readerRouteChanged) host.readerRouteChanged(nextReaderHash)
    if (readerRouteChanged && (picker || pickerLoading)) closePicker()

    currentReaderHash = nextReaderHash
    lastReaderHash = nextReaderHash

    const rendering = host.renderReader(route.model)
    activeRendering = rendering
    const shouldSaveReading = saveReadingAfterRender
    saveReadingAfterRender = false
    const isCurrent = () =>
      activeRendering === rendering && rendering.isCurrent()

    const readerReady = rendering.ready.then(() => {
      if (!isCurrent()) return
      closePicker()
      host.readerReady()
    })

    void Promise.all([readerReady, rendering.complete])
      .then(() => {
        if (!isCurrent()) return
        if (shouldSaveReading) host.saveReadingPosition()
        revealPageNumber(nextReaderHash, rendering)
      })
      .catch((error) => {
        if (isCurrent()) console.error('Failed to render reader route', error)
      })
  }

  function renderRoute(route: AppRoute) {
    if (route.view === 'not-found') {
      renderNotFound()
      return
    }
    if (route.view === 'about' || route.view === 'cue-analytics') {
      renderOptionalRoute(route)
      return
    }
    renderReaderRoute(route)
  }

  const toggleAbout = () => {
    const currentView = parseCurrentRoute()?.view
    navigate(
      currentView === 'about' || currentView === 'cue-analytics'
        ? lastReaderHash
        : generateAboutUrl()
    )
  }

  const snapshot = (): ReaderRouteSnapshot => ({
    view: parseCurrentRoute()?.view ?? null,
    hashPath: hashPath(),
    currentReaderHash,
    title: currentTitle,
    pickerOpen: Boolean(picker) || pickerLoading,
  })

  const start = () => {
    if (started) throw new Error('Reader Route is already started')
    started = true

    view.addEventListener(
      'hashchange',
      () => {
        const route = parseCurrentRoute()
        if (route) renderRoute(route)
      },
      { signal: scope.signal }
    )

    const initialRoute =
      parseCurrentRoute() ?? {
        view: 'reader' as const,
        canonicalHash: DEFAULT_READER_HASH,
        model: ScrollViewModel.forDate(options.createGenerator(), new Date()),
      }
    renderRoute(initialRoute)
  }

  scope.own(() => {
    abortOptionalRoute()
    activeRendering = null
    pickerRequestGeneration += 1
    pickerLoading = false
    pickerModulePromise = null
    destroyPicker()
  })

  return {
    start,
    navigate,
    toggleAbout,
    togglePicker,
    closePicker,
    setTitle,
    snapshot,
  }
}
