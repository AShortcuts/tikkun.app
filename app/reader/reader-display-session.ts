import type { LeiningRun } from '../calendar-model/model-types.ts'
import { ScrollDisplay } from '../components/ScrollDisplay.ts'
import type { PageOccurrenceHint } from '../view-model/scroll-view-model.ts'
import type { ScrollViewModel } from '../view-model/scroll-view-model.ts'
import {
  AliyahTargetLocationCache,
  findRenderedLineElement,
  getRenderedLineElements,
  lineIndexFromLocation,
  type AliyahPhysicalLocation,
  type PlaybackAliyahIndex,
} from '../reading/aliyah-dom-target.ts'
import { parseAliyahIndex } from '../reading/aliyah-identity.ts'
import {
  ReaderRuntimeLifecycle,
  type ReaderRuntimeLifetime,
} from '../reading/reader-runtime-lifecycle.ts'
import { ViewportTracker, type ViewportRange } from '../viewport-tracker.ts'
import type { ReaderRouteRendering } from './reader-route.ts'
import {
  createReaderPageWindow,
  type ReaderPageWindowFrameAdapter,
  type ReaderPageWindowNavigationHold,
  type ReaderPageWindowPause,
  type ReaderPageWindowTimerAdapter,
} from './reader-page-window.ts'
import {
  createReaderPresentationScheduler,
  type ReaderPresentationInvalidation,
} from './reader-presentation-scheduler.ts'
import {
  createReaderProgressAnchorIndex,
  type ReaderProgressAnchor,
  type ReaderProgressAnchorInvalidation,
  type ReaderProgressAnchorSnapshot,
} from './reader-progress-anchor-index.ts'

export interface ReaderDisplaySessionLease {
  readonly generation: number
  readonly signal: AbortSignal
  readonly viewModel: ScrollViewModel
  readonly rendered: Promise<HTMLElement>
  readonly scrolled: Promise<void>
  isCurrent(): boolean
  getMountedPageNode(pageNumber: number): HTMLElement | null
  ensurePageMounted(
    pageNumber: number,
    hint?: PageOccurrenceHint,
  ): Promise<HTMLElement | null>
  ensurePageMountedForNavigation(
    pageNumber: number,
    hint?: PageOccurrenceHint,
  ): Promise<HTMLElement | null>
  ensureNextContentMounted(): Promise<Element | null>
}

export interface ReaderDisplaySessionPrewarmItem {
  readonly run: LeiningRun
  readonly aliyahIndex: PlaybackAliyahIndex
}

export interface ReaderDisplaySessionDomTarget {
  readonly element: HTMLElement
  readonly marker: HTMLElement | null
}

export interface ReaderDisplaySession {
  render(viewModel: ScrollViewModel): ReaderRouteRendering
  deactivate(): void
  capture(): ReaderDisplaySessionLease | null
  isReaderReady(): boolean
  waitUntilReaderReady(): Promise<void>
  viewportRange(): ViewportRange | null
  resetViewport(): void
  refreshViewport(): void
  progressSnapshot(): ReaderProgressAnchorSnapshot
  progressAnchorForElement(element: HTMLElement): ReaderProgressAnchor | null
  invalidateProgressAnchors(reason: ReaderProgressAnchorInvalidation): void
  ensureNextProgressAnchorLoaded(currentIndex: number): Promise<void>
  invalidatePresentation(
    ...invalidations: ReaderPresentationInvalidation[]
  ): void
  invalidatePresentationAfterLayout(
    ...invalidations: ReaderPresentationInvalidation[]
  ): void
  onReaderScroll(updateReaderState: () => void): void
  pageRendered(pageRoot: ParentNode, decorate: () => void): void
  pageEvicted(pageNumber: number | null): void
  getRenderedLineForLocation(
    location: AliyahPhysicalLocation,
    lease?: ReaderDisplaySessionLease | null,
    exactPageNode?: HTMLElement,
  ): HTMLElement | null
  ensureAliyahDomTargetRendered(
    runId: string,
    aliyahIndex: PlaybackAliyahIndex,
  ): Promise<ReaderDisplaySessionDomTarget | null>
  pauseEviction(): ReaderPageWindowPause
  holdNavigation(): ReaderPageWindowNavigationHold
  syncAudioPreload(src: string | null): void
  scheduleResourcePrewarm(
    items: readonly ReaderDisplaySessionPrewarmItem[],
    signature: string,
  ): void
  destroy(): void
}

