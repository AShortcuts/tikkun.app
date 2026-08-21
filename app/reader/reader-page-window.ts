import {
  applyPageWindowPolicyEviction,
  computePageWindowPolicy,
  type PageWindowPolicyConfig,
} from '../components/page-window-policy.ts'

export interface ReaderPageWindowDisplay {
  readonly root: { readonly clientHeight: number }
  getMountedPageNumbers(): number[]
  getViewportAnchorPageNumber(): number | null
  evictPages(pageNumbers: number[]): number[]
  getEvictedPageNumbersNearViewport(options: { marginPx: number }): number[]
  ensureEvictedPagesMountedNearViewport(options: {
    marginPx: number
  }): Promise<number[]>
}

export interface ReaderPageWindowFrameAdapter {
  request(callback: (timestamp: number) => void): number
  cancel(handle: number): void
}

export interface ReaderPageWindowTimerAdapter {
  set(callback: () => void, delayMs: number): number
  clear(handle: number): void
}

export interface ReaderPageWindowPause {
  release(): void
}

export interface ReaderPageWindowNavigationHold extends ReaderPageWindowPause {
  releaseAfterNavigation(): void
}

export interface ReaderPageWindow {
  replaceDisplay(display: ReaderPageWindowDisplay | null): void
  markReady(display: ReaderPageWindowDisplay): void
  setRailTarget(pageNumber: number | null): void
  pauseEviction(): ReaderPageWindowPause
  holdNavigation(): ReaderPageWindowNavigationHold
  onReaderScroll(): void
  afterPageRendered(): void
  destroy(): void
}

const DEFAULT_PAGE_WINDOW_POLICY_CONFIG: PageWindowPolicyConfig = {
  viewportRadius: 2,
  playbackForwardPageCount: 2,
}
const VIEWPORT_PLACEHOLDER_REMOUNT_MARGIN_RATIO = 2
const NAVIGATION_VIRTUALIZATION_HOLD_MS = 1400

/**
 * Owns the optional page-virtualization session while ScrollDisplay retains
 * page rendering and mount mechanics.
 */