interface ReaderDisplaySessionViewportTracker {
  refresh(): void
  destroy(): void
  on(
    event: 'viewport-updated',
    listener: (range: ViewportRange) => void,
  ): () => void
}

export interface ReaderDisplayBackgroundTaskAdapter {
  request(callback: () => void): number
  delay(callback: () => void, delayMs: number): number
  cancel(handle: number): void
}

export interface ReaderDisplaySessionEffects {
  beforeDisplayReplacement(): void
  resetDisplayResources(): void
  afterDisplayReplacementReset(): void
  displayCreated(display: ScrollDisplay): void
  displayDeactivating(): void
  resolveRun(runId: string): LeiningRun | null
  getPlaybackProtectedPageNumbers(forwardPageCount: number): readonly number[]
  isPlaybackActive(): boolean
  prewarmCueData(item: ReaderDisplaySessionPrewarmItem): Promise<void>
  present(invalidations: readonly ReaderPresentationInvalidation[]): void
  reportError(message: string, error: unknown): void
}

interface ReaderDisplaySessionFactories {
  display(viewModel: ScrollViewModel, root: HTMLElement): ScrollDisplay
  viewport(root: HTMLElement): ReaderDisplaySessionViewportTracker
  audio(): HTMLAudioElement
}

const PLAYBACK_IDLE_BACKGROUND_DELAY_MS = 900

/**
 * Owns one Reader display generation and every cache/scheduler whose validity
 * is tied to that generation. Domain behavior stays in injected effects.
 */
export function createReaderDisplaySession({
  document,
  view,
  root,
  search,
  frame,
  timer,
  background,
  effects,
  factories = defaultFactories(),
}: {
  document: Document
  view: Window
  root: HTMLElement
  search: string
  frame: ReaderPageWindowFrameAdapter
  timer: ReaderPageWindowTimerAdapter
  background: ReaderDisplayBackgroundTaskAdapter
  effects: ReaderDisplaySessionEffects
  factories?: ReaderDisplaySessionFactories
}): ReaderDisplaySession {
  const timing =
    new URLSearchParams(search).get('debugPerformance') === '1'
      ? view.performance
      : undefined
  const lifecycle = new ReaderRuntimeLifecycle()
  let targetLocations = new AliyahTargetLocationCache()
  const markerElementsByKey = new Map<string, HTMLElement>()
  const renderedLinesByLocationKey = new Map<string, HTMLElement>()
  const progressAnchors = createReaderProgressAnchorIndex(root, timing)

  let activeDisplay: ScrollDisplay | null = null
  let activeLifetime: ReaderRuntimeLifetime | null = null
  let latestViewportRange: ViewportRange | null = null
  let progressAnchorLoadPromise: Promise<void> | null = null
  let resourcePrewarmHandle = 0
  let resourcePrewarmSignature: string | null = null
  let currentAudioPreload: HTMLAudioElement | null = null
  let destroyed = false

  const presentation = createReaderPresentationScheduler({
    frame,
    present: ({ invalidations }) => {
      if (!timing) {
        effects.present(invalidations)
        return
      }

      const startedAt = timing.now()
      try {
        effects.present(invalidations)
      } finally {
        timing.measure('tikkun:reader:presentation', {
          start: startedAt,
          end: timing.now(),
          detail: { invalidations },
        })
      }
    },
  })

  let viewportTracker: ReaderDisplaySessionViewportTracker | null = null
  const pageWindow = createReaderPageWindow({
    search,
    frame,
    timer,
    getPlaybackProtectedPageNumbers: (forwardPageCount) =>
      effects.getPlaybackProtectedPageNumbers(forwardPageCount),
    refreshViewport: () => viewportTracker?.refresh(),
    invalidateReaderPosition: () => presentation.invalidate('reader-position'),
  })

  viewportTracker = factories.viewport(root)
  const releaseViewportListener = viewportTracker.on(
    'viewport-updated',
    (range) => {
      if (!activeDisplay) return
      latestViewportRange = range
      presentation.invalidate('viewport-title', 'reader-position')
    },
  )

  function isCurrent(display: ScrollDisplay, lifetime: ReaderRuntimeLifetime) {
    return (
      !destroyed &&
      activeDisplay === display &&
      activeLifetime === lifetime &&
      lifetime.isCurrent()
    )
  }

  function captureFor(
    display: ScrollDisplay,
    lifetime: ReaderRuntimeLifetime,
  ): ReaderDisplaySessionLease {
    const lease: ReaderDisplaySessionLease = {
      generation: lifetime.generation,
      signal: lifetime.signal,
      viewModel: display.viewModel,
      rendered: display.rendered,
      scrolled: display.scrolled,
      isCurrent: () => isCurrent(display, lifetime),
      getMountedPageNode: (pageNumber) =>
        display.getMountedPageNode(pageNumber),
      ensurePageMounted: (pageNumber, hint) =>
        display.ensurePageMounted(pageNumber, hint),
      ensurePageMountedForNavigation: (pageNumber, hint) =>
        display.ensurePageMountedForNavigation(pageNumber, hint),
      ensureNextContentMounted: () => display.ensureNextContentMounted(),
    }
    return Object.freeze(lease)
  }

  function capture() {
    const display = activeDisplay
    const lifetime = activeLifetime
    if (!display || !lifetime || !isCurrent(display, lifetime)) return null
    return captureFor(display, lifetime)
  }

  function clearAudioPreload() {
    currentAudioPreload?.pause()
    currentAudioPreload?.removeAttribute('src')
    currentAudioPreload?.load()
    currentAudioPreload = null
  }

  function cancelResourcePrewarm() {
    if (!resourcePrewarmHandle) return
    background.cancel(resourcePrewarmHandle)
    resourcePrewarmHandle = 0
  }

  function resetOwnedDisplayResources() {
    progressAnchors.invalidate('reader-model')
    targetLocations = new AliyahTargetLocationCache()
    markerElementsByKey.clear()
    renderedLinesByLocationKey.clear()
    effects.resetDisplayResources()
    cancelResourcePrewarm()
    resourcePrewarmSignature = null
    clearAudioPreload()
    progressAnchorLoadPromise = null
  }

  function waitForAnimationFrames(count: number) {
    return new Promise<void>((resolve) => {
      const wait = (remaining: number) => {
        if (remaining <= 0) {
          resolve()
          return
        }
        frame.request(() => wait(remaining - 1))
      }
      wait(count)
    })
  }

  function render(viewModel: ScrollViewModel): ReaderRouteRendering {
    activeDisplay?.destroy()
    latestViewportRange = null
    effects.beforeDisplayReplacement()
    resetOwnedDisplayResources()
    effects.afterDisplayReplacementReset()

    const lifetime = lifecycle.begin()
    activeLifetime = lifetime
    root.style.visibility = 'hidden'
    root.setAttribute('aria-busy', 'true')

    const display = factories.display(viewModel, root)
    activeDisplay = display
    pageWindow.replaceDisplay(display)
    effects.displayCreated(display)

    const ready = display.rendered
    const settled = display.scrolled.then(async () => {
      if (!isCurrent(display, lifetime)) return
      pageWindow.markReady(display)
      await waitForAnimationFrames(2)
      if (!isCurrent(display, lifetime)) return
      root.style.visibility = ''
      root.removeAttribute('aria-busy')
      viewportTracker?.refresh()
    })
    void settled.catch((error) => {
      if (activeDisplay === display) {
        root.style.visibility = ''
        root.removeAttribute('aria-busy')
      }
      effects.reportError('', error)
    })

    return {
      ready,
      complete: settled,
      isCurrent: () => isCurrent(display, lifetime),
      getMountedPageNode: (pageNumber) =>
        display.getMountedPageNode(pageNumber),
    }
  }

  function deactivate() {
    lifecycle.cancel()
    activeLifetime = null
    effects.displayDeactivating()
    activeDisplay?.destroy()
    activeDisplay = null
    pageWindow.replaceDisplay(null)
    resetOwnedDisplayResources()
  }

  function getAliyahTargetKey(runId: string, aliyahIndex: PlaybackAliyahIndex) {
    return `${runId}:${aliyahIndex}`
  }

  function getRenderedLineLocationKey(pageNumber: number, lineIndex: number) {
    return `${pageNumber}:${lineIndex}`
  }

  function getPageNumberFromRenderedLineLocationKey(key: string) {
    const [pageNumber] = key.split(':').map(Number)
    return Number.isInteger(pageNumber) ? pageNumber : null
  }

  function pageNumberFromMountedElement(element: HTMLElement) {
    const pageElement = element.closest<HTMLElement>('[data-page-number]')
    const pageNumber = Number(pageElement?.dataset.pageNumber)
    return Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null
  }

  function aliyahMarkerSelector(
    runId: string,
    aliyahIndex: PlaybackAliyahIndex,
  ) {
    return `[data-aliyah-marker="true"][data-run-id="${runId}"][data-aliyah-index="${aliyahIndex}"]`
  }

  function indexDomTargets(pageRoot: ParentNode) {
    getRenderedLineElements(pageRoot).forEach((line) => {
      const pageNumber = Number(line.dataset.pageNumber)
      const lineIndex = Number(line.dataset.lineIndex)
      if (Number.isFinite(pageNumber) && Number.isFinite(lineIndex)) {
        renderedLinesByLocationKey.set(
          getRenderedLineLocationKey(pageNumber, lineIndex),
          line,
        )
      }
    })

    pageRoot
      .querySelectorAll<HTMLElement>('[data-aliyah-marker="true"]')
      .forEach((marker) => {
        const runId = marker.dataset.runId
        const aliyahIndex = parseAliyahIndex(marker.dataset.aliyahIndex)
        if (!runId || !aliyahIndex) return
        markerElementsByKey.set(getAliyahTargetKey(runId, aliyahIndex), marker)
      })
  }

  function unindexDomTargetsForPage(pageNumber: number) {
    for (const [key] of renderedLinesByLocationKey) {
      if (getPageNumberFromRenderedLineLocationKey(key) === pageNumber) {
        renderedLinesByLocationKey.delete(key)
      }
    }

    for (const [key, marker] of markerElementsByKey) {
      if (
        pageNumberFromMountedElement(marker) === pageNumber ||
        !marker.isConnected
      ) {
        markerElementsByKey.delete(key)
      }
    }
  }

  function findRun(runId: string, lease: ReaderDisplaySessionLease) {
    return (
      lease.viewModel.relevantRuns.find((run) => run.id === runId) ??
      effects.resolveRun(runId)
    )
  }

  async function getAliyahStartLocation(
    runId: string,
    aliyahIndex: PlaybackAliyahIndex,
    requestedLease: ReaderDisplaySessionLease | null = capture(),
  ) {
    if (!requestedLease) return null
    const run = findRun(runId, requestedLease)
    if (!run) return null
    return targetLocations.get(requestedLease.viewModel, run, aliyahIndex)
  }

  function getAliyahMarkerElement(
    runId: string,
    aliyahIndex: PlaybackAliyahIndex,
  ) {
    const cacheKey = getAliyahTargetKey(runId, aliyahIndex)
    const cached = markerElementsByKey.get(cacheKey)
    if (cached?.isConnected) return cached

    const marker = document.querySelector<HTMLElement>(
      aliyahMarkerSelector(runId, aliyahIndex),
    )
    if (marker) markerElementsByKey.set(cacheKey, marker)
    else markerElementsByKey.delete(cacheKey)
    return marker
  }

  function getRenderedLineForLocation(
    location: AliyahPhysicalLocation,
    requestedLease: ReaderDisplaySessionLease | null = capture(),
    exactPageNode?: HTMLElement,
  ) {
    if (!requestedLease) return null
    const lineIndex = lineIndexFromLocation(location)
    if (exactPageNode) return findRenderedLineElement(exactPageNode, lineIndex)
    const cacheKey = getRenderedLineLocationKey(location.pageNumber, lineIndex)
    const cached = renderedLinesByLocationKey.get(cacheKey)
    if (cached?.isConnected) return cached

    const pageNode = requestedLease.getMountedPageNode(location.pageNumber)
    const line = pageNode ? findRenderedLineElement(pageNode, lineIndex) : null
    if (line) renderedLinesByLocationKey.set(cacheKey, line)
    return line
  }

  async function ensureAliyahDomTargetRendered(
    runId: string,
    aliyahIndex: PlaybackAliyahIndex,
  ): Promise<ReaderDisplaySessionDomTarget | null> {
    const lease = capture()
    if (!lease) return null
    let marker = getAliyahMarkerElement(runId, aliyahIndex)
    if (marker) {
      pageWindow.setRailTarget(pageNumberFromMountedElement(marker))
      return { element: marker, marker }
    }

    const location = await getAliyahStartLocation(runId, aliyahIndex, lease)
    if (!lease.isCurrent()) return null
    if (location) {
      pageWindow.setRailTarget(location.pageNumber)
      const mountedPage = await lease.ensurePageMountedForNavigation(
        location.pageNumber,
        { runId },
      )
      if (!lease.isCurrent()) return null
      marker = getAliyahMarkerElement(runId, aliyahIndex)
      if (marker) return { element: marker, marker }

      const line = mountedPage
        ? getRenderedLineForLocation(location, lease, mountedPage)
        : null
      if (line) return { element: line, marker: null }
    }

    while (!marker) {
      if (!lease.isCurrent()) return null
      const loaded = await lease.ensureNextContentMounted()
      if (!lease.isCurrent() || !loaded) return null
      marker = getAliyahMarkerElement(runId, aliyahIndex)
    }
    return { element: marker, marker }
  }

  function ensureNextProgressAnchorLoaded(currentIndex: number) {
    const lease = capture()
    if (!lease) return Promise.resolve()
    if (progressAnchorLoadPromise) return progressAnchorLoadPromise

    const request = (async () => {
      let anchors = progressAnchors.snapshot().anchors
      while (lease.isCurrent() && anchors.length <= currentIndex + 1) {
        const loaded = await lease.ensureNextContentMounted()
        if (!lease.isCurrent() || !loaded) break
        anchors = progressAnchors.snapshot().anchors
      }
    })().finally(() => {
      if (progressAnchorLoadPromise === request) {
        progressAnchorLoadPromise = null
      }
    })
    progressAnchorLoadPromise = request
    return request
  }

  function syncAudioPreload(src: string | null) {
    const absoluteSrc = src ? new URL(src, view.location.href).href : null
    if (currentAudioPreload?.src === absoluteSrc) return

    clearAudioPreload()
    if (!src) return

    const preload = factories.audio()
    preload.preload = 'metadata'
    preload.src = src
    preload.load()
    currentAudioPreload = preload
  }

  function scheduleResourcePrewarm(
    items: readonly ReaderDisplaySessionPrewarmItem[],
    signature: string,
  ) {
    const lease = capture()
    if (!lease) return
    if (signature === resourcePrewarmSignature) return
    resourcePrewarmSignature = signature
    cancelResourcePrewarm()

    let index = 0
    const prefetchedPages = new Set<string>()
    const prewarmNext = () => {
      resourcePrewarmHandle = 0
      if (!lease.isCurrent() || signature !== resourcePrewarmSignature) return

      if (effects.isPlaybackActive()) {
        resourcePrewarmHandle = background.delay(
          prewarmNext,
          PLAYBACK_IDLE_BACKGROUND_DELAY_MS,
        )
        return
      }

      const item = items[index]
      if (!item) return
      index += 1

      const prewarmPromise = (async () => {
        const location = await targetLocations.get(
          lease.viewModel,
          item.run,
          item.aliyahIndex,
        )
        const prefetchKey = location
          ? `${item.run.id}:${location.pageNumber}`
          : null
        if (
          location &&
          prefetchKey &&
          !prefetchedPages.has(prefetchKey) &&
          lease.isCurrent()
        ) {
          prefetchedPages.add(prefetchKey)
          await lease.viewModel.fetchPageByPageNumber(location.pageNumber, {
            runId: item.run.id,
          })
        }
        if (!lease.isCurrent()) return
        await effects.prewarmCueData(item)
      })()

      void prewarmPromise
        .catch((error) => {
          effects.reportError('Failed to prewarm aliyah resources', error)
        })
        .finally(() => {
          if (
            index < items.length &&
            lease.isCurrent() &&
            signature === resourcePrewarmSignature
          ) {
            resourcePrewarmHandle = background.request(prewarmNext)
          }
        })
    }

    void lease.scrolled.then(() => {
      if (!lease.isCurrent() || signature !== resourcePrewarmSignature) return
      resourcePrewarmHandle = background.request(prewarmNext)
    })
  }

  const session: ReaderDisplaySession = {
    render,
    deactivate,
    capture,
    isReaderReady: () => capture() !== null,
    async waitUntilReaderReady() {
      const lease = capture()
      if (!lease) return
      await lease.rendered
      await lease.scrolled
    },
    viewportRange: () => latestViewportRange,
    resetViewport() {
      latestViewportRange = null
    },
    refreshViewport() {
      viewportTracker?.refresh()
    },
    progressSnapshot: () => progressAnchors.snapshot(),
    progressAnchorForElement: (element) =>
      progressAnchors.anchorForElement(element),
    invalidateProgressAnchors: (reason) => progressAnchors.invalidate(reason),
    ensureNextProgressAnchorLoaded,
    invalidatePresentation: (...invalidations) =>
      presentation.invalidate(...invalidations),
    invalidatePresentationAfterLayout: (...invalidations) =>
      presentation.invalidateAfterLayout(...invalidations),
    onReaderScroll(updateReaderState) {
      updateReaderState()
      presentation.invalidate('reader-position')
      pageWindow.onReaderScroll()
    },
    pageRendered(pageRoot, decorate) {
      timing?.mark('tikkun:reader:page-rendered', {
        detail: { generation: activeLifetime?.generation ?? null },
      })
      indexDomTargets(pageRoot)
      decorate()
      progressAnchors.invalidate('page-rendered')
      pageWindow.afterPageRendered()
      presentation.invalidateAfterLayout('reader-position')
    },
    pageEvicted(pageNumber) {
      timing?.mark('tikkun:reader:page-evicted', {
        detail: {
          generation: activeLifetime?.generation ?? null,
          pageNumber,
        },
      })
      progressAnchors.invalidate('page-evicted')
      presentation.invalidateAfterLayout('reader-position')
      if (pageNumber === null) return
      unindexDomTargetsForPage(pageNumber)
    },
    getRenderedLineForLocation,
    ensureAliyahDomTargetRendered,
    pauseEviction: () => pageWindow.pauseEviction(),
    holdNavigation: () => pageWindow.holdNavigation(),
    syncAudioPreload,
    scheduleResourcePrewarm,
    destroy() {
      if (destroyed) return
      destroyed = true
      lifecycle.cancel()
      activeLifetime = null
      activeDisplay?.destroy()
      activeDisplay = null
      resetOwnedDisplayResources()
      releaseViewportListener()
      viewportTracker?.destroy()
      viewportTracker = null
      latestViewportRange = null
      presentation.destroy()
      progressAnchors.destroy()
      pageWindow.destroy()
    },
  }

  return session
}

function defaultFactories(): ReaderDisplaySessionFactories {
  return {
    display: (viewModel, root) => new ScrollDisplay(viewModel, root),
    viewport: (root) => new ViewportTracker(root),
    audio: () => new Audio(),
  }
}