export function createReaderPageWindow({
  search,
  frame,
  timer,
  getPlaybackProtectedPageNumbers,
  refreshViewport,
  invalidateReaderPosition,
  config = DEFAULT_PAGE_WINDOW_POLICY_CONFIG,
}: {
  search: string
  frame: ReaderPageWindowFrameAdapter
  timer: ReaderPageWindowTimerAdapter
  getPlaybackProtectedPageNumbers(
    forwardPageCount: number
  ): readonly number[]
  refreshViewport(): void
  invalidateReaderPosition(): void
  config?: Partial<PageWindowPolicyConfig>
}): ReaderPageWindow {
  const virtualizationEnabled =
    new URLSearchParams(search).get('virtualizePages') === '1'
  const resolvedConfig = computePageWindowPolicy({
    mountedPageNumbers: [],
    config,
  }).config

  let activeDisplay: ReaderPageWindowDisplay | null = null
  let activeDisplayGeneration = 0
  let readyDisplay: ReaderPageWindowDisplay | null = null
  let latestRailTargetPageNumber: number | null = null
  let evictionPauseDepth = 0
  let viewportPlaceholderRemountFrame = 0
  let viewportPolicyTrimFrame = 0
  let viewportScrollRevision = 0
  let pendingViewportPolicyTrim: {
    display: ReaderPageWindowDisplay
    generation: number
    scrollRevision: number
  } | null = null
  let destroyed = false
  const navigationHoldTimers = new Set<number>()

  function isCurrentDisplay(
    display: ReaderPageWindowDisplay,
    generation: number
  ) {
    return (
      !destroyed &&
      activeDisplay === display &&
      activeDisplayGeneration === generation
    )
  }

  function isReady() {
    return Boolean(activeDisplay && readyDisplay === activeDisplay)
  }

  function getPolicySnapshot() {
    const display = activeDisplay
    if (!display) return null

    return computePageWindowPolicy({
      mountedPageNumbers: display.getMountedPageNumbers(),
      viewportPageNumber: display.getViewportAnchorPageNumber(),
      railTargetPageNumber: latestRailTargetPageNumber,
      playbackPageNumbers: [
        ...getPlaybackProtectedPageNumbers(
          resolvedConfig.playbackForwardPageCount
        ),
      ],
      config: resolvedConfig,
    })
  }

  function applyPageVirtualization() {
    const display = activeDisplay
    if (!display || !isReady()) return
    const currentPolicy = getPolicySnapshot()
    if (!currentPolicy) return
    applyPageWindowPolicyEviction({
      enabled: virtualizationEnabled && evictionPauseDepth === 0,
      policy: currentPolicy,
      evictPages: (pageNumbers) => display.evictPages(pageNumbers),
    })
  }

  function acquireEvictionPause() {
    if (destroyed) return () => false
    evictionPauseDepth += 1
    let released = false

    return () => {
      if (released) return false
      released = true
      evictionPauseDepth = Math.max(0, evictionPauseDepth - 1)
      return true
    }
  }

  function pauseEviction(): ReaderPageWindowPause {
    const releasePause = acquireEvictionPause()
    return {
      release() {
        if (
          releasePause() &&
          evictionPauseDepth === 0 &&
          pendingViewportPolicyTrim
        ) {
          schedulePendingViewportPolicyTrim()
        }
      },
    }
  }

  function holdNavigation(): ReaderPageWindowNavigationHold {
    const releasePause = acquireEvictionPause()
    let released = false
    let holdTimer = 0

    const release = () => {
      if (released) return
      released = true
      if (holdTimer) {
        timer.clear(holdTimer)
        navigationHoldTimers.delete(holdTimer)
      }
      if (releasePause() && evictionPauseDepth === 0) {
        applyPageVirtualization()
      }
    }

    return {
      release,
      releaseAfterNavigation() {
        // A scrollend from the gesture that revealed the rail can arrive after
        // navigation starts, so use a bounded hold instead of that shared event.
        const scheduledTimer = timer.set(() => {
          navigationHoldTimers.delete(scheduledTimer)
          release()
        }, NAVIGATION_VIRTUALIZATION_HOLD_MS)
        holdTimer = scheduledTimer
        navigationHoldTimers.add(scheduledTimer)
      },
    }
  }

  function cancelViewportPlaceholderRemount() {
    if (!viewportPlaceholderRemountFrame) return
    frame.cancel(viewportPlaceholderRemountFrame)
    viewportPlaceholderRemountFrame = 0
  }

  function cancelViewportPolicyTrim({
    clearPending = true,
  }: { clearPending?: boolean } = {}) {
    if (clearPending) pendingViewportPolicyTrim = null
    if (!viewportPolicyTrimFrame) return
    frame.cancel(viewportPolicyTrimFrame)
    viewportPolicyTrimFrame = 0
  }

  function schedulePendingViewportPolicyTrim() {
    const pending = pendingViewportPolicyTrim
    if (
      !pending ||
      !isCurrentDisplay(pending.display, pending.generation) ||
      !isReady()
    ) {
      pendingViewportPolicyTrim = null
      return
    }
    if (viewportPolicyTrimFrame) return

    viewportPolicyTrimFrame = frame.request(() => {
      viewportPolicyTrimFrame = 0
      const pending = pendingViewportPolicyTrim
      if (
        !pending ||
        pending.scrollRevision !== viewportScrollRevision ||
        !isCurrentDisplay(pending.display, pending.generation) ||
        !isReady()
      ) {
        pendingViewportPolicyTrim = null
        return
      }
      if (evictionPauseDepth > 0) return
      pendingViewportPolicyTrim = null
      applyPageVirtualization()
    })
  }

  function scheduleViewportPolicyTrim(
    display: ReaderPageWindowDisplay,
    generation: number
  ) {
    if (!isCurrentDisplay(display, generation) || !isReady()) return
    pendingViewportPolicyTrim = {
      display,
      generation,
      scrollRevision: viewportScrollRevision,
    }
    schedulePendingViewportPolicyTrim()
  }

  async function remountEvictedPagesNearViewport() {
    const display = activeDisplay
    const generation = activeDisplayGeneration
    if (!display || !isCurrentDisplay(display, generation)) return []
    const marginPx =
      display.root.clientHeight * VIEWPORT_PLACEHOLDER_REMOUNT_MARGIN_RATIO
    const evictedPages = display.getEvictedPageNumbersNearViewport({ marginPx })
    if (!evictedPages.length) return []

    const pause = pauseEviction()
    let remounted: number[] = []
    try {
      remounted = await display.ensureEvictedPagesMountedNearViewport({ marginPx })
      if (isCurrentDisplay(display, generation)) {
        refreshViewport()
        invalidateReaderPosition()
      }
    } finally {
      pause.release()
    }
    if (remounted.length > 0) {
      scheduleViewportPolicyTrim(display, generation)
    }
    return remounted
  }

  return {
    replaceDisplay(display) {
      if (destroyed) return
      activeDisplay = display
      activeDisplayGeneration += 1
      latestRailTargetPageNumber = null
      readyDisplay = null
      cancelViewportPlaceholderRemount()
      cancelViewportPolicyTrim()
      viewportScrollRevision = 0
    },
    markReady(display) {
      if (destroyed || activeDisplay !== display) return
      readyDisplay = display
    },
    setRailTarget(pageNumber) {
      if (destroyed) return
      latestRailTargetPageNumber = pageNumber
    },
    pauseEviction,
    holdNavigation,
    onReaderScroll() {
      if (destroyed || !isReady()) return
      viewportScrollRevision += 1
      if (pendingViewportPolicyTrim) {
        pendingViewportPolicyTrim = {
          ...pendingViewportPolicyTrim,
          scrollRevision: viewportScrollRevision,
        }
      }
      cancelViewportPolicyTrim({ clearPending: false })
      if (viewportPlaceholderRemountFrame) return
      viewportPlaceholderRemountFrame = frame.request(() => {
        viewportPlaceholderRemountFrame = 0
        void remountEvictedPagesNearViewport()
          .catch((error) => {
            console.error('Failed to remount pages near the reader viewport', error)
          })
          .finally(schedulePendingViewportPolicyTrim)
      })
    },
    afterPageRendered() {
      applyPageVirtualization()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      cancelViewportPlaceholderRemount()
      cancelViewportPolicyTrim()
      navigationHoldTimers.forEach((handle) => timer.clear(handle))
      navigationHoldTimers.clear()
      activeDisplay = null
      readyDisplay = null
      activeDisplayGeneration += 1
      evictionPauseDepth = 0
    },
  }
}
