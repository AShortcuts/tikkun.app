import { HDate } from '@hebcal/hdate'
import ParshaPicker from './components/ParshaPicker.ts'
import utils from './components/utils.ts'
import { ScrollViewModel } from './view-model/scroll-view-model.ts'
import { LeiningGenerator } from './calendar-model/generator.ts'
import {
  loadCalendarSettings,
  saveCalendarSettings,
  userSettingsFromCalendarSettings,
  type CalendarSettings,
} from './calendar-settings.ts'
import { ScrollDisplay } from './components/ScrollDisplay.ts'
import type { PageLifecycleSnapshot } from './components/page-lifecycle.ts'
import {
  applyPageWindowPolicyEviction,
  computePageWindowPolicy,
  type PageWindowPolicyConfig,
  type PageVirtualizationApplication,
  type PageWindowPolicyResult,
} from './components/page-window-policy.ts'
import {
  createPageVirtualizationMetrics,
  createPageVirtualizationSettings,
  type PageVirtualizationDiagnostics,
} from './components/page-virtualization-debug.ts'
import { ViewportTracker, type ViewportRange } from './viewport-tracker.ts'
import {
  createReaderViewport,
  type ReaderViewport,
} from './adaptive/reader-viewport.ts'
import { TopBarTracker } from './view-model/navigation/top-bar-model.ts'
import {
  createAliyahNavigationActions,
  createNavigationAction,
  createPageNavigationActions,
  type NavigationAction,
} from './navigation/actions.ts'
import {
  createCommandPalette,
  type CommandPalette,
} from './navigation/command-palette.ts'
import {
  holidayLeiningKeywords,
  selectCommandPaletteHolidayRun,
} from './navigation/holiday-actions.ts'
import {
  AppRoute,
  canonicalReaderUrl,
  generateAboutUrl,
  generateCueAnalyticsUrl,
  generatePageUrl,
  parseUrl,
} from './view-model/navigation/url-parser.ts'
import {
  generateParshaUrl,
  getParshaSearchTermsForSlug,
  resolveParshaRun,
} from './view-model/navigation/parsha-routes.ts'
import PageNotFoundPage from './components/PageNotFoundPage.ts'
import { mountCueAnalyticsRoute } from './components/cue-analytics-route.ts'
import { iconMarkup, type IconName } from './components/icons.ts'
import {
  applyReaderPreferences,
  getDefaultReaderPreferences,
  loadReaderPreferences,
  mergeReaderPreferences,
  ReaderPreferences,
  saveReaderPreferences,
  TOKENIZATION_VERSION,
} from './reader-preferences.ts'
import {
  findRecordingForRun,
  getCuesForRecording,
  getCueProgressForRecording,
  getIssuesForRecording,
  listNarrators,
  listRecordings,
  parshaSlugForRun,
} from './audio/library.ts'
import {
  AudioController,
  type ActiveAudioSession,
} from './reading/audio-controller.ts'
import { handleAliyahPermalinkClick } from './reader/aliyah-permalink.ts'
import { HighlightController } from './reading/highlight-controller.ts'
import {
  createAliyahNavigationSnapshot,
  formatAliyahLabel,
  getAliyahNavigationEntriesForRun,
  resolveActiveTargetForRun,
  type AliyahNavigationItem,
  type AliyahNavigationPlayback,
  type AliyahNavigationSnapshot,
  type AliyahNavigationTarget,
} from './reading/aliyah-navigation/model.ts'
import {
  createDesktopAliyahRail,
  type AliyahCueStatus,
  type DesktopAliyahRailAdapter,
} from './reading/aliyah-navigation/desktop-rail.ts'
import {
  getMobileAliyahCapsuleState,
  createMobileAliyahPicker,
  type MobileAliyahPickerAdapter,
} from './reading/aliyah-navigation/mobile-picker.ts'
import {
  collectTokenKeysForExactAliyahRange,
  firstTokenKeyForExactAliyahStart,
} from './reading/aliyah-token-sequence.ts'
import {
  createAliyahStartMarker,
  getAliyahStartMarkerPosition,
  getFirstGraphemeRect,
} from './reading/aliyah-start-marker.ts'
import { isLastIndexedAliyahInRun } from './reading/aliyah-range.ts'
import {
  isActivePlaybackTarget,
} from './reading/playback-session.ts'
import {
  AliyahTargetLocationCache,
  findAliyahInRun,
  findRenderedLineElement,
  getRenderedLineElements,
  lineIndexFromLocation,
  type PlaybackAliyahIndex,
} from './reading/aliyah-dom-target.ts'
import {
  aliyahMembershipsForFocalLine,
  isSameAliyahIdentity,
  parseAliyahIndex,
  resolveActiveAliyahIdentity,
  type AliyahIdentity,
} from './reading/aliyah-identity.ts'
import {
  createPlaybackTimeline,
  formatPlaybackDuration as formatDuration,
  type PlaybackTimeline,
} from './reading/playback-timeline.ts'
import { LatestAction } from './reading/latest-action.ts'
import {
  ReaderRuntimeLifecycle,
  type ReaderRuntimeLifetime,
} from './reading/reader-runtime-lifecycle.ts'
import {
  createRecordingSession,
  type RecordingSession,
} from './reading/recording-session.ts'
import { createMount, type MountScope } from './lifecycle/mount.ts'
import {
  createLastReadingHash,
  LastReading,
  loadEligibleLastReading,
  saveLastReading,
} from './reading/last-reading.ts'
import {
  checkpointFromCue,
  checkpointFromIssue,
  compareCheckpoints,
  type Checkpoint,
} from './reader/checkpoints.ts'
import { formatTokenKey, parseTokenKey } from './reader/token-position.ts'
import {
  createBookmark,
  loadBookmarks,
  saveBookmarks,
  type ReaderBookmark,
} from './reader/bookmarks.ts'
import {
  createReaderSettings,
  type ReaderSettings,
} from './reader/reader-settings.ts'
import {
  createReaderControls,
  type ReaderControls,
  type ReaderControlsState,
} from './reader/reader-controls.ts'
import {
  createLastReadingPrompt,
  type LastReadingPrompt,
} from './reader/last-reading-prompt.ts'
import {
  createOfflineRecordingPrompt,
  type OfflineRecordingPrompt,
} from './reader/offline-recording-prompt.ts'
import {
  getReaderVisibleIssues,
  loadRecordingIssues,
  mergeRecordingIssues,
  recordingIssueReaderLabel,
  type RecordingIssue,
} from './audio/recording-issues.ts'
import {
  createTemporaryShiftToggle,
  createShortcutCommand,
  getShortcutCommand,
  isShortcutEditableTarget,
  type ReaderMode,
  type ShortcutCommand,
} from './reader/shortcuts.ts'
import {
  isParshaAudioRecording,
  type AudioRecording,
} from './audio/types.ts'
import type { ScrollName } from './ref.ts'
import {
  type LeiningInstance,
  type LeiningRun,
} from './calendar-model/model-types.ts'
import { compareRefs } from './calendar-model/ref-utils.ts'
import {
  loadAdminDraft,
  readAdminDraftSummary,
} from './admin/draft-storage.ts'
import { areCueDraftsEquivalent } from './admin/draft-cue-comparison.ts'
import {
  type CueAuthoring,
  type CueAuthoringChange,
} from './admin/cue-authoring.ts'
import {
  createCueAuthoringLoader,
  type CueAuthoringLoader,
} from './admin/cue-authoring-loader.ts'
import {
  applyRecordingModePreferences,
  calculateCaptureRect,
  getRecordingModeConfig,
  recordingModeAliyahLabel,
} from './recording-mode.ts'
import {
  centerElementInScrollRoot,
  getReaderFocalPointScrollTop,
} from './reader-scroll.ts'
import {
  getBrowserStorage,
} from './persistence/persisted-state.ts'

const { whenKey } = utils

const browserLocalStorage = getBrowserStorage('local')
const browserSessionStorage = getBrowserStorage('session')

let calendarSettings = loadCalendarSettings(browserLocalStorage)
const createCalendarGenerator = () =>
  new LeiningGenerator(userSettingsFromCalendarSettings(calendarSettings))
const recordingMode = getRecordingModeConfig()

type AliyahProgressAnchor = {
  line: HTMLElement | null
  label: string
  run: LeiningRun | null
  aliyahIndex: PlaybackAliyahIndex | null
  position: number
}

let display: ScrollDisplay | null = null
const readerRuntimeLifecycle = new ReaderRuntimeLifecycle()
const mountReaderRuntime = createMount()
let readerRuntimeLifetime: ReaderRuntimeLifetime | null = null
let optionalRouteAbortController: AbortController | null = null
let activeParshaPicker: ReturnType<typeof ParshaPicker> | null = null
let persistenceToastTimer: number | null = null
let viewportTrackerGlobal: ViewportTracker | null = null
let latestViewportRange: ViewportRange | null = null
let readerPreferences: ReaderPreferences = getDefaultReaderPreferences()
let lastReaderHash = '#/next'
let currentReaderHash: string | null = null
let progressFrame = 0
let deferredProgressFrame = 0
let aliyahStartMarkerLayoutFrame = 0
let aliyahStartMarkerResizeTimer: number | null = null
let progressAnchorLoadPromise: Promise<void> | null = null
let pendingAliyahRailSelection: {
  runId: string
  aliyahIndex: PlaybackAliyahIndex
  expiresAt: number
  maxExpiresAt: number
} | null = null
let explicitAliyahSelection: AliyahIdentity | null = null
let explicitAliyahSelectionHash: string | null = null
let lastAliyahRailScrollTop: number | null = null
let desktopAliyahRail: DesktopAliyahRailAdapter | null = null
let mobileAliyahPicker: MobileAliyahPickerAdapter | null = null
let readerViewportGlobal: ReaderViewport | null = null
let cueAuthoringGlobal: CueAuthoring | null = null
let cueAuthoringLoaderGlobal: CueAuthoringLoader | null = null
let playbackTimelineGlobal: PlaybackTimeline | null = null
let audioControllerGlobal: AudioController | null = null
let highlightControllerGlobal: HighlightController | null = null
let readerSettingsGlobal: ReaderSettings | null = null
let readerControlsGlobal: ReaderControls | null = null
let lastReadingPromptGlobal: LastReadingPrompt | null = null
let commandPaletteGlobal: CommandPalette | null = null
let offlineRecordingPromptGlobal: OfflineRecordingPrompt | null = null
let recordingSessionGlobal: RecordingSession | null = null
let bookmarks: ReaderBookmark[] = []
let activeRecordingIssues: RecordingIssue[] = []
let currentReaderMode: ReaderMode = recordingMode.enabled ? 'recording' : 'normal'
let shouldSaveLastReadingAfterRouteRender = false
let hasUserScrolledReaderForLastReading = false

function applyHighlightRenderingDebugMode() {
  const highlightMode = new URLSearchParams(location.search).get('highlight')
  if (highlightMode === 'legacy-rectangle') {
    document.documentElement.dataset.highlightRendering = 'legacy-rectangle'
    return
  }

  delete document.documentElement.dataset.highlightRendering
}

applyHighlightRenderingDebugMode()

function getDebugActiveTokenKey() {
  return new URLSearchParams(location.search).get('debugActiveToken')
}

declare global {
  interface Window {
    tikkunReaderDiagnostics?: () => {
      pages: PageLifecycleSnapshot | null
      pageWindowPolicy: PageWindowPolicyResult | null
      pageVirtualization: PageVirtualizationDiagnostics
      caches: {
        aliyahTokenKeys: number
        aliyahTargetLocations: number | null
        aliyahMarkerElements: number
        renderedLines: number
      }
    }
    tikkunReaderVirtualization?: {
      state: () => PageVirtualizationDiagnostics
      enable: () => PageVirtualizationDiagnostics
      disable: () => PageVirtualizationDiagnostics
      setEnabled: (enabled: boolean) => PageVirtualizationDiagnostics
      resetMetrics: () => PageVirtualizationDiagnostics
      applyNow: () => PageVirtualizationDiagnostics
      remountAll: () => Promise<PageVirtualizationDiagnostics>
    }
    tikkunRecorder?: {
      ready: () => Promise<void>
      loadAudio: (audioId: string) => Promise<ActiveAudioSession | null>
      renderAt: (seconds: number) => Promise<{
        audioId: string
        currentTime: number
        duration: number
        activeTokenKey: string | null
      } | null>
      renderHighlightAnimationAt: (
        seconds: number,
        elapsedMs: number,
        settleBeforeAnimation: boolean,
        scrollTransition: boolean,
        transitionWaitMs: number
      ) => Promise<{
        audioId: string
        currentTime: number
        duration: number
        activeTokenKey: string | null
        scrollTop: number
      } | null>
      settleAt: (seconds: number) => Promise<{
        audioId: string
        currentTime: number
        duration: number
        activeTokenKey: string | null
        scrollTop: number
      } | null>
      play: () => Promise<void>
      pause: () => void
      state: () => {
        ready: boolean
        audioId: string | null
        duration: number
        currentTime: number
        activeTokenKey: string | null
        scrollTop: number
      }
      captureRect: (margin?: number) => {
        x: number
        y: number
        width: number
        height: number
      }
    }
  }
}

const app = {
  jumpTo: (target: ScrollViewModel) => {
    optionalRouteAbortController?.abort()
    optionalRouteAbortController = null
    display?.destroy()
    latestViewportRange = null
    resetAliyahDomCaches()
    const lifetime = readerRuntimeLifecycle.begin()
    readerRuntimeLifetime = lifetime
    const book = document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
    const hideUntilSettled = pageVirtualizationSettings.state().enabled
    book.style.visibility = hideUntilSettled ? 'hidden' : ''
    display = new ScrollDisplay(
      target,
      book
    )
    const currentDisplay = display
    highlightControllerGlobal?.setDisplay(display)

    const rendered = display.rendered.then(() => {
      if (!lifetime.isCurrent() || display !== currentDisplay) return
      hideParshaPicker()
      refreshReaderChrome()
      if (playbackTimelineGlobal)
        void playbackTimelineGlobal.syncHighlight({ scroll: false }).catch((error) => {
          if (lifetime.isCurrent()) console.error('Failed to restore reader highlight', error)
        })
      const debugActiveToken = getDebugActiveTokenKey()
      if (debugActiveToken && highlightControllerGlobal) {
        void highlightControllerGlobal
          .activateTokenKey(debugActiveToken, { scroll: false })
          .catch((error) => {
            if (lifetime.isCurrent()) console.error('Failed to activate debug token', error)
          })
      }
    })
    const settled = currentDisplay.scrolled.then(async () => {
      if (!lifetime.isCurrent() || display !== currentDisplay) return
      markPageVirtualizationReady(currentDisplay)
      if (hideUntilSettled) await waitForAnimationFrames(2)
      if (lifetime.isCurrent() && display === currentDisplay) {
        book.style.visibility = ''
        viewportTrackerGlobal?.refresh()
      }
    })
    void settled.catch((error) => {
      if (display === currentDisplay) book.style.visibility = ''
      console.error(error)
    })
    return hideUntilSettled ? rendered.then(() => settled) : rendered
  },
}

function deactivateReaderRuntime() {
  readerRuntimeLifecycle.cancel()
  readerRuntimeLifetime = null
  offlineRecordingPromptGlobal?.setPendingRetry()
  display?.destroy()
  display = null
  resetAliyahDomCaches()
}

function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    const wait = (remaining: number) => {
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => wait(remaining - 1))
    }
    wait(count)
  })
}

const setVisibility = ({
  selector,
  visible,
}: {
  selector: string
  visible: boolean
}) => {
  document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
    node.classList.toggle('u-hidden', !visible)
    node.classList.toggle('mod-animated', !visible)
  })
}

function showPersistenceNotice(message: string) {
  const toast = document.querySelector<HTMLElement>(
    '[data-target-id="persistence-toast"]'
  )
  if (!toast) return
  if (persistenceToastTimer !== null) window.clearTimeout(persistenceToastTimer)
  toast.textContent = message
  toast.classList.remove('u-hidden')
  persistenceToastTimer = window.setTimeout(() => {
    toast.classList.add('u-hidden')
    toast.textContent = ''
    persistenceToastTimer = null
  }, 6_000)
}

const syncReaderProgressVisibility = () => {
  const visible =
    parseCurrentRoute()?.view === 'reader' && !isShowingParshaPicker()

  ;[
    '[data-target-id="reader-progress"]',
    '[data-target-id="reader-progress-mobile"]',
    '.reader-corner-controls',
  ].forEach((selector) => setVisibility({ selector, visible }))
  renderAliyahRail()
}

const syncReaderSideNavigationVisibility = () => {
  const visible =
    parseCurrentRoute()?.view === 'reader' && !isShowingParshaPicker()

  setVisibility({ selector: '.reader-side', visible })
}

function hideLastReadingPrompt() {
  lastReadingPromptGlobal?.hide()
}

function dismissLastReadingPrompt() {
  lastReadingPromptGlobal?.dismiss()
}

function showLastReadingPrompt(lastReading: LastReading) {
  lastReadingPromptGlobal?.show(lastReading)
}

function requestLastReadingSaveAfterRouteRender() {
  shouldSaveLastReadingAfterRouteRender = true
  dismissLastReadingPrompt()
}

function lastReadingInputFromAnchor(
  anchor: ReturnType<typeof getAliyahProgressAnchors>[number] | null
) {
  if (!display?.viewModel || !anchor?.run) return null
  const aliyah = anchor.run.aliyot.find(
    (candidate) => candidate.index === anchor.aliyahIndex
  )
  const hash = aliyah?.start
    ? createLastReadingHash(anchor.run, aliyah.start)
    : createLastReadingHash(anchor.run)
  if (!hash || hash === '#/next') return null
  return {
    hash,
    parshaName: display.viewModel.displayTitleForRun(anchor.run),
    aliyahLabel: anchor.label === '—' ? undefined : anchor.label,
  }
}

function saveLastReadingFromAnchor(
  anchor: ReturnType<typeof getAliyahProgressAnchors>[number] | null
) {
  if (recordingMode.enabled || parseCurrentRoute()?.view !== 'reader') return
  const input = lastReadingInputFromAnchor(anchor)
  if (!input) return
  try {
    saveLastReading(browserLocalStorage, input)
  } catch (error) {
    console.error('Failed to save the current reading position', error)
    showPersistenceNotice('Your reading position could not be saved in this browser.')
  }
}

function saveCurrentLastReading() {
  const anchors = getAliyahProgressAnchors()
  if (!anchors.length) return

  const book = getBook()
  const viewportCenter = getReaderFocalPointScrollTop(book)
  let current = anchors[0] ?? null
  for (const anchor of anchors) {
    if (anchor.position <= viewportCenter) current = anchor
    else break
  }
  saveLastReadingFromAnchor(current)
}

function resetReaderSideNavigationState(audioController: AudioController) {
  closeMobileAliyahPicker()
  audioController.clearSession()
  highlightControllerGlobal?.clear()
  activeRecordingIssues = []
  cueAuthoringGlobal?.recordingIssuesChanged()
  cueAuthoringGlobal?.clearSession()
  syncActiveReaderIssueNotice()
  playbackTimelineGlobal?.refresh()
  refreshInlineAudioButtons(audioController)
  syncToolbarCurrentAliyahButton(null, audioController)
}

const showParshaPicker = () => {
  activeParshaPicker?.destroy()
  activeParshaPicker = null
  closeCueAuthoring()
  ;[
    { selector: '[data-test-id="annotations-toggle"]', visible: false },
    { selector: '[data-target-id="settings-toggle"]', visible: false },
    { selector: '[data-target-id="about-link"]', visible: false },
    { selector: '[data-target-id="tikkun-book"]', visible: false },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  const jumper = ParshaPicker(createCalendarGenerator(), {
    calendarSettings,
    onCalendarSettingsChange: updateCalendarSettings,
    navigate: (hash) => {
      requestLastReadingSaveAfterRouteRender()
      if (hash !== location.hash) {
        location.hash = hash
        return
      }
      if (!audioControllerGlobal) {
        window.dispatchEvent(new Event('hashchange'))
        return
      }
      const route = parseUrl(
        createCalendarGenerator(),
        hash.replace(/^#/, '')
      )
      if (route) renderRoute(route, audioControllerGlobal)
    },
  })
  activeParshaPicker = jumper

  document.querySelector('[data-target-id="reader-shell"]')!.appendChild(jumper.node)

  jumper.onMount()
  syncReaderProgressVisibility()
  syncReaderSideNavigationVisibility()
  syncToolbarCurrentAliyahButton(null, audioControllerGlobal ?? undefined)
}

const hideParshaPicker = () => {
  ;[
    { selector: '[data-test-id="annotations-toggle"]', visible: true },
    { selector: '[data-target-id="settings-toggle"]', visible: true },
    { selector: '[data-target-id="about-link"]', visible: true },
    { selector: '[data-target-id="tikkun-book"]', visible: true },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  activeParshaPicker?.destroy()
  activeParshaPicker = null
  document.querySelector('.parsha-picker')?.remove()

  syncReaderProgressVisibility()
  syncReaderSideNavigationVisibility()
  refreshReaderChrome(audioControllerGlobal ?? undefined)
}

const isShowingParshaPicker = () =>
  Boolean(document.querySelector('.parsha-picker'))

function updateCalendarSettings(settings: CalendarSettings) {
  try {
    saveCalendarSettings(settings, browserLocalStorage)
  } catch (error) {
    console.error('Failed to save calendar settings', error)
    showPersistenceNotice('Calendar settings will apply now but could not be saved.')
  }
  calendarSettings = settings

  if (isShowingParshaPicker()) {
    hideParshaPicker()
    showParshaPicker()
  }
}

const toggleParshaPicker = () => {
  const route = parseCurrentRoute()
  const readerShell = document.querySelector<HTMLElement>(
    '[data-target-id="reader-shell"]'
  )
  const isRenderedReaderView =
    Boolean(display) && !readerShell?.classList.contains('u-hidden')

  if (route?.view !== 'reader' && !isRenderedReaderView) {
    location.hash = lastReaderHash
    return
  }

  if (isShowingParshaPicker()) hideParshaPicker()
  else showParshaPicker()
}

const setAnnotationsEnabled = (enabled: boolean) => {
  const toggle = document.querySelector<HTMLInputElement>(
    '[data-target-id="annotations-toggle"]'
  )!

  toggle.checked = enabled

  const book = document.querySelector('[data-target-id=tikkun-book]')!
  book.classList.toggle('mod-annotations-on', toggle.checked)
  book.classList.toggle('mod-annotations-off', !toggle.checked)
  scheduleAliyahStartMarkerLayout(book as HTMLElement)
  syncReaderControls()
}

const toggleAnnotations = (getPreviousCheckedState: () => boolean) => {
  setAnnotationsEnabled(!getPreviousCheckedState())
}

const debounce = (callback: () => void, delay: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  const run = () => {
    if (timeout !== null) clearTimeout(timeout)
    timeout = setTimeout(() => {
      timeout = null
      callback()
    }, delay)
  }
  run.cancel = () => {
    if (timeout !== null) clearTimeout(timeout)
    timeout = null
  }
  return run
}

const setAppHeight = () => {
  document.documentElement.style.setProperty(
    '--app-height',
    `${window.innerHeight}px`
  )
}

let debugFocalMeasureFrame = 0

function removeDebugFocalMeasure() {
  if (debugFocalMeasureFrame) {
    cancelAnimationFrame(debugFocalMeasureFrame)
    debugFocalMeasureFrame = 0
  }

  document
    .querySelectorAll('.debug-focal-line, .debug-focal-measure')
    .forEach((el) => el.remove())
}

function toggleDebugFocalMeasure() {
  if (document.querySelector('.debug-focal-line, .debug-focal-measure')) {
    removeDebugFocalMeasure()
    return
  }

  const makeLine = (color: string, label: string) => {
    const line = document.createElement('div')
    line.className = 'debug-focal-line'
    line.style.cssText = `
      position: fixed;
      left: 0;
      right: 0;
      height: 0;
      border-top: 2px solid ${color};
      z-index: 999999;
      pointer-events: none;
      font: 13px sans-serif;
      color: white;
      text-shadow: 0 1px 2px black;
    `
    line.textContent = label
    document.body.appendChild(line)
    return line
  }

  const makeMeasure = (color: string, x: number, labelPrefix: string) => {
    const line = document.createElement('div')
    const label = document.createElement('div')
    line.className = 'debug-focal-measure'
    label.className = 'debug-focal-measure'

    line.style.cssText = `
      position: fixed;
      left: ${x}px;
      width: 0;
      border-left: 2px dashed ${color};
      z-index: 999999;
      pointer-events: none;
    `

    label.style.cssText = `
      position: fixed;
      left: ${x + 8}px;
      z-index: 999999;
      pointer-events: none;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.72);
      color: white;
      font: 13px sans-serif;
      white-space: nowrap;
    `

    document.body.append(line, label)

    return {
      update(startY: number, endY: number) {
        const top = Math.min(startY, endY)
        const height = Math.abs(endY - startY)
        line.style.top = `${top}px`
        line.style.height = `${height}px`
        label.style.top = `${top + height / 2 - 12}px`
        label.textContent = `${labelPrefix}: ${Math.round(height)}px`
      },
    }
  }

  const readerBlue = 'lightskyblue'
  const browser = makeLine('red', 'Browser center')
  const reader = makeLine(readerBlue, 'Reader center')
  const browserTop = makeMeasure('red', 24, 'Browser top')
  const browserBottom = makeMeasure('red', 104, 'Browser bottom')
  const readerTop = makeMeasure(readerBlue, 220, 'Reader top')
  const readerBottom = makeMeasure(readerBlue, 300, 'Reader bottom')

  const update = () => {
    const book = document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')
    if (!book || !browser.isConnected) {
      removeDebugFocalMeasure()
      return
    }

    const rect = book.getBoundingClientRect()
    const browserTopY = 0
    const browserBottomY = document.documentElement.clientHeight
    const browserCenterY = browserBottomY / 2
    const readerTopY = rect.top
    const readerBottomY = rect.top + book.clientHeight
    const readerCenterY = readerTopY + book.clientHeight / 2

    browser.style.top = `${browserCenterY}px`
    reader.style.top = `${readerCenterY}px`
    browserTop.update(browserTopY, browserCenterY)
    browserBottom.update(browserCenterY, browserBottomY)
    readerTop.update(readerTopY, readerCenterY)
    readerBottom.update(readerCenterY, readerBottomY)

    debugFocalMeasureFrame = requestAnimationFrame(update)
  }

  update()
}

function setupDebugControls(scope: MountScope) {
  document
    .querySelectorAll<HTMLButtonElement>('[data-target-id="debug-focal-measure-toggle"]')
    .forEach((button) =>
      button.addEventListener('click', toggleDebugFocalMeasure, {
        signal: scope.signal,
      })
    )
  scope.own(removeDebugFocalMeasure)
}

function listenForRevealGesture(scope: MountScope, book: HTMLElement) {
  const PULL_THRESHOLD = 30
  const PULL_MAXIMUM = 100

  const endTouch = () => {
    book.classList.add('mod-pull-releasing')
    book.style.setProperty('--pull-translation', `0`)
  }

  let startX = 0

  book.addEventListener(
    'touchstart',
    (e) => {
      book.classList.remove('mod-pull-releasing')
      startX = e.changedTouches[0].screenX
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'touchmove',
    (e) => {
      const touchX = e.changedTouches[0].screenX
      const pullDistance = -Math.max(touchX - startX, -PULL_MAXIMUM)
      if (pullDistance < PULL_THRESHOLD) return

      book.style.setProperty(
        '--pull-translation',
        `${PULL_THRESHOLD - pullDistance}px`
      )
    },
    { signal: scope.signal }
  )

  book.addEventListener('touchend', endTouch, { signal: scope.signal })
  book.addEventListener('touchcancel', endTouch, { signal: scope.signal })
  scope.own(() => {
    book.classList.remove('mod-pull-releasing')
    book.style.removeProperty('--pull-translation')
  })
}

function routeHashPath(hash = location.hash) {
  return hash.split('?', 1)[0]
}

function parseCurrentRoute(): AppRoute | null {
  return parseUrl(createCalendarGenerator(), routeHashPath().replace(/^#/, ''))
}

function selectAliyah(identity: AliyahIdentity) {
  explicitAliyahSelection = identity
  explicitAliyahSelectionHash = routeHashPath()
}

function clearExplicitAliyahSelection() {
  explicitAliyahSelection = null
  explicitAliyahSelectionHash = null
}

function getBook() {
  return document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
}

function focusReaderSurface() {
  getBook().focus({ preventScroll: true })
}

function isCompactReaderViewport() {
  return readerViewportGlobal?.isCompact() ?? false
}

function getTitleEl() {
  return document.querySelector<HTMLElement>('[data-target-id="parsha-title"]')!
}

function formatTopBarTitle(title: string | undefined) {
  return title?.replace(/^פרשת /, '') ?? 'Tikkun'
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    Boolean(target.closest('input, textarea, select, button'))
  )
}

function getReaderMode(): ReaderMode {
  if (recordingMode.enabled) return 'recording'
  if (cueAuthoringGlobal?.isActive()) return 'admin-authoring'
  return currentReaderMode === 'practice-focus' ? 'practice-focus' : 'normal'
}

function closeCueAuthoring() {
  if (cueAuthoringLoaderGlobal) cueAuthoringLoaderGlobal.close()
  else cueAuthoringGlobal?.setVisible(false)
}

function syncReaderMode() {
  currentReaderMode = getReaderMode()
  document.documentElement.dataset.readerMode = currentReaderMode
}

function getActiveTokenKey() {
  const highlighted = highlightControllerGlobal?.getActiveTokenKey()
  if (highlighted) return highlighted

  return getReaderFocalTokenKey()
}

function getReaderFocalTokenKey() {
  const target = getReaderFocalPointScrollTarget(getBook())
  if (!target) return null
  if (target.dataset.tokenKey) return target.dataset.tokenKey

  return (
    getFirstVisibleWord(target)?.dataset.tokenKey ??
    target.querySelector<HTMLElement>('.word[data-token-key]')?.dataset.tokenKey ??
    null
  )
}

function getTokenLabel(tokenKey: string) {
  const token = document.querySelector<HTMLElement>(`[data-token-key="${tokenKey}"]`)
  return token?.textContent?.trim().replace(/\s+/g, ' ') || `Word ${tokenKey}`
}

async function jumpToTokenKey(tokenKey: string, options: { audioTime?: number } = {}) {
  const position = parseTokenKey(tokenKey)
  if (!position) throw new TypeError(`Invalid token key: ${tokenKey}`)
  const virtualizationHold = holdPageVirtualizationEviction()
  try {
    await display?.ensurePageMountedForNavigation(position.pageNumber)
    virtualizationHold.releaseAfterNavigation()
    const token = await highlightControllerGlobal?.activateTokenKey(tokenKey, {
      scroll: true,
    })
    if (!token) virtualizationHold.release()
    if (options.audioTime !== undefined && audioControllerGlobal?.session) {
      audioControllerGlobal.seek(options.audioTime)
      playbackTimelineGlobal?.refresh()
    }
    if (token) {
      syncToolbarCurrentAliyahButton(
        getAliyahProgressAnchorForElement(token),
        audioControllerGlobal ?? undefined
      )
    }
    focusReaderSurface()
  } catch (error) {
    virtualizationHold.release()
    throw error
  }
}

function bookmarkCurrentToken() {
  const tokenKey = getReaderFocalTokenKey()
  if (!tokenKey) return

  const existing = bookmarks.find((bookmark) => bookmark.tokenKey === tokenKey)
  if (existing) {
    const nextBookmarks = bookmarks.filter((bookmark) => bookmark.tokenKey !== tokenKey)
    if (!persistBookmarks(nextBookmarks)) return
    bookmarks = nextBookmarks
    commandPaletteGlobal?.refresh()
    syncReaderControls()
    return
  }

  const session = audioControllerGlobal?.session
  const cue = session?.cues.find((candidate) => formatTokenKey(candidate) === tokenKey)
  const hash = getBookmarkHashForTokenKey(tokenKey)
  const bookmark = createBookmark({
    hash,
    label: getTokenLabel(tokenKey),
    tokenKey,
    audioId: session?.recording.id,
    timeStart: cue?.timeStart,
  })
  const nextBookmarks = [
    bookmark,
    ...bookmarks.filter((item) => item.tokenKey !== tokenKey),
  ]
  if (!persistBookmarks(nextBookmarks)) return
  bookmarks = nextBookmarks
  commandPaletteGlobal?.refresh()
  syncReaderControls()
}

function persistBookmarks(nextBookmarks: ReaderBookmark[]) {
  try {
    saveBookmarks(browserLocalStorage, nextBookmarks)
    return true
  } catch (error) {
    console.error('Failed to save reader bookmarks', error)
    showPersistenceNotice('Bookmarks could not be saved in this browser.')
    return false
  }
}

function getReaderControlsState(
  tokenKey = getReaderFocalTokenKey()
): ReaderControlsState {
  const isBookmarked = Boolean(
    tokenKey && bookmarks.some((bookmark) => bookmark.tokenKey === tokenKey)
  )
  const annotationsInput = document.querySelector<HTMLInputElement>(
    '[data-target-id="annotations-toggle"]'
  )
  return {
    bookmarkAvailable: Boolean(tokenKey),
    bookmarked: isBookmarked,
    annotationsEnabled: Boolean(annotationsInput?.checked),
    aliyahNavigationAvailable: isAliyahRailRouteAvailable(),
  }
}

function syncReaderControls() {
  readerControlsGlobal?.sync()
}

function getBookmarkHashForTokenKey(tokenKey: string) {
  const token = document.querySelector<HTMLElement>(`[data-token-key="${tokenKey}"]`)
  const lineInfo = token ? getLineInfoFromElement(token) : null
  const verse = lineInfo?.verses[0]
  const initialRef = verse && lineInfo?.run
    ? { ...verse, scroll: lineInfo.run.scroll }
    : lineInfo?.run?.aliyot[0]?.start

  if (lineInfo?.run) return createLastReadingHash(lineInfo.run, initialRef)
  if (currentReaderHash && currentReaderHash !== '#/next') return currentReaderHash
  return lastReaderHash && lastReaderHash !== '#/next' ? lastReaderHash : location.hash
}

function checkpointFromBookmark(bookmark: ReaderBookmark): Checkpoint {
  return {
    id: bookmark.id,
    kind: 'bookmark',
    source: 'bookmark',
    label: bookmark.label,
    hash: bookmark.hash,
    audioId: bookmark.audioId,
    tokenKey: bookmark.tokenKey,
    timeStart: bookmark.timeStart,
    createdAt: bookmark.createdAt,
  }
}

function bookmarkReadingLabel(bookmark: ReaderBookmark) {
  const runId = /^#\/run\/([^/]+)/.exec(bookmark.hash)?.[1]
  if (runId) {
    const run = createCalendarGenerator().parseId(runId)
    return run ? displayTitleForLeiningRun(run) : null
  }

  const parshaSlug = /^#\/(?:torah|esther)\/parsha\/([^/]+)/.exec(bookmark.hash)?.[1]
  return parshaSlug ? parshaSlug.replace(/-/g, ' ') : null
}

function titleCaseBookmarkBadge(label: string) {
  if (!/[A-Za-z]/.test(label)) return label
  return label.replace(/\S+/g, (word) =>
    word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase()
  )
}

function isBookmarkAction(action: NavigationAction) {
  return action.id.startsWith('checkpoint.bookmark:')
}

function getCurrentCheckpoints() {
  const checkpoints: Checkpoint[] = [
    ...bookmarks.map(checkpointFromBookmark),
    ...getReaderVisibleIssues(activeRecordingIssues).map(checkpointFromIssue),
  ]

  const session = audioControllerGlobal?.session
  const activeTokenKey = getActiveTokenKey()
  if (session && activeTokenKey) {
    const cue = session.cues.find(
      (candidate) => formatTokenKey(candidate) === activeTokenKey
    )
    if (cue) {
      checkpoints.push(
        checkpointFromCue({
          audioId: session.recording.id,
          label: 'Current word',
          tokenKey: activeTokenKey,
          timeStart: cue.timeStart,
        })
      )
    }
  }

  return checkpoints.sort(compareCheckpoints)
}

function jumpToCheckpoint(checkpoint: Checkpoint) {
  if (checkpoint.hash && checkpoint.hash !== location.hash) {
    location.hash = checkpoint.hash
    window.setTimeout(() => {
      void jumpToTokenKey(checkpoint.tokenKey, {
        audioTime: checkpoint.timeStart,
      })
    }, 0)
    return
  }

  void jumpToTokenKey(checkpoint.tokenKey, { audioTime: checkpoint.timeStart })
}

function navigateToPage(scroll: ScrollName, page: number) {
  navigateToHash(generatePageUrl(scroll, page), audioControllerGlobal!)
}

type AliyahDomTarget = {
  element: HTMLElement
  marker: HTMLElement | null
}

async function getAliyahStartLocationForRun(
  runId: string,
  aliyahIndex: PlaybackAliyahIndex,
  targetDisplay = display
) {
  if (!targetDisplay) return null
  const run =
    targetDisplay.viewModel.relevantRuns.find((candidate) => candidate.id === runId) ??
    createCalendarGenerator().parseId(runId)
  if (!run) return null

  return aliyahTargetLocationCache.get(targetDisplay.viewModel, run, aliyahIndex)
}

function getAliyahMarkerElement(
  runId: string,
  aliyahIndex: PlaybackAliyahIndex
) {
  const cacheKey = getAliyahTargetKey(runId, aliyahIndex)
  const cached = aliyahMarkerElementsByKey.get(cacheKey)
  if (cached?.isConnected) return cached

  const marker = document.querySelector<HTMLElement>(
    aliyahMarkerSelector(runId, aliyahIndex)
  )
  if (marker) aliyahMarkerElementsByKey.set(cacheKey, marker)
  else aliyahMarkerElementsByKey.delete(cacheKey)
  return marker
}

function getRenderedLineForLocation(location: {
  pageNumber: number
  lineNumber: number
}, targetDisplay = display, exactPageNode?: HTMLElement) {
  if (!targetDisplay) return null
  const lineIndex = lineIndexFromLocation(location)
  if (exactPageNode) return findRenderedLineElement(exactPageNode, lineIndex)
  const cached = renderedLinesByLocationKey.get(
    getRenderedLineLocationKey(location.pageNumber, lineIndex)
  )
  if (cached?.isConnected) return cached

  const pageNode = targetDisplay.getMountedPageNode(location.pageNumber)
  const line = pageNode ? findRenderedLineElement(pageNode, lineIndex) : null
  if (line) {
    renderedLinesByLocationKey.set(
      getRenderedLineLocationKey(location.pageNumber, lineIndex),
      line
    )
  }
  return line
}

function pageNumberFromMountedElement(element: HTMLElement) {
  const pageElement = element.closest<HTMLElement>('[data-page-number]')
  const pageNumber = Number(pageElement?.dataset.pageNumber)
  return Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null
}

async function ensureAliyahDomTargetRendered(
  runId: string,
  aliyahIndex: PlaybackAliyahIndex
): Promise<AliyahDomTarget | null> {
  const targetDisplay = display
  const lifetime = readerRuntimeLifetime
  if (!targetDisplay || !lifetime?.isCurrent()) return null
  let marker = getAliyahMarkerElement(runId, aliyahIndex)
  if (marker) {
    latestRailTargetPageNumber = pageNumberFromMountedElement(marker)
    return { element: marker, marker }
  }

  const location = await getAliyahStartLocationForRun(
    runId,
    aliyahIndex,
    targetDisplay
  )
  if (!lifetime.isCurrent() || display !== targetDisplay) return null
  if (location) {
    latestRailTargetPageNumber = location.pageNumber
    const mountedPage = await targetDisplay.ensurePageMountedForNavigation(
      location.pageNumber,
      { runId }
    )
    if (!lifetime.isCurrent() || display !== targetDisplay) return null
    marker = getAliyahMarkerElement(runId, aliyahIndex)
    if (marker) return { element: marker, marker }

    const line = mountedPage
      ? getRenderedLineForLocation(location, targetDisplay, mountedPage)
      : null
    if (line) return { element: line, marker: null }
  }

  while (!marker) {
    if (!lifetime.isCurrent() || display !== targetDisplay) return null
    const loaded = await targetDisplay.ensureNextContentMounted()
    if (!loaded) return null

    marker = getAliyahMarkerElement(runId, aliyahIndex)
  }

  return { element: marker, marker }
}

async function scrollToAliyahMarker(
  runId: string,
  aliyahIndex: PlaybackAliyahIndex,
  actionToken = railScrollAction.start()
) {
  const virtualizationHold = holdPageVirtualizationEviction()
  let target: AliyahDomTarget | null
  try {
    target = await ensureAliyahDomTargetRendered(runId, aliyahIndex)
  } catch (error) {
    virtualizationHold.release()
    throw error
  }
  if (!railScrollAction.isCurrent(actionToken) || !target) {
    virtualizationHold.release()
    return
  }

  const line = target.element.closest<HTMLElement>('[data-line-index]')
  virtualizationHold.releaseAfterNavigation()
  centerElementInScrollRoot(getBook(), line ?? target.element, { behavior: 'smooth' })
  syncToolbarCurrentAliyahButton(
    getAliyahProgressAnchorForElement(line ?? target.element),
    audioControllerGlobal ?? undefined
  )
  viewportTrackerGlobal?.refresh()
  updateReaderProgress()
  window.setTimeout(() => {
    viewportTrackerGlobal?.refresh()
    updateReaderProgress()
  }, 500)
  focusReaderSurface()
}

function upcomingHolidayLeiningActions() {
  const generator = createCalendarGenerator()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentHebrewYear = new HDate(today).getFullYear()
  const actions: NavigationAction[] = []
  const seenRuns = new Set<string>()

  for (let year = currentHebrewYear; year <= currentHebrewYear + 2; year += 1) {
    for (const leiningDate of generator.forHebrewYear(year)) {
      if (leiningDate.date < today) continue

      for (const leining of leiningDate.leinings) {
        const run = selectCommandPaletteHolidayRun(leining)
        if (!run || seenRuns.has(run.id)) continue

        seenRuns.add(run.id)
        const label = `${leiningDate.title.en} / ${leiningDate.title.he}`
        actions.push(
          createNavigationAction({
            id: `reading.holiday.${run.id}`,
            group: 'reading',
            label,
            keywords: holidayLeiningKeywords(leiningDate.title, `${leining.id}`),
            run: () => navigateToHash(createLastReadingHash(run), audioControllerGlobal!),
          })
        )
        if (actions.length >= 16) return actions
      }
    }
  }

  return actions
}

function displayTitleForLeiningRun(run: LeiningRun) {
  return run.leining.date.title.he || run.leining.date.title.en
}

function searchableParshaActions() {
  const generator = createCalendarGenerator()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentHebrewYear = new HDate(today).getFullYear()
  const actions: NavigationAction[] = []
  const seenRuns = new Set<string>()

  for (let year = currentHebrewYear; year <= currentHebrewYear + 2; year += 1) {
    for (const leiningDate of generator.forHebrewYear(year)) {
      if (leiningDate.date < today) continue
      for (const leining of leiningDate.leinings) {
        if (!leining.isParsha) continue
        for (const run of leining.runs) {
        if (run.scroll !== 'torah' || seenRuns.has(run.id)) continue
        seenRuns.add(run.id)
        const parshaSlug = parshaSlugForRun(run)
        actions.push(
          ...createAliyahNavigationActions({
            run,
            displayTitle: displayTitleForLeiningRun(run),
            showWhenEmpty: false,
            dedupeKeyPrefix: parshaSlug ? `reading.parsha.${parshaSlug}` : undefined,
            navigate: (hash) => navigateToHash(hash, audioControllerGlobal!),
          })
        )
        }
      }
    }
  }

  return actions
}

function selectSearchableHolidayRuns(leining: LeiningInstance) {
  const run = selectCommandPaletteHolidayRun(leining)
  return run ? [run] : []
}

function searchableHolidayActions() {
  const generator = createCalendarGenerator()
  const today = new Date()
  const currentHebrewYear = new HDate(today).getFullYear()
  const actions: NavigationAction[] = []
  const seenRuns = new Set<string>()

  for (let year = currentHebrewYear; year <= currentHebrewYear + 1; year += 1) {
    for (const leiningDate of generator.forHebrewYear(year)) {
      for (const leining of leiningDate.leinings) {
        if (leining.isParsha) continue
        for (const run of selectSearchableHolidayRuns(leining)) {
          if (seenRuns.has(run.id)) continue
          seenRuns.add(run.id)
          actions.push(
            ...createAliyahNavigationActions({
              run,
              displayTitle: displayTitleForLeiningRun(run),
              showWhenEmpty: false,
              navigate: (hash) => navigateToHash(hash, audioControllerGlobal!),
            })
          )
        }
      }
    }
  }

  return actions
}

function recordingActionKeywords(
  recording: Extract<AudioRecording, { reading: { kind: 'parsha' } }>
) {
  const terms = [
    recording.parshaSlug,
    recording.parshaName,
    ...getParshaSearchTermsForSlug(recording.parshaSlug),
  ]
  return [
    ...terms,
    ...terms.flatMap((term) => [
      `${term} ${recording.aliyah}`,
      `${term} Aliyah ${recording.aliyah}`,
    ]),
  ]
}

function createCommandPaletteActions() {
  void cueAuthoringLoaderGlobal?.ensureLoaded()
  const actions: NavigationAction[] = [
    createNavigationAction({
      id: 'reading.current',
      group: 'reading',
      label: 'Today / Next Reading',
      keywords: ['today', 'next shabbat', 'next reading'],
      run: () => navigateToHash('#/next', audioControllerGlobal!),
    }),
    createNavigationAction({
      id: 'tools.analytics',
      group: 'tools',
      label: 'Cue Analytics',
      keywords: ['playback analytics', 'word analytics', 'timing'],
      run: () => navigateToHash(generateCueAnalyticsUrl(), audioControllerGlobal!),
    }),
    createNavigationAction({
      id: 'tools.settings',
      group: 'tools',
      label: 'Reader Settings',
      keywords: ['theme', 'highlight', 'preferences'],
      run: () => readerSettingsGlobal?.open(),
    }),
    createNavigationAction({
      id: 'admin.open',
      group: 'admin',
      label: 'Admin Timing Mode',
      keywords: ['timing', 'authoring', 'record cues'],
      available: cueAuthoringGlobal?.isUnlocked() ?? false,
      run: () => cueAuthoringGlobal?.setVisible(true),
    }),
  ]

  actions.push(...upcomingHolidayLeiningActions())

  if (display?.viewModel) {
    const anchors = getAliyahProgressAnchors()
    const activeRun =
      getCurrentAliyahFromViewportRange(latestViewportRange, anchors)?.run ??
      anchors.find((anchor) => anchor.run)?.run ??
      null
    if (activeRun) {
      const activeParshaSlug = activeRun.leining.isParsha
        ? parshaSlugForRun(activeRun)
        : null
      actions.push(
        ...createAliyahNavigationActions({
          run: activeRun,
          displayTitle: display.viewModel.displayTitleForRun(activeRun),
          dedupeKeyPrefix: activeParshaSlug
            ? `reading.parsha.${activeParshaSlug}`
            : undefined,
          navigate: (hash) => navigateToHash(hash, audioControllerGlobal!),
        })
      )
    }
  }

  for (const recording of listRecordings()) {
    if (recording.status !== 'available' || !isParshaAudioRecording(recording)) continue
    const resolved = resolveParshaRun(createCalendarGenerator(), recording.parshaSlug)
    const aliyah = resolved?.run.aliyot.find(
      (candidate) => candidate.index === recording.aliyah
    )
    const targetHash = resolved && aliyah
      ? createLastReadingHash(resolved.run, aliyah.start)
      : generateParshaUrl(recording.parshaSlug)
    actions.push(
      createNavigationAction({
        id: `reading.${recording.id}`,
        group: 'reading',
        label: `${recording.parshaName} Aliyah ${recording.aliyah}`,
        dedupeKey: `reading.parsha.${recording.parshaSlug}.${recording.aliyah}`,
        keywords: recordingActionKeywords(recording),
        run: () => navigateToHash(targetHash, audioControllerGlobal!),
      })
    )
  }

  actions.push(...searchableParshaActions())
  actions.push(...searchableHolidayActions())
  actions.push(...createPageNavigationActions({ navigateToPage }))

  const lastReading = loadEligibleLastReading(browserLocalStorage)
  if (lastReading) {
    actions.push(
      createNavigationAction({
        id: 'resume.last-reading',
        group: 'resume',
        label: `Resume ${lastReading.aliyahLabel ? `${lastReading.parshaName}, ${lastReading.aliyahLabel}` : lastReading.parshaName}`,
        keywords: ['resume', 'last reading'],
        run: () => navigateToHash(lastReading.hash, audioControllerGlobal!),
      })
    )
  }

  for (const checkpoint of getCurrentCheckpoints()) {
    const bookmark = checkpoint.kind === 'bookmark'
      ? bookmarks.find((candidate) => candidate.id === checkpoint.id)
      : null
    actions.push(
      createNavigationAction({
        id: `checkpoint.${checkpoint.id}`,
        group: checkpoint.kind === 'bookmark' ? 'resume' : 'checkpoint',
        label: checkpoint.label,
        badgeLabel: bookmark ? bookmarkReadingLabel(bookmark) ?? undefined : undefined,
        keywords: ['bookmark', 'checkpoint', checkpoint.tokenKey],
        run: () => jumpToCheckpoint(checkpoint),
      })
    )
  }

  return actions
}

function openCommandPalette() {
  commandPaletteGlobal?.open()
}

function closeCommandPalette() {
  commandPaletteGlobal?.close()
}

function isCommandPaletteOpen() {
  return commandPaletteGlobal?.isOpen() ?? false
}

function toggleCommandPalette() {
  commandPaletteGlobal?.toggle()
}

function focusOverlayReturnTarget(target: HTMLElement | null) {
  const nextTarget =
    target?.isConnected && target.getClientRects().length > 0 ? target : getBook()
  nextTarget.focus({ preventScroll: true })
}

let aliyahStartPopup: HTMLElement | null = null
let aliyahStartPopupLine: HTMLElement | null = null
let aliyahStartPopupMarker: HTMLButtonElement | null = null

function getAliyahStartPopup() {
  if (aliyahStartPopup) return aliyahStartPopup

  aliyahStartPopup = document.createElement('div')
  aliyahStartPopup.className = 'aliyah-start-popup u-hidden'
  aliyahStartPopup.id = 'aliyah-start-popup'
  aliyahStartPopup.setAttribute('role', 'dialog')
  aliyahStartPopup.setAttribute('aria-label', 'Aliyah start')
  document.body.appendChild(aliyahStartPopup)
  return aliyahStartPopup
}

function closeAliyahStartPopup() {
  aliyahStartPopup?.classList.add('u-hidden')
  aliyahStartPopupMarker?.setAttribute('aria-expanded', 'false')
  aliyahStartPopupLine = null
  aliyahStartPopupMarker = null
}

function getVisibleAliyahStartMarker(line: HTMLElement) {
  const marker = line.querySelector<HTMLButtonElement>('.aliyah-start-marker')
  if (!marker) return null
  const rect = marker.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? marker : null
}

function getAliyahStartMarkerAtPointer(event: Event, book: HTMLElement) {
  const marker = (event.target as Element | null)?.closest<HTMLButtonElement>(
    '.aliyah-start-marker'
  )
  return marker && book.contains(marker) ? marker : null
}

function getAliyahStartMarkerLine(marker: HTMLButtonElement) {
  return marker.closest<HTMLElement>('[data-line-index][data-aliyah-starts]')
}

function appendAliyahStartPopupRow(
  popup: HTMLElement,
  label: string,
  value: string
) {
  if (!value) return

  const row = document.createElement('div')
  row.className = 'aliyah-start-popup-row'

  const rowLabel = document.createElement('span')
  rowLabel.className = 'aliyah-start-popup-label'
  rowLabel.textContent = label

  const rowValue = document.createElement('span')
  rowValue.className = 'aliyah-start-popup-value'
  rowValue.textContent = value

  row.append(rowLabel, rowValue)
  popup.appendChild(row)
}

function positionAliyahStartPopup(
  popup: HTMLElement,
  line: HTMLElement,
  marker: HTMLButtonElement | null = getVisibleAliyahStartMarker(line)
) {
  const content = line.querySelector<HTMLElement>('.line-content')
  if (!content) return

  const rect = (marker ?? content).getBoundingClientRect()
  const popupRect = popup.getBoundingClientRect()
  const margin = 8
  const markerX = marker ? rect.left + rect.width / 2 : rect.right - 4
  const markerY = rect.top
  const left = Math.max(
    margin,
    Math.min(
      markerX - popupRect.width / 2,
      window.innerWidth - popupRect.width - margin
    )
  )
  const topAbove = markerY - popupRect.height - margin
  const top = topAbove >= margin ? topAbove : Math.min(markerY + 24, window.innerHeight - popupRect.height - margin)

  popup.style.left = `${left}px`
  popup.style.top = `${Math.max(margin, top)}px`
}

function openAliyahStartPopup(
  line: HTMLElement,
  marker: HTMLButtonElement | null = getVisibleAliyahStartMarker(line)
) {
  if (
    aliyahStartPopupLine === line &&
    aliyahStartPopupMarker === marker &&
    aliyahStartPopup &&
    !aliyahStartPopup.classList.contains('u-hidden')
  ) {
    return
  }

  const popup = getAliyahStartPopup()
  aliyahStartPopupMarker?.setAttribute('aria-expanded', 'false')
  aliyahStartPopupLine = line
  aliyahStartPopupMarker = marker
  marker?.setAttribute('aria-expanded', 'true')
  popup.replaceChildren()
  appendAliyahStartPopupRow(popup, 'Parsha', line.dataset.aliyahStartTitle ?? '')
  appendAliyahStartPopupRow(
    popup,
    'Aliyah',
    marker?.dataset.aliyahStartLabel ?? line.dataset.aliyahStartLabel ?? ''
  )
  appendAliyahStartPopupRow(popup, 'Verses:', line.dataset.aliyahStartVerse ?? '')
  popup.classList.remove('u-hidden')
  positionAliyahStartPopup(popup, line, marker)
}

function setupAliyahStartPopup(scope: MountScope) {
  const book = getBook()

  book.addEventListener(
    'click',
    (event) => {
      if (!isCompactReaderViewport()) {
        closeAliyahStartPopup()
        return
      }
      if (!(event instanceof MouseEvent)) return
      const marker = getAliyahStartMarkerAtPointer(event, book)
      const line = marker ? getAliyahStartMarkerLine(marker) : null
      if (!line || !marker) {
        closeAliyahStartPopup()
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      openAliyahStartPopup(line, marker)
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'pointerover',
    (event) => {
      if (!isCompactReaderViewport() || event.pointerType === 'touch') return
      const marker = getAliyahStartMarkerAtPointer(event, book)
      const line = marker ? getAliyahStartMarkerLine(marker) : null
      if (!line || !marker) return

      openAliyahStartPopup(line, marker)
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'pointerout',
    (event) => {
      if (event.pointerType === 'touch') return
      const marker = getAliyahStartMarkerAtPointer(event, book)
      if (!marker) return
      const nextTarget = event.relatedTarget
      if (nextTarget instanceof Node && marker.contains(nextTarget)) return
      closeAliyahStartPopup()
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'focusin',
    (event) => {
      if (!isCompactReaderViewport()) return
      const marker = (event.target as Element | null)?.closest<HTMLButtonElement>(
        '.aliyah-start-marker'
      )
      const line = marker ? getAliyahStartMarkerLine(marker) : null
      if (line && marker) openAliyahStartPopup(line, marker)
    },
    { signal: scope.signal }
  )

  book.addEventListener('scroll', closeAliyahStartPopup, {
    passive: true,
    signal: scope.signal,
  })
  window.addEventListener(
    'resize',
    () => {
      closeAliyahStartPopup()
      if (aliyahStartMarkerResizeTimer !== null) {
        window.clearTimeout(aliyahStartMarkerResizeTimer)
      }
      aliyahStartMarkerResizeTimer = window.setTimeout(() => {
        aliyahStartMarkerResizeTimer = null
        if (!scope.signal.aborted) scheduleAliyahStartMarkerLayout(book)
      }, 120)
    },
    { signal: scope.signal }
  )
  void document.fonts.ready.then(() => {
    if (!scope.signal.aborted) scheduleAliyahStartMarkerLayout(book)
  })
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as Element | null
      if (!aliyahStartPopup || aliyahStartPopup.classList.contains('u-hidden')) return
      if (target && aliyahStartPopup.contains(target)) return
      if (target?.closest('.aliyah-start-marker')) return
      if (target?.closest('[data-aliyah-starts]')) return
      closeAliyahStartPopup()
    },
    { signal: scope.signal }
  )
  scope.own(() => {
    closeAliyahStartPopup()
    aliyahStartPopup?.remove()
    aliyahStartPopup = null
    if (aliyahStartMarkerResizeTimer !== null) {
      window.clearTimeout(aliyahStartMarkerResizeTimer)
      aliyahStartMarkerResizeTimer = null
    }
    if (aliyahStartMarkerLayoutFrame) {
      cancelAnimationFrame(aliyahStartMarkerLayoutFrame)
      aliyahStartMarkerLayoutFrame = 0
    }
  })
}

function setupShortcutCommands(scope: MountScope) {
  const commands: ShortcutCommand[] = [
    createShortcutCommand({
      id: 'palette.open',
      key: 'k',
      metaOrCtrl: true,
      modes: ['normal', 'practice-focus', 'admin-authoring'],
      run: toggleCommandPalette,
    }),
    createShortcutCommand({
      id: 'issue.mark',
      key: 'm',
      modes: ['admin-authoring'],
      run: () => cueAuthoringGlobal?.openIssue(),
    }),
    createShortcutCommand({
      id: 'phrase.replay',
      key: 'r',
      modes: ['admin-authoring'],
      run: () => {
        const controller = audioControllerGlobal
        if (!controller) return
        void controller.replayCurrentCue()
      },
    }),
  ]

  document.addEventListener(
    'keydown',
    (event) => {
      syncReaderMode()
      const command = getShortcutCommand(commands, event, currentReaderMode)
      if (!command) return
      const isPaletteToggleWhileOpen =
        command.id === 'palette.open' && isCommandPaletteOpen()
      if (isShortcutEditableTarget(event.target) && !isPaletteToggleWhileOpen) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      command.run()
    },
    { capture: true, signal: scope.signal }
  )
}

function getPreferredMobileAliyahRun(currentRun: LeiningRun | null) {
  const slugMatch = routeHashPath().match(/^#\/torah\/parsha\/([^/?]+)/)
  const routeSlug = slugMatch?.[1]
  if (!routeSlug || !display) return currentRun

  const resolved = resolveParshaRun(
    createCalendarGenerator(),
    decodeURIComponent(routeSlug)
  )
  const preferredRun = resolved
    ? display.viewModel.relevantRuns.find((run) => run.id === resolved.run.id) ?? null
    : null
  if (!preferredRun) return currentRun

  const preferredTitle = formatTopBarTitle(
    display.viewModel.displayTitleForRun(preferredRun)
  )
  return getTitleEl().textContent?.trim() === preferredTitle
    ? preferredRun
    : currentRun
}

function isMobileAliyahPickerOpen() {
  return mobileAliyahPicker?.isOpen() ?? false
}

function closeMobileAliyahPicker(
  options: {
    focusTarget?: HTMLElement
    restoreFocus?: boolean
  } = {}
) {
  mobileAliyahPicker?.close(options)
}

function openMobileAliyahPickerFromControl(control: HTMLElement) {
  mobileAliyahPicker?.open(control)
}

function getAliyahNavigationPlayback(
  audioController: AudioController | null = audioControllerGlobal
): AliyahNavigationPlayback {
  const session = audioController?.session
  return {
    target: session
      ? { runId: session.runId, aliyahIndex: session.aliyahIndex }
      : null,
    playing: Boolean(
      audioController &&
        session &&
        !audioController.audio.paused &&
        !audioController.audio.ended
    ),
    progressLabel:
      audioController && session
        ? `${formatDuration(audioController.currentTime)}/${formatDuration(
            audioController.duration
          )}`
        : '',
  }
}

function syncMobileAliyahPlaybackState(
  audioController: AudioController | null = audioControllerGlobal
) {
  mobileAliyahPicker?.syncPlayback(
    getAliyahNavigationPlayback(audioController)
  )
}

async function loadMobileAliyahDurationLabel(item: AliyahNavigationItem) {
  const recording = getAliyahNavigationRecording(item.target, {
    includePreviousOverlap: true,
  })
  if (!recording) return 'Available'
  const cues = await getCuesForRecording(recording)
  const lastCue = cues[cues.length - 1]
  const approximateDuration = lastCue?.timeEnd ?? lastCue?.timeStart ?? 0
  return approximateDuration > 0
    ? formatDuration(approximateDuration)
    : 'Available'
}

function renderMobileAliyahControls(snapshot: AliyahNavigationSnapshot) {
  mobileAliyahPicker?.render(snapshot)
}

function clearMobileAliyahControls() {
  mobileAliyahPicker?.clear()
}

function isAliyahRailRouteAvailable() {
  return parseCurrentRoute()?.view === 'reader' && !isShowingParshaPicker()
}

function scheduleAliyahRailHide(delayMs?: number) {
  desktopAliyahRail?.scheduleHide(delayMs)
}

function revealAliyahRail(
  state: 'peek' | 'expanded' = 'peek',
  options?: { autoHideMs?: number }
) {
  desktopAliyahRail?.reveal(state, options)
}

function revealAliyahRailForMovement() {
  desktopAliyahRail?.revealForMovement()
}

function getAliyahNavigationRecording(
  target: AliyahNavigationTarget,
  { includePreviousOverlap = false }: { includePreviousOverlap?: boolean } = {}
) {
  const run =
    display?.viewModel.relevantRuns.find(
      (candidate) => candidate.id === target.runId
    ) ?? createCalendarGenerator().parseId(target.runId)
  if (!run) return null
  const recording = findRecordingForRun({
    narratorId: readerPreferences.narratorId,
    run,
    aliyahIndex: target.aliyahIndex,
  })
  return recording ??
    (includePreviousOverlap
      ? getPreviousOverlapRecording(run, target.aliyahIndex)
      : null)
}

function createNavigationSnapshotForEntries(
  entries: ReturnType<typeof getAliyahNavigationEntriesForRun>,
  active: AliyahNavigationTarget | null,
  playback: AliyahNavigationPlayback
) {
  return createAliyahNavigationSnapshot({
    entries,
    active,
    playback,
    signaturePrefix: readerPreferences.narratorId,
    getAudioKey: ({ run, aliyah }) => {
      const recording = findRecordingForRun({
        narratorId: readerPreferences.narratorId,
        run,
        aliyahIndex: aliyah.index,
      })
      return (
        recording ?? getPreviousOverlapRecording(run, aliyah.index)
      )?.id ?? null
    },
  })
}

function renderAliyahRail(range: ViewportRange | null = latestViewportRange) {
  if (!isAliyahRailRouteAvailable()) {
    desktopAliyahRail?.clear()
    clearCurrentAliyahAudioPreload()
    clearMobileAliyahControls()
    return
  }

  const anchors = getAliyahProgressAnchors()
  const current = getCurrentAliyahFromViewportRange(range, anchors)
  const currentRun = current?.run ?? anchors.find((anchor) => anchor.run)?.run ?? null

  if (!currentRun) {
    desktopAliyahRail?.clear()
    clearCurrentAliyahAudioPreload()
    clearMobileAliyahControls()
    return
  }

  const playback = getAliyahNavigationPlayback()
  const currentTarget =
    current?.run && current.aliyahIndex
      ? { runId: current.run.id, aliyahIndex: current.aliyahIndex }
      : null
  const desktopEntries = getAliyahNavigationEntriesForRun(currentRun)
  const desktopSnapshot = createNavigationSnapshotForEntries(
    desktopEntries,
    currentTarget,
    playback
  )
  const mobileRun = getPreferredMobileAliyahRun(currentRun) ?? currentRun
  const mobileEntries = getAliyahNavigationEntriesForRun(mobileRun)
  const mobileActive = resolveActiveTargetForRun({
    runId: mobileRun.id,
    current: currentTarget,
    playback,
    first: mobileEntries[0]
      ? {
          runId: mobileEntries[0].run.id,
          aliyahIndex: mobileEntries[0].aliyah.index,
        }
      : null,
  })
  const mobileSnapshot = createNavigationSnapshotForEntries(
    mobileEntries,
    mobileActive,
    playback
  )

  syncCurrentAliyahAudioPreload(
    currentRun,
    currentTarget?.aliyahIndex ?? null
  )
  scheduleAliyahResourcePrewarm(desktopEntries, desktopSnapshot.signature)
  desktopAliyahRail?.render(desktopSnapshot)
  renderMobileAliyahControls(mobileSnapshot)
}

function invalidateAliyahRailRender() {
  desktopAliyahRail?.invalidate()
  mobileAliyahPicker?.invalidate()
}

function setAliyahNavigationActiveTarget(
  runId: string | null,
  aliyahIndex: PlaybackAliyahIndex | null
) {
  const target = runId && aliyahIndex ? { runId, aliyahIndex } : null
  desktopAliyahRail?.setActive(target)
  mobileAliyahPicker?.setActive(target)
}

function selectAndScrollToAliyah(
  runId: string,
  aliyahIndex: PlaybackAliyahIndex
) {
  const now = performance.now()
  pendingAliyahRailSelection = {
    runId,
    aliyahIndex,
    expiresAt: now + 2500,
    maxExpiresAt: now + 6000,
  }
  selectAliyah({ runId, index: aliyahIndex })
  setAliyahNavigationActiveTarget(runId, aliyahIndex)

  const actionToken = railScrollAction.start()
  void scrollToAliyahMarker(runId, aliyahIndex, actionToken)
}

function setupAliyahNavigationChrome(
  scope: MountScope,
  audioController: AudioController,
  highlightController: HighlightController
) {
  const requiredElement = <T extends Element>(selector: string) => {
    const element = document.querySelector<T>(selector)
    if (!element) {
      throw new Error(`Reader shell is missing required element: ${selector}`)
    }
    return element
  }

  const rail = requiredElement<HTMLElement>('[data-target-id="aliyah-rail"]')
  const toolbar = requiredElement<HTMLElement>('.app-toolbar')
  const picker = requiredElement<HTMLElement>(
    '[data-target-id="mobile-aliyah-picker"]'
  )
  const toggle = requiredElement<HTMLButtonElement>(
    '[data-target-id="mobile-aliyah-picker-toggle"]'
  )
  const mobileLabel = requiredElement<HTMLElement>(
    '[data-target-id="mobile-current-aliyah"]'
  )
  const speaker = requiredElement<HTMLElement>(
    '[data-target-id="mobile-aliyah-picker-speaker"]'
  )
  const chevron = requiredElement<HTMLElement>(
    '[data-target-id="mobile-aliyah-picker-chevron"]'
  )
  const grid = requiredElement<HTMLElement>(
    '[data-target-id="mobile-aliyah-grid"]'
  )
  const segments = requiredElement<HTMLElement>(
    '[data-target-id="mobile-aliyah-segments"]'
  )
  const backdrop = requiredElement<HTMLElement>(
    '[data-target-id="mobile-aliyah-picker-backdrop"]'
  )
  const closeButton = requiredElement<HTMLElement>(
    '[data-target-id="mobile-aliyah-picker-close"]'
  )
  const libraryButton = requiredElement<HTMLButtonElement>(
    '[data-target-id="mobile-library"]'
  )

  const desktopAdapter = createDesktopAliyahRail(scope, {
    root: rail,
    toolbar,
    onSelect: (target) =>
      selectAndScrollToAliyah(target.runId, target.aliyahIndex),
    onHidden: closeAliyahStartPopup,
    loadCueStatus: (item) =>
      getAliyahRailCueStatus(
        getAliyahNavigationRecording(item.target)
      ),
    onLoadError: (error, item) => {
      console.error(`Failed to load Cue Data status for ${item.key}`, error)
    },
  })

  const mobileAdapter = createMobileAliyahPicker(scope, {
    picker,
    toggle,
    label: mobileLabel,
    speaker,
    chevron,
    segments,
    grid,
    backdrop,
    closeButton,
    onSelect: (target) =>
      selectAndScrollToAliyah(target.runId, target.aliyahIndex),
    onPlay: async (target) => {
      await startPlaybackForToolbarCurrentAliyah(
        target,
        audioController,
        highlightController
      )
      if (!scope.signal.aborted) saveCurrentLastReading()
      return getAliyahNavigationPlayback(audioController)
    },
    onBeforeOpen: () => {
      if (audioController.session && !audioController.audio.paused) {
        audioController.pause()
      }
      return getAliyahNavigationPlayback(audioController)
    },
    onAfterNavigate: focusReaderSurface,
    focusReturnTarget: focusOverlayReturnTarget,
    getReaderFocusTarget: getBook,
    loadDurationLabel: loadMobileAliyahDurationLabel,
    onLoadError: (error, item) => {
      console.error(
        `Failed to load duration for ${item.audioKey ?? item.key}`,
        error
      )
    },
  })

  desktopAliyahRail = desktopAdapter
  mobileAliyahPicker = mobileAdapter
  scope.own(() => {
    if (desktopAliyahRail === desktopAdapter) desktopAliyahRail = null
    if (mobileAliyahPicker === mobileAdapter) mobileAliyahPicker = null
  })

  libraryButton.addEventListener('click', () => {
    closeMobileAliyahPicker()
    toggleAboutRoute(audioController)
  }, { signal: scope.signal })
}

function extendPendingAliyahRailSelectionForScroll() {
  if (!pendingAliyahRailSelection) return
  pendingAliyahRailSelection.expiresAt = Math.min(
    pendingAliyahRailSelection.maxExpiresAt,
    performance.now() + 500
  )
}

async function getAliyahRailCueStatus(
  recording: AudioRecording | null
): Promise<AliyahCueStatus> {
  if (!recording) return 'none'

  const progress = await getCueProgressForRecording(recording)
  const draftSummary = readAdminDraftSummary(recording.id)
  if (draftSummary?.cueCount) {
    const draft = loadAdminDraft(recording.id, draftSummary.tokenCount)
    const publishedCues = await getCuesForRecording(recording)
    if (
      !publishedCues.length ||
      !draft ||
      !areCueDraftsEquivalent(draft.cues, publishedCues)
    ) {
      return 'local-draft'
    }
  }

  if (progress?.isComplete) return 'published'
  if (progress?.isUnfinished) return 'pending'

  return 'none'
}

async function loadIssuesForActiveSession() {
  const session = audioControllerGlobal?.session
  const recording =
    cueAuthoringGlobal?.isVisible() && cueAuthoringGlobal.getSession()
    ? session?.recording ?? null
    : audioControllerGlobal?.activeSegment?.recording ?? session?.recording ?? null
  const actionToken = recordingIssueLoadAction.start()
  activeRecordingIssues = []
  cueAuthoringGlobal?.recordingIssuesChanged()
  applyReaderVisibleIssueMarkers()
  syncActiveReaderIssueNotice()

  if (session && recording) {
    let publishedIssues: RecordingIssue[] = []
    try {
      publishedIssues = await getIssuesForRecording(
        recording,
        TOKENIZATION_VERSION
      )
    } catch (error) {
      console.error(`Failed to load published recording issues for ${recording.id}`, error)
    }
    const currentRecording =
      cueAuthoringGlobal?.isVisible() && cueAuthoringGlobal.getSession()
      ? audioControllerGlobal?.session?.recording ?? null
      : audioControllerGlobal?.activeSegment?.recording ??
        audioControllerGlobal?.session?.recording ??
        null
    if (
      !recordingIssueLoadAction.isCurrent(actionToken) ||
      audioControllerGlobal?.session !== session ||
      currentRecording?.id !== recording.id
    ) return
    let localIssues: RecordingIssue[] = []
    try {
      localIssues = loadRecordingIssues(
        browserLocalStorage,
        recording.id,
        TOKENIZATION_VERSION
      )
    } catch (error) {
      console.error(`Recording issue storage is unavailable for ${recording.id}`, error)
    }
    activeRecordingIssues = mergeRecordingIssues(
      publishedIssues,
      localIssues
    )
    cueAuthoringGlobal?.recordingIssuesChanged()
    applyReaderVisibleIssueMarkers()
    syncActiveReaderIssueNotice()
  }

  commandPaletteGlobal?.refresh()
}

function applyReaderVisibleIssueMarkers(root: ParentNode = getBook()) {
  root.querySelectorAll<HTMLElement>('.word[data-recording-issue]').forEach((word) => {
    word.removeAttribute('data-recording-issue')
    word.removeAttribute('title')
  })

  for (const issue of getReaderVisibleIssues(activeRecordingIssues)) {
    root
      .querySelectorAll<HTMLElement>(`[data-token-key="${issue.tokenKey}"]`)
      .forEach((word) => {
        word.dataset.recordingIssue = issue.kind
        word.title = recordingIssueReaderLabel(issue)
      })
  }
}

function syncActiveReaderIssueNotice() {
  const toast = document.querySelector<HTMLElement>('[data-target-id="reader-issue-toast"]')
  if (!toast) return

  const tokenKey = getActiveTokenKey()
  const issue = tokenKey
    ? getReaderVisibleIssues(activeRecordingIssues).find((candidate) => candidate.tokenKey === tokenKey)
    : null

  if (!issue) {
    toast.classList.add('u-hidden')
    toast.textContent = ''
    return
  }

  toast.textContent = issue.note?.trim() || recordingIssueReaderLabel(issue)
  toast.classList.remove('u-hidden')
}


function getAudioButtonElements() {
  return [
    ...document.querySelectorAll<HTMLButtonElement>('[data-audio-button="true"]'),
  ]
}

function showOfflinePrompt({ force = false }: { force?: boolean } = {}) {
  offlineRecordingPromptGlobal?.show({ force })
}

function hideOfflinePrompt() {
  offlineRecordingPromptGlobal?.hide()
}

function setPendingNetworkRecordingRetry(retry?: () => Promise<void>) {
  const lifetime = readerRuntimeLifetime
  offlineRecordingPromptGlobal?.setPendingRetry(
    retry,
    lifetime ? () => lifetime.isCurrent() : undefined
  )
}

function canPlayNetworkRecording(retry?: () => Promise<void>) {
  const lifetime = readerRuntimeLifetime
  return (
    offlineRecordingPromptGlobal?.canUseNetwork(
      retry,
      lifetime ? () => lifetime.isCurrent() : undefined
    ) ?? navigator.onLine
  )
}

async function playNetworkRecording(
  audioController: AudioController,
  retry?: () => Promise<void>
) {
  if (audioController.audio.paused && !canPlayNetworkRecording(retry)) return false
  try {
    await audioController.play()
    return true
  } catch {
    return false
  }
}

async function replayNetworkRecordingFromStart(
  audioController: AudioController,
  retry?: () => Promise<void>
) {
  if (!canPlayNetworkRecording(retry)) return false
  try {
    await audioController.replayFromStart()
    return true
  } catch {
    return false
  }
}

function parsePlaybackAliyahIndex(
  value: string | undefined
): PlaybackAliyahIndex | null {
  return parseAliyahIndex(value)
}

function isCurrentPlaybackTarget(
  audioController: AudioController | undefined,
  {
    recording,
    runId,
    aliyahIndex,
  }: {
    recording: AudioRecording | null | undefined
    runId: string | undefined
    aliyahIndex: PlaybackAliyahIndex | null | undefined
  }
) {
  return Boolean(
    runId &&
      aliyahIndex &&
      isActivePlaybackTarget(audioController?.session, {
        recordingId: recording?.id,
        runId,
        aliyahIndex,
      })
  )
}

function aliyahMarkerSelector(runId: string, aliyahIndex: PlaybackAliyahIndex) {
  return `[data-aliyah-marker="true"][data-run-id="${runId}"][data-aliyah-index="${aliyahIndex}"]`
}

function isLastAliyahInRun(runId: string, aliyahIndex: PlaybackAliyahIndex) {
  const run = display?.viewModel.relevantRuns.find((candidate) => candidate.id === runId)
  return isLastIndexedAliyahInRun(run, aliyahIndex)
}

function isLastAliyahProgressAnchor(anchor: AliyahProgressAnchor | null | undefined) {
  return Boolean(
    anchor?.run?.id &&
      anchor.aliyahIndex &&
      isLastAliyahInRun(anchor.run.id, anchor.aliyahIndex)
  )
}

const aliyahTargetLocationCache = new AliyahTargetLocationCache()
const aliyahMarkerElementsByKey = new Map<string, HTMLElement>()
const renderedLinesByLocationKey = new Map<string, HTMLElement>()
const railScrollAction = new LatestAction()
const playbackAction = new LatestAction()
const recordingIssueLoadAction = new LatestAction()
let aliyahResourcePrewarmTimer = 0
let aliyahResourcePrewarmSignature: string | null = null
let currentAliyahAudioPreload: HTMLAudioElement | null = null
const PLAYBACK_IDLE_BACKGROUND_DELAY_MS = 900
const pageVirtualizationSettings = createPageVirtualizationSettings({
  search: location.search,
  storage: browserLocalStorage,
})
const pageVirtualizationMetrics = createPageVirtualizationMetrics()
const PAGE_WINDOW_POLICY_CONFIG: PageWindowPolicyConfig = {
  viewportRadius: 2,
  playbackForwardPageCount: 2,
}
const VIEWPORT_PLACEHOLDER_REMOUNT_MARGIN_RATIO = 2
let latestRailTargetPageNumber: number | null = null
let latestPageVirtualizationApplication: PageVirtualizationApplication = {
  enabled: pageVirtualizationSettings.state().enabled,
  evictedPages: [],
}
let pageVirtualizationEvictionPauseDepth = 0
let pageVirtualizationReadyForDisplay: ScrollDisplay | null = null
let viewportPlaceholderRemountFrame = 0
const NAVIGATION_VIRTUALIZATION_HOLD_MS = 1400

function getAliyahTargetKey(
  runId: string,
  aliyahIndex: PlaybackAliyahIndex
) {
  return `${runId}:${aliyahIndex}`
}

function holdPageVirtualizationEviction() {
  pageVirtualizationEvictionPauseDepth += 1
  let released = false
  let holdTimer = 0

  const release = () => {
    if (released) return
    released = true
    if (holdTimer) window.clearTimeout(holdTimer)
    pageVirtualizationEvictionPauseDepth = Math.max(
      0,
      pageVirtualizationEvictionPauseDepth - 1
    )
    if (pageVirtualizationEvictionPauseDepth === 0) applyPageVirtualization()
  }

  return {
    release,
    releaseAfterNavigation() {
      // A scrollend from the gesture that revealed the rail can arrive after
      // navigation starts, so use a bounded hold instead of that shared event.
      holdTimer = window.setTimeout(
        release,
        NAVIGATION_VIRTUALIZATION_HOLD_MS
      )
    },
  }
}

function getRenderedLineLocationKey(pageNumber: number, lineIndex: number) {
  return `${pageNumber}:${lineIndex}`
}

function getPageNumberFromRenderedLineLocationKey(key: string) {
  const [pageNumber] = key.split(':').map(Number)
  return Number.isInteger(pageNumber) ? pageNumber : null
}

function resetAliyahDomCaches() {
  aliyahTargetLocationCache.clear()
  aliyahMarkerElementsByKey.clear()
  renderedLinesByLocationKey.clear()
  recordingSessionGlobal?.reset()
  railScrollAction.cancel()
  playbackAction.cancel()
  if (aliyahResourcePrewarmTimer) {
    cancelIdleTask(aliyahResourcePrewarmTimer)
    aliyahResourcePrewarmTimer = 0
  }
  aliyahResourcePrewarmSignature = null
  clearCurrentAliyahAudioPreload()
  latestRailTargetPageNumber = null
  latestPageVirtualizationApplication = {
    enabled: pageVirtualizationSettings.state().enabled,
    evictedPages: [],
  }
  pageVirtualizationMetrics.reset()
  pageVirtualizationReadyForDisplay = null
  cancelViewportPlaceholderRemount()
  progressAnchorLoadPromise = null
}

function getReaderDiagnosticsSnapshot() {
  const pageWindowPolicy = getPageWindowPolicySnapshot()

  return {
    pages: display?.getPageLifecycleSnapshot() ?? null,
    pageWindowPolicy,
    pageVirtualization: getPageVirtualizationDiagnostics(),
    caches: {
      aliyahTokenKeys: recordingSessionGlobal?.tokenCacheSize() ?? 0,
      aliyahTargetLocations: aliyahTargetLocationCache.size,
      aliyahMarkerElements: aliyahMarkerElementsByKey.size,
      renderedLines: renderedLinesByLocationKey.size,
    },
  }
}

window.tikkunReaderDiagnostics = getReaderDiagnosticsSnapshot

window.tikkunReaderVirtualization = {
  state: getPageVirtualizationDiagnostics,
  enable: () => setPageVirtualizationEnabled(true),
  disable: () => setPageVirtualizationEnabled(false),
  setEnabled: (enabled: boolean) => setPageVirtualizationEnabled(enabled),
  resetMetrics() {
    pageVirtualizationMetrics.reset()
    return getPageVirtualizationDiagnostics()
  },
  applyNow() {
    applyPageVirtualization()
    return getPageVirtualizationDiagnostics()
  },
  async remountAll() {
    await remountAllEvictedPages()
    return getPageVirtualizationDiagnostics()
  },
}

function getPageVirtualizationDiagnostics(): PageVirtualizationDiagnostics {
  const settings = pageVirtualizationSettings.state()
  return {
    enabled: settings.enabled,
    source: settings.source,
    latestApplication: latestPageVirtualizationApplication,
    metrics: pageVirtualizationMetrics.snapshot(),
  }
}

function setPageVirtualizationEnabled(enabled: boolean) {
  const settings = pageVirtualizationSettings.setEnabled(enabled)
  if (settings.source === 'memory') {
    showPersistenceNotice('Page virtualization changed for this session but could not be saved.')
  }
  latestPageVirtualizationApplication = {
    ...latestPageVirtualizationApplication,
    enabled: settings.enabled,
  }
  pageVirtualizationMetrics.recordToggle(settings)
  applyPageVirtualization()
  return getPageVirtualizationDiagnostics()
}

async function remountAllEvictedPages() {
  const targetDisplay = display
  const lifetime = readerRuntimeLifetime
  if (!targetDisplay || !lifetime?.isCurrent()) return []
  const evictedPages = targetDisplay
    .getPageLifecycleSnapshot()
    .pages.filter((page) => page.state === 'evicted')
    .map((page) => page.pageNumber)
  const remountedPages: number[] = []
  pageVirtualizationEvictionPauseDepth += 1
  try {
    for (const pageNumber of evictedPages) {
      if (!lifetime.isCurrent() || display !== targetDisplay) break
      const mounted = await targetDisplay.ensurePageMounted(pageNumber)
      if (mounted) remountedPages.push(pageNumber)
    }
  } finally {
    pageVirtualizationEvictionPauseDepth = Math.max(
      0,
      pageVirtualizationEvictionPauseDepth - 1
    )
  }
  return remountedPages
}

function scheduleViewportPlaceholderRemount() {
  if (!isPageVirtualizationReady()) return
  if (viewportPlaceholderRemountFrame) return
  viewportPlaceholderRemountFrame = requestAnimationFrame(() => {
    viewportPlaceholderRemountFrame = 0
    void remountEvictedPagesNearViewport().catch((error) => {
      console.error('Failed to remount pages near the reader viewport', error)
    })
  })
}

function cancelViewportPlaceholderRemount() {
  if (!viewportPlaceholderRemountFrame) return
  cancelAnimationFrame(viewportPlaceholderRemountFrame)
  viewportPlaceholderRemountFrame = 0
}

async function remountEvictedPagesNearViewport() {
  const targetDisplay = display
  const lifetime = readerRuntimeLifetime
  if (!targetDisplay || !lifetime?.isCurrent()) return []
  const marginPx =
    targetDisplay.root.clientHeight * VIEWPORT_PLACEHOLDER_REMOUNT_MARGIN_RATIO
  const evictedPages = targetDisplay.getEvictedPageNumbersNearViewport({ marginPx })
  if (!evictedPages.length) return []

  pageVirtualizationEvictionPauseDepth += 1
  try {
    const remounted = await targetDisplay.ensureEvictedPagesMountedNearViewport({ marginPx })
    if (lifetime.isCurrent() && display === targetDisplay) {
      viewportTrackerGlobal?.refresh()
      updateReaderProgress()
    }
    return remounted
  } finally {
    pageVirtualizationEvictionPauseDepth = Math.max(
      0,
      pageVirtualizationEvictionPauseDepth - 1
    )
  }
}

function getPageWindowPolicySnapshot() {
  return display
    ? computePageWindowPolicy({
        mountedPageNumbers: display.getMountedPageNumbers(),
        viewportPageNumber: display.getViewportAnchorPageNumber(),
        railTargetPageNumber: latestRailTargetPageNumber,
        playbackPageNumbers: getPlaybackProtectedPageNumbers(),
        config: PAGE_WINDOW_POLICY_CONFIG,
      })
    : null
}

function applyPageVirtualization() {
  const targetDisplay = display
  if (!targetDisplay) return latestPageVirtualizationApplication
  if (!isPageVirtualizationReady()) return latestPageVirtualizationApplication
  const policy = getPageWindowPolicySnapshot()
  if (!policy) return latestPageVirtualizationApplication
  const settings = pageVirtualizationSettings.state()
  const evictionEnabled =
    settings.enabled && pageVirtualizationEvictionPauseDepth === 0
  const application = applyPageWindowPolicyEviction({
    enabled: evictionEnabled,
    policy,
    evictPages: (pageNumbers) => targetDisplay.evictPages(pageNumbers),
  })
  latestPageVirtualizationApplication = {
    enabled: settings.enabled,
    evictedPages: application.evictedPages,
  }
  const lifecycle = targetDisplay.getPageLifecycleSnapshot()
  pageVirtualizationMetrics.recordPolicyApplication({
    enabled: evictionEnabled,
    source: settings.source,
    policy,
    evictedPages: latestPageVirtualizationApplication.evictedPages,
    mountedPageCount: lifecycle.mountedPageCount,
    knownPageCount: lifecycle.pages.length,
    evictedPageCount: countEvictedLifecyclePages(lifecycle),
  })
  return latestPageVirtualizationApplication
}

function markPageVirtualizationReady(displayToMark: ScrollDisplay) {
  if (display !== displayToMark) return
  pageVirtualizationReadyForDisplay = displayToMark
}

function isPageVirtualizationReady() {
  return Boolean(display && pageVirtualizationReadyForDisplay === display)
}

function countEvictedLifecyclePages(lifecycle: PageLifecycleSnapshot) {
  return lifecycle.pages.filter((page) => page.state === 'evicted').length
}

function getPlaybackProtectedPageNumbers(
  audioController = audioControllerGlobal,
  highlightController = highlightControllerGlobal
) {
  const session = audioController?.session
  if (!audioController || !session?.cues.length || !highlightController) return []

  const cueIndex = Math.max(
    0,
    highlightController.getCueIndex(
      session.cues,
      audioController.currentTime
    )
  )
  const protectedPages: number[] = []

  for (
    let index = cueIndex;
    index < session.cues.length &&
    protectedPages.length <= PAGE_WINDOW_POLICY_CONFIG.playbackForwardPageCount;
    index += 1
  ) {
    const pageNumber = session.cues[index]?.pageNumber
    if (
      Number.isInteger(pageNumber) &&
      pageNumber > 0 &&
      !protectedPages.includes(pageNumber)
    ) {
      protectedPages.push(pageNumber)
    }
  }

  return protectedPages
}

function isPlaybackActive(audioController = audioControllerGlobal) {
  const audio = audioController?.audio
  return Boolean(audio && !audio.paused && !audio.ended)
}

function cancelAliyahResourcePrewarm() {
  if (!aliyahResourcePrewarmTimer) return
  cancelIdleTask(aliyahResourcePrewarmTimer)
  aliyahResourcePrewarmTimer = 0
}

function clearCurrentAliyahAudioPreload() {
  currentAliyahAudioPreload?.pause()
  currentAliyahAudioPreload?.removeAttribute('src')
  currentAliyahAudioPreload?.load()
  currentAliyahAudioPreload = null
}

function syncCurrentAliyahAudioPreload(
  run: LeiningRun,
  aliyahIndex: PlaybackAliyahIndex | null
) {
  const recording = aliyahIndex
    ? findRecordingForRun({
        narratorId: readerPreferences.narratorId,
        run,
        aliyahIndex,
      })
    : null
  const fallbackRecording = aliyahIndex
    ? getPreviousOverlapRecording(run, aliyahIndex)
    : null
  const src = recording?.playSrc ?? fallbackRecording?.playSrc ?? null
  const absoluteSrc = src ? new URL(src, location.href).href : null
  if (currentAliyahAudioPreload?.src === absoluteSrc) return

  clearCurrentAliyahAudioPreload()
  if (!src) return

  const preload = new Audio()
  preload.preload = 'metadata'
  preload.src = src
  preload.load()
  currentAliyahAudioPreload = preload
}

function indexAliyahDomTargets(root: ParentNode) {
  getRenderedLineElements(root).forEach((line) => {
    const pageNumber = Number(line.dataset.pageNumber)
    const lineIndex = Number(line.dataset.lineIndex)
    if (Number.isFinite(pageNumber) && Number.isFinite(lineIndex)) {
      renderedLinesByLocationKey.set(
        getRenderedLineLocationKey(pageNumber, lineIndex),
        line
      )
    }
  })

  root.querySelectorAll<HTMLElement>('[data-aliyah-marker="true"]').forEach((marker) => {
    const runId = marker.dataset.runId
    const aliyahIndex = parsePlaybackAliyahIndex(marker.dataset.aliyahIndex)
    if (!runId || !aliyahIndex) return
    aliyahMarkerElementsByKey.set(
      getAliyahTargetKey(runId, aliyahIndex),
      marker
    )
  })
}

function unindexAliyahDomTargetsForPage(pageNumber: number) {
  for (const [key] of renderedLinesByLocationKey) {
    if (getPageNumberFromRenderedLineLocationKey(key) === pageNumber) {
      renderedLinesByLocationKey.delete(key)
    }
  }

  for (const [key, marker] of aliyahMarkerElementsByKey) {
    if (pageNumberFromMountedElement(marker) === pageNumber || !marker.isConnected) {
      aliyahMarkerElementsByKey.delete(key)
    }
  }
}

function scheduleIdleTask(task: () => void) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback) => number
    cancelIdleCallback?: (handle: number) => void
  }

  if (idleWindow.requestIdleCallback) {
    return idleWindow.requestIdleCallback(task)
  }

  return window.setTimeout(task, 150)
}

function cancelIdleTask(handle: number) {
  const idleWindow = window as Window & {
    cancelIdleCallback?: (handle: number) => void
  }
  idleWindow.cancelIdleCallback?.(handle)
  window.clearTimeout(handle)
}

function scheduleAliyahResourcePrewarm(
  railItems: ReturnType<typeof getAliyahNavigationEntriesForRun>,
  signature: string
) {
  const displayToPrewarm = display
  if (!displayToPrewarm) return
  if (signature === aliyahResourcePrewarmSignature) return
  aliyahResourcePrewarmSignature = signature
  cancelAliyahResourcePrewarm()

  let index = 0
  const prefetchedPages = new Set<string>()
  const prewarmNext = () => {
    aliyahResourcePrewarmTimer = 0

    if (
      display !== displayToPrewarm ||
      signature !== aliyahResourcePrewarmSignature
    ) {
      return
    }

    if (isPlaybackActive()) {
      aliyahResourcePrewarmTimer = window.setTimeout(
        prewarmNext,
        PLAYBACK_IDLE_BACKGROUND_DELAY_MS
      )
      return
    }

    const item = railItems[index]
    if (!item) return
    index += 1

    const prewarmPromise = (async () => {
      const { run, aliyah } = item
      if (!aliyah.index) return
      const location = await getAliyahStartLocationForRun(run.id, aliyah.index)
      const prefetchKey = location
        ? `${run.id}:${location.pageNumber}`
        : null
      if (
        location &&
        prefetchKey &&
        !prefetchedPages.has(prefetchKey) &&
        display === displayToPrewarm
      ) {
        prefetchedPages.add(prefetchKey)
        await displayToPrewarm.viewModel.fetchPageByPageNumber(
          location.pageNumber,
          { runId: run.id }
        )
      }
      if (display !== displayToPrewarm) return

      const recording = findRecordingForRun({
        narratorId: readerPreferences.narratorId,
        run,
        aliyahIndex: aliyah.index,
      })
      if (recording) {
        await getCuesForRecording(recording)
      }
    })()
    void prewarmPromise
      .catch((error) => {
        console.error('Failed to prewarm aliyah resources', error)
      })
      .finally(() => {
        if (
          index < railItems.length &&
          display === displayToPrewarm &&
          signature === aliyahResourcePrewarmSignature
        ) {
          aliyahResourcePrewarmTimer = scheduleIdleTask(prewarmNext)
        }
      })
  }

  void displayToPrewarm.scrolled.then(() => {
    if (
      display !== displayToPrewarm ||
      signature !== aliyahResourcePrewarmSignature
    ) {
      return
    }
    aliyahResourcePrewarmTimer = scheduleIdleTask(prewarmNext)
  })
}

function setControlIcon(element: HTMLElement | null, icon: IconName) {
  if (!element) return
  element.innerHTML = iconMarkup(icon)
}

function applyRecordingModePageLabels(root: ParentNode) {
  if (!recordingMode.enabled) return

  root.querySelectorAll<HTMLElement>('[data-aliyah-marker="true"]').forEach((marker) => {
    const label = marker.querySelector<HTMLElement>('.aliyah-label-text')
    if (!label) return
    const aliyahIndex = marker.dataset.aliyahIndex
      ? Number(marker.dataset.aliyahIndex)
      : null
    label.textContent = recordingModeAliyahLabel(label.textContent ?? '', aliyahIndex)
  })
}

function scheduleAliyahStartMarkerLayout(book: HTMLElement) {
  if (aliyahStartMarkerLayoutFrame) return
  aliyahStartMarkerLayoutFrame = requestAnimationFrame(() => {
    aliyahStartMarkerLayoutFrame = 0
    applyAliyahStartWordMarkers(book)
  })
}

function applyAliyahStartWordMarkers(
  book: HTMLElement,
  root: ParentNode = book
) {
  if (
    aliyahStartPopupMarker &&
    root instanceof Node &&
    root.contains(aliyahStartPopupMarker)
  ) {
    closeAliyahStartPopup()
  }
  root
    .querySelectorAll<HTMLButtonElement>('.aliyah-start-marker')
    .forEach((marker) => marker.remove())

  const legacyLetters = [...root.querySelectorAll<HTMLElement>('.aliyah-start-letter')]
  if (legacyLetters.length) {
    root.querySelectorAll('.aliyah-start-chevron').forEach((marker) => marker.remove())
    legacyLetters.forEach((letter) => letter.replaceWith(...letter.childNodes))
    if (root instanceof Node) root.normalize()
  }

  root
    .querySelectorAll<HTMLElement>('[data-line-index][data-aliyah-starts]')
    .forEach((line) => {
      const lineInfo = getLineInfoFromElement(line)
      if (!lineInfo?.aliyahStarts.length) return
      const content = line.querySelector<HTMLElement>('.line-content')
      if (!content) return

      const startsByTokenKey = new Map<string, typeof lineInfo.aliyahStarts>()
      lineInfo.aliyahStarts.forEach((aliyah) => {
        const startVerseOrdinal = lineInfo.verses.findIndex(
          (verse) => compareRefs(verse, aliyah.start) === 0
        )
        const tokenKey = firstTokenKeyForExactAliyahStart({
          book,
          startLine: line,
          startVerseOrdinal,
        })
        if (!tokenKey) return

        const starts = startsByTokenKey.get(tokenKey)
        if (starts) starts.push(aliyah)
        else startsByTokenKey.set(tokenKey, [aliyah])
      })

      startsByTokenKey.forEach((starts, tokenKey) => {
        const label = starts
          .map((aliyah) => parsePlaybackAliyahIndex(`${aliyah.index ?? ''}`))
          .filter((index): index is PlaybackAliyahIndex => Boolean(index))
          .map(formatAliyahLabel)
          .join(', ')
        if (!label) return
        const graphemeRect = [
          ...line.querySelectorAll<HTMLElement>(
            `.word[data-token-key="${tokenKey}"]`
          ),
        ]
          .map((word) => getFirstGraphemeRect(word))
          .find((rect) => rect !== null)
        if (!graphemeRect) return

        const position = getAliyahStartMarkerPosition(
          content.getBoundingClientRect(),
          graphemeRect
        )
        const marker = createAliyahStartMarker({ label, tokenKey })
        marker.dataset.aliyahStartLabel = label
        marker.style.setProperty('--aliyah-start-anchor-x', `${position.x}px`)
        marker.style.setProperty('--aliyah-start-anchor-y', `${position.y}px`)
        content.append(marker)
      })
    })
}

function getAliyahProgressAnchors(): AliyahProgressAnchor[] {
  const book = getBook()
  const bookRect = book.getBoundingClientRect()

  return [...book.querySelectorAll<HTMLElement>('[data-line-index][data-aliyah-starts]')]
    .map((line) => {
      const rect = line.getBoundingClientRect()
      const label = line.querySelector('.aliyah-label-text')?.textContent?.trim() ?? '—'
      const aliyahStarts = (line.dataset.aliyahStarts ?? '').split(',')
      const aliyahIndex = parsePlaybackAliyahIndex(aliyahStarts[aliyahStarts.length - 1])
      const lineInfo = getLineInfoFromElement(line)
      const progressLabel = aliyahStarts.includes('1') ? 'ראשון' : label
      return {
        line,
        label: progressLabel,
        run: lineInfo?.run ?? null,
        aliyahIndex,
        position: book.scrollTop + (rect.top - bookRect.top),
      }
    })
    .sort((a, b) => a.position - b.position)
}

function getCurrentAliyahFromViewportRange(
  range: ViewportRange | null,
  anchors: AliyahProgressAnchor[]
): AliyahProgressAnchor | null {
  const center = range?.center
  const centerRun = center?.run
  const memberships = center
    ? aliyahMembershipsForFocalLine({
        runs: display?.viewModel.relevantRuns ?? (centerRun ? [centerRun] : []),
        lineRun: centerRun,
        focalRef: center.focalRef,
        aliyot: center.aliyot,
        aliyahStarts: center.aliyahStarts,
      })
    : []

  let pending: AliyahIdentity | null = pendingAliyahRailSelection
    ? {
        runId: pendingAliyahRailSelection.runId,
        index: pendingAliyahRailSelection.aliyahIndex,
      }
    : null
  if (pendingAliyahRailSelection) {
    const expired = pendingAliyahRailSelection.expiresAt <= performance.now()
    const caughtUp = memberships.some((membership) =>
      isSameAliyahIdentity(membership, pending)
    )
    if (expired || caughtUp) {
      pendingAliyahRailSelection = null
      pending = null
    }
  }

  const playbackSession = audioControllerGlobal?.session
  const playback =
    playbackSession && isPlaybackActive(audioControllerGlobal)
      ? {
          runId: playbackSession.runId,
          index: playbackSession.aliyahIndex,
        }
      : null
  const activeIdentity = resolveActiveAliyahIdentity({
    memberships,
    playback,
    pending,
    explicit: explicitAliyahSelection,
  })
  if (!activeIdentity) return null

  if (
    explicitAliyahSelection &&
    !pending &&
    !playback &&
    !memberships.some((membership) =>
      isSameAliyahIdentity(membership, explicitAliyahSelection)
    )
  ) {
    clearExplicitAliyahSelection()
  }

  const activeRun =
    display?.viewModel.relevantRuns.find((run) => run.id === activeIdentity.runId) ??
    (centerRun?.id === activeIdentity.runId ? centerRun : null)
  if (!activeRun) return null

  const matchingAnchor = anchors.find(
    (anchor) =>
      anchor.run?.id === activeIdentity.runId &&
      anchor.aliyahIndex === activeIdentity.index
  )
  if (matchingAnchor) {
    return {
      ...matchingAnchor,
      label: formatAliyahLabel(activeIdentity.index),
    }
  }

  return {
    line: null,
    label: formatAliyahLabel(activeIdentity.index),
    run: activeRun,
    aliyahIndex: activeIdentity.index,
    position: getReaderFocalPointScrollTop(getBook()),
  }
}

function getAliyahProgressAnchorForElement(element: HTMLElement) {
  const line = element.closest<HTMLElement>('[data-line-index]')
  if (!line) return null

  const book = getBook()
  const bookRect = book.getBoundingClientRect()
  const lineRect = line.getBoundingClientRect()
  const linePosition = book.scrollTop + (lineRect.top - bookRect.top)
  const anchors = getAliyahProgressAnchors()
  let current = anchors[0] ?? null

  for (const anchor of anchors) {
    if (anchor.position <= linePosition) current = anchor
    else break
  }

  return current
}

function getFirstVisibleWord(line: HTMLElement) {
  return [...line.querySelectorAll<HTMLElement>('.word')].find((word) => {
    const rect = word.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) ?? null
}

function getReaderFocalPointScrollTarget(book: HTMLElement) {
  const activeWord = book.querySelector<HTMLElement>('.word.is-active-word')
  if (activeWord) return activeWord

  const centerLine = latestViewportRange?.center
  if (!centerLine) return null

  const centerLineElement = [
    ...book.querySelectorAll<HTMLElement>('[data-line-index]'),
  ].find((line) => getLineInfoFromElement(line) === centerLine)
  if (!centerLineElement) return null

  return getFirstVisibleWord(centerLineElement) ?? centerLineElement
}

function recenterReaderFocalPoint(
  target: HTMLElement | null,
  options: ScrollToOptions = {}
) {
  const book = getBook()
  if (target?.isConnected) {
    centerElementInScrollRoot(book, target, options)
  }
  viewportTrackerGlobal?.refresh()
  updateReaderProgress()
}

async function ensureNextProgressAnchorLoaded(currentIndex: number) {
  const targetDisplay = display
  const lifetime = readerRuntimeLifetime
  if (!targetDisplay || !lifetime?.isCurrent()) return
  if (progressAnchorLoadPromise) return progressAnchorLoadPromise

  const request = (async () => {
    let anchors = getAliyahProgressAnchors()
    while (
      lifetime.isCurrent() &&
      display === targetDisplay &&
      anchors.length <= currentIndex + 1
    ) {
      const loaded = await targetDisplay.ensureNextContentMounted()
      if (!lifetime.isCurrent() || display !== targetDisplay) break
      if (!loaded) break
      anchors = getAliyahProgressAnchors()
    }
  })().finally(() => {
    if (progressAnchorLoadPromise === request) progressAnchorLoadPromise = null
  })
  progressAnchorLoadPromise = request
  return request
}

function getLineInfoFromElement(element: Element) {
  const line = element.closest<HTMLElement>('[data-line-index]')
  const pageNode = line?.closest('.tikkun-page')
  if (!line || !(pageNode instanceof HTMLElement)) return null
  return pageNode.tikkunPage?.lines[Number(line.dataset.lineIndex)] ?? null
}

function getSessionButtonState(button: HTMLButtonElement) {
  const lineInfo = getLineInfoFromElement(button)
  const aliyahIndex = parsePlaybackAliyahIndex(button.dataset.aliyahIndex)
  if (!lineInfo || !aliyahIndex) return null
  const runId = button.dataset.runId ?? lineInfo?.run?.id
  const run =
    display?.viewModel.relevantRuns.find((candidate) => candidate.id === runId) ??
    (lineInfo?.run?.id === runId ? lineInfo.run : null) ??
    (runId ? createCalendarGenerator().parseId(runId) : null)
  if (!run) return null

  const availability = recordingSessionGlobal?.lookup(run, aliyahIndex)
  const recording =
    availability?.recording ??
    findRecordingForRun({
      narratorId: readerPreferences.narratorId,
      run,
      aliyahIndex,
    })

  return {
    lineInfo,
    run,
    aliyahIndex,
    recording,
    available:
      availability?.available ??
      Boolean(recording || getPreviousOverlapRecording(run, aliyahIndex)),
  }
}

function getPreviousOverlapRecording(
  run: LeiningRun,
  aliyahIndex: PlaybackAliyahIndex
) {
  return (
    recordingSessionGlobal?.lookup(run, aliyahIndex).overlapRecording ?? null
  )
}

function refreshInlineAudioButtons(audioController: AudioController) {
  for (const button of getAudioButtonElements()) {
    const state = getSessionButtonState(button)
    const available = Boolean(state?.available)
    const isCurrentSession = isCurrentPlaybackTarget(audioController, {
      recording: undefined,
      runId: state?.run.id,
      aliyahIndex: state?.aliyahIndex,
    })
    const isPlayingCurrentSession = Boolean(
      isCurrentSession && !audioController.audio.paused
    )

    button.disabled = !available
    setControlIcon(button, isPlayingCurrentSession ? 'pause' : 'play')
    button.title = !available
      ? 'Recording unavailable'
      : `${isPlayingCurrentSession ? 'Pause' : 'Play'} ${
          state!.lineInfo.labels[0] ?? 'aliyah'
        }`
    button.setAttribute('aria-label', button.title)
    button.classList.toggle('is-active', isPlayingCurrentSession)
  }
}

function getToolbarCurrentAliyahButton() {
  return document.querySelector<HTMLButtonElement>(
    '[data-target-id="toolbar-current-aliyah-audio"]'
  )
}

function getToolbarCurrentAliyahLabel() {
  return document.querySelector<HTMLElement>(
    '[data-target-id="toolbar-current-aliyah-label"]'
  )
}

function syncToolbarCurrentAliyahButton(
  current: ReturnType<typeof getAliyahProgressAnchors>[number] | null,
  audioController?: AudioController
) {
  const button = getToolbarCurrentAliyahButton()
  const label = getToolbarCurrentAliyahLabel()
  if (!button || !label) return

  const recording =
    current?.run && current.aliyahIndex
      ? findRecordingForRun({
          narratorId: readerPreferences.narratorId,
          run: current.run,
          aliyahIndex: current.aliyahIndex,
        })
      : null
  const fallbackRecording =
    current?.run && current.aliyahIndex
      ? getPreviousOverlapRecording(current.run, current.aliyahIndex)
      : null

  const isTableOfContentsVisible = isShowingParshaPicker()
  const available = Boolean(
    current?.run &&
      current.aliyahIndex &&
      (recording || fallbackRecording) &&
      !isTableOfContentsVisible
  )
  const isCurrentSession = isCurrentPlaybackTarget(audioController, {
    recording: undefined,
    runId: current?.run?.id,
    aliyahIndex: current?.aliyahIndex,
  })
  const isPlayingCurrentSession = Boolean(
    isCurrentSession && audioController && !audioController.audio.paused
  )
  const preferredMobileRun = getPreferredMobileAliyahRun(current?.run ?? null)
  const preferredMobileItems = preferredMobileRun
    ? getAliyahNavigationEntriesForRun(preferredMobileRun)
    : []
  const mobilePlaybackSession = audioController?.session
  const mobilePlaybackMatchesRun = Boolean(
    preferredMobileRun &&
      mobilePlaybackSession?.runId === preferredMobileRun.id
  )
  const mobilePlaybackPlaying = Boolean(
    mobilePlaybackMatchesRun && isPlaybackActive(audioController)
  )
  const mobileAliyahIndex = mobilePlaybackPlaying
    ? mobilePlaybackSession?.aliyahIndex ?? null
    : current?.run?.id === preferredMobileRun?.id
      ? current?.aliyahIndex ?? null
      : preferredMobileItems[0]?.aliyah.index ?? null
  const mobileRunId = mobilePlaybackPlaying
    ? mobilePlaybackSession?.runId ?? ''
    : current?.run?.id === preferredMobileRun?.id
      ? current?.run?.id ?? ''
      : preferredMobileRun?.id ?? ''
  const mobilePlaybackLoaded = Boolean(
    mobilePlaybackMatchesRun &&
      mobilePlaybackSession?.runId === mobileRunId &&
      mobilePlaybackSession?.aliyahIndex === mobileAliyahIndex
  )

  button.classList.toggle('u-hidden', !available)
  label.classList.toggle('u-hidden', !current || isTableOfContentsVisible)
  label.textContent = current?.label ?? '—'
  button.disabled = !available
  button.dataset.runId = current?.run?.id ?? ''
  button.dataset.aliyahIndex = current?.aliyahIndex ? `${current.aliyahIndex}` : ''
  setControlIcon(button, isPlayingCurrentSession ? 'pause' : 'play')
  button.title = available
    ? `${isPlayingCurrentSession ? 'Pause' : 'Play'} ${current?.label ?? 'aliyah'}`
    : 'Recording unavailable'
  button.setAttribute('aria-label', button.title)
  button.classList.toggle('is-active', isPlayingCurrentSession)

  mobileAliyahPicker?.syncCapsule({
    visible: Boolean(
      preferredMobileRun &&
        mobileAliyahIndex &&
        !isTableOfContentsVisible
    ),
    target:
      mobileRunId && mobileAliyahIndex
        ? { runId: mobileRunId, aliyahIndex: mobileAliyahIndex }
        : null,
    label: mobileAliyahIndex
      ? formatAliyahLabel(mobileAliyahIndex)
      : '—',
    playbackState: getMobileAliyahCapsuleState({
      loaded: mobilePlaybackLoaded,
      playing: mobilePlaybackLoaded && mobilePlaybackPlaying,
    }),
  })
}

async function collectAliyahTokenKeysFromDisplay({
  runId,
  aliyahIndex,
}: {
  runId: string
  aliyahIndex: PlaybackAliyahIndex
}) {
  const targetDisplay = display
  const lifetime = readerRuntimeLifetime
  if (!targetDisplay || !lifetime?.isCurrent()) return []
  const run =
    targetDisplay.viewModel.relevantRuns.find((candidate) => candidate.id === runId) ??
    createCalendarGenerator().parseId(runId)
  const aliyah = findAliyahInRun(run, aliyahIndex)
  if (!run || !aliyah) return []

  const resolver = await targetDisplay.viewModel.resolver
  if (!lifetime.isCurrent() || display !== targetDisplay) return []
  const startLocation = resolver.physicalLocationFromRef(aliyah.start)
  const endLocation = resolver.physicalLocationFromRef(aliyah.end)
  pageVirtualizationEvictionPauseDepth += 1
  try {
    // The verse containing the ending reference may continue on the next page.
    for (
      let pageNumber = startLocation.pageNumber;
      pageNumber <= endLocation.pageNumber + 1;
      pageNumber++
    ) {
      await targetDisplay.ensurePageMounted(pageNumber)
      if (!lifetime.isCurrent() || display !== targetDisplay) return []
    }
  } finally {
    pageVirtualizationEvictionPauseDepth = Math.max(
      0,
      pageVirtualizationEvictionPauseDepth - 1
    )
  }

  const startLine = getRenderedLineForLocation(startLocation, targetDisplay)
  const endLine = getRenderedLineForLocation(endLocation, targetDisplay)
  if (!startLine || !endLine) return []
  const startLineInfo = getLineInfoFromElement(startLine)
  const endLineInfo = getLineInfoFromElement(endLine)
  const startVerseOrdinal =
    startLineInfo?.verses.findIndex((verse) => compareRefs(verse, aliyah.start) === 0) ??
    -1
  const endVerseOrdinal =
    endLineInfo?.verses.findIndex((verse) => compareRefs(verse, aliyah.end) === 0) ??
    -1
  if (startVerseOrdinal < 0 || endVerseOrdinal < 0) return []

  const tokenKeys = collectTokenKeysForExactAliyahRange({
    book: getBook(),
    startLine,
    startVerseOrdinal,
    endLine,
    endVerseOrdinal,
  })
  return lifetime.isCurrent() && display === targetDisplay
    ? [...tokenKeys]
    : []
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function startPlaybackForButton(
  button: HTMLButtonElement,
  audioController: AudioController,
  highlightController: HighlightController
) {
  const state = getSessionButtonState(button)
  if (!state?.available) return
  selectAliyah({ runId: state.run.id, index: state.aliyahIndex })
  const actionToken = playbackAction.start()

  if (
    isActivePlaybackTarget(audioController.session, {
      runId: state.run.id,
      aliyahIndex: state.aliyahIndex,
    })
  ) {
    if (audioController.audio.paused) {
      const session = audioController.session
      const activeTokenKey = highlightController.getActiveTokenKey()
      const cueIndex = session?.cues.length
        ? highlightController.getCueIndex(session.cues, audioController.currentTime)
        : -1

      if (session?.cues.length && cueIndex >= 0) {
        await highlightController.activateCue(session.cues[cueIndex], {
          scroll: true,
        })
      } else if (activeTokenKey) {
        await highlightController.activateTokenKey(activeTokenKey, {
          scroll: true,
        })
      } else if (session?.cues[0]) {
        await highlightController.activateCue(session.cues[0], {
          scroll: true,
        })
      } else if (session?.tokenKeys[0]) {
        await highlightController.activateTokenKey(session.tokenKeys[0], {
          scroll: true,
        })
      }
    }

    await playbackTimelineGlobal?.command({
      type: 'toggle',
      retry: () =>
        startPlaybackForButton(button, audioController, highlightController),
    })
    return
  }

  if (
    !canPlayNetworkRecording(() =>
      startPlaybackForButton(button, audioController, highlightController)
    )
  ) {
    return
  }

  const session = await recordingSessionGlobal?.load({
    runId: state.run.id,
    aliyahIndex: state.aliyahIndex,
  })
  if (!session) return
  if (!playbackAction.isCurrent(actionToken)) return

  await playNetworkRecording(audioController, () =>
    startPlaybackForButton(button, audioController, highlightController)
  )
}

async function startPlaybackForToolbarCurrentAliyah(
  { runId, aliyahIndex }: AliyahNavigationTarget,
  audioController: AudioController,
  highlightController: HighlightController
) {
  const actionToken = playbackAction.start()

  const target = await ensureAliyahDomTargetRendered(runId, aliyahIndex)
  if (!playbackAction.isCurrent(actionToken)) return
  const marker = target?.marker ?? target?.element
  if (!marker) return

  const run =
    display?.viewModel.relevantRuns.find((candidate) => candidate.id === runId) ??
    createCalendarGenerator().parseId(runId)
  if (!run) return

  if (!recordingSessionGlobal?.lookup(run, aliyahIndex).available) return
  selectAliyah({ runId, index: aliyahIndex })

  if (
    isActivePlaybackTarget(audioController.session, {
      runId,
      aliyahIndex,
    })
  ) {
    await playbackTimelineGlobal?.command({
      type: 'toggle',
      retry: () =>
        startPlaybackForToolbarCurrentAliyah(
        { runId, aliyahIndex },
        audioController,
        highlightController
        ),
    })
    return
  }

  if (
    !canPlayNetworkRecording(() =>
      startPlaybackForToolbarCurrentAliyah(
        { runId, aliyahIndex },
        audioController,
        highlightController
      )
    )
  ) {
    return
  }

  const session = await recordingSessionGlobal.load({ runId, aliyahIndex })
  if (!session) return
  if (!playbackAction.isCurrent(actionToken)) return

  await playNetworkRecording(audioController, () =>
    startPlaybackForToolbarCurrentAliyah(
      { runId, aliyahIndex },
      audioController,
      highlightController
    )
  )
}

function updateReaderProgress(range: ViewportRange | null = latestViewportRange) {
  const label = document.querySelector<HTMLElement>(
    '[data-target-id="reader-progress-label"]'
  )!
  const fill = document.querySelector<HTMLElement>(
    '[data-target-id="reader-progress-fill"]'
  )!
  const percent = document.querySelector<HTMLElement>(
    '[data-target-id="reader-progress-percent"]'
  )!
  const mobileFill = document.querySelector<HTMLElement>(
    '[data-target-id="reader-progress-mobile-fill"]'
  )
  const book = getBook()
  const anchors = getAliyahProgressAnchors()

  if (!anchors.length) {
    label.textContent = 'Loading'
    fill.style.height = '0%'
    percent.textContent = '0%'
    mobileFill?.style.setProperty('width', '0%')
    syncToolbarCurrentAliyahButton(null, audioControllerGlobal ?? undefined)
    syncReaderControls()
    renderAliyahRail(range)
    return
  }

  const viewportCenter = getReaderFocalPointScrollTop(book)

  let currentIndex = 0
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i].position <= viewportCenter) currentIndex = i
    else break
  }

  const current = anchors[currentIndex]
  const currentForChrome = getCurrentAliyahFromViewportRange(range, anchors) ?? current
  label.textContent = currentForChrome?.label ?? '—'
  syncToolbarCurrentAliyahButton(
    currentForChrome ?? null,
    audioControllerGlobal ?? undefined
  )
  syncReaderControls()
  renderAliyahRail(range)
  const matchingProgressIndex =
    currentForChrome && currentForChrome.line
      ? anchors.findIndex((anchor) => anchor.line === currentForChrome.line)
      : currentIndex
  const progressIndex =
    matchingProgressIndex >= 0 ? matchingProgressIndex : currentIndex
  const progressCurrent = anchors[progressIndex] ?? current
  const next = anchors[progressIndex + 1]
  const progressEndPosition = next?.position ?? (
    isLastAliyahProgressAnchor(progressCurrent)
      ? Math.max(progressCurrent.position + 1, book.scrollHeight)
      : null
  )

  if (!progressCurrent || progressEndPosition === null) {
    if (progressCurrent) {
      void ensureNextProgressAnchorLoaded(progressIndex)
        .then(() => scheduleDeferredProgressRefresh())
        .catch((error) => {
          console.error('Failed to load the next reader progress anchor', error)
        })
      return
    }
    fill.style.height = '0%'
    percent.textContent = '0%'
    mobileFill?.style.setProperty('width', '0%')
    syncReaderControls()
    renderAliyahRail(range)
    return
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      (viewportCenter - progressCurrent.position) /
        (progressEndPosition - progressCurrent.position)
    )
  )
  fill.style.height = `${Math.round(progress * 100)}%`
  percent.textContent = `${Math.round(progress * 100)}%`
  mobileFill?.style.setProperty('width', `${Math.round(progress * 100)}%`)
}

function scheduleDeferredProgressRefresh() {
  if (deferredProgressFrame) cancelAnimationFrame(deferredProgressFrame)
  deferredProgressFrame = requestAnimationFrame(() => {
    deferredProgressFrame = requestAnimationFrame(() => {
      deferredProgressFrame = 0
      updateReaderProgress()
    })
  })
}

function syncReaderPlaybackChrome(audioController: AudioController) {
  refreshInlineAudioButtons(audioController)
  const anchors = getAliyahProgressAnchors()
  const viewportCenter = getReaderFocalPointScrollTop(getBook())
  let currentIndex = 0
  for (let index = 0; index < anchors.length; index += 1) {
    if (anchors[index].position <= viewportCenter) currentIndex = index
    else break
  }
  syncToolbarCurrentAliyahButton(
    anchors[currentIndex] ?? null,
    audioController
  )
  syncMobileAliyahPlaybackState(audioController)
}

function refreshReaderChrome(audioController?: AudioController) {
  if (audioController) refreshInlineAudioButtons(audioController)
  updateReaderProgress()
}

function updateReaderPreferencesFromSettings(
  updates: Partial<ReaderPreferences>,
  audioController: AudioController
) {
  const shouldSmoothRecenter =
    updates.focalPointMode !== undefined &&
    updates.focalPointMode !== readerPreferences.focalPointMode
  const scrollTarget = shouldSmoothRecenter
    ? getReaderFocalPointScrollTarget(getBook())
    : null

  readerPreferences = mergeReaderPreferences(readerPreferences, updates)
  try {
    saveReaderPreferences(readerPreferences)
  } catch (error) {
    console.error('Failed to save reader preferences', error)
    showPersistenceNotice('Reader settings will apply now but could not be saved.')
  }
  applyReaderPreferences(readerPreferences)
  recenterReaderFocalPoint(scrollTarget, { behavior: 'smooth' })
  refreshReaderChrome(audioController)
}

function renderRoute(route: AppRoute, audioController: AudioController) {
  const readerShell = document.querySelector<HTMLElement>('[data-target-id="reader-shell"]')!
  const aboutView = document.querySelector<HTMLElement>('[data-target-id="about-view"]')!
  const titleEl = getTitleEl()

  if (route.view === 'not-found') {
    audioController.pause()
    deactivateReaderRuntime()
    optionalRouteAbortController?.abort()
    optionalRouteAbortController = null
    closeCueAuthoring()
    hideLastReadingPrompt()
    hideParshaPicker()
    readerShell.classList.add('u-hidden')
    aboutView.classList.remove('u-hidden')
    aboutView.innerHTML = PageNotFoundPage()
    aboutView
      .querySelector<HTMLButtonElement>('[data-target-id="open-reading-index"]')!
      .addEventListener('click', () => {
        aboutView.classList.add('u-hidden')
        readerShell.classList.remove('u-hidden')
        showParshaPicker()
      })
    titleEl.textContent = 'תיקון קוראים'
    syncReaderProgressVisibility()
    syncReaderSideNavigationVisibility()
    return
  }

  if (route.view === 'about' || route.view === 'cue-analytics') {
    audioController.pause()
    deactivateReaderRuntime()
    optionalRouteAbortController?.abort()
    optionalRouteAbortController = null
    closeCueAuthoring()
    hideLastReadingPrompt()
    readerShell.classList.add('u-hidden')
    aboutView.classList.remove('u-hidden')
    aboutView.innerHTML =
      route.view === 'about'
        ? '<section class="about-card" aria-busy="true"><h2>Loading About</h2></section>'
        : '<section class="about-card" aria-busy="true"><h2>Loading Cue Analytics</h2></section>'
    const controller = new AbortController()
    optionalRouteAbortController = controller
    if (route.view === 'about') {
      void import('./components/AboutPage.ts')
        .then(({ default: AboutPage }) => {
          if (!controller.signal.aborted) aboutView.innerHTML = AboutPage()
        })
        .catch((error) => {
          if (controller.signal.aborted) return
          console.error('Failed to load the About page', error)
          aboutView.innerHTML =
            '<section class="about-card"><h2>About unavailable</h2><p>Reload this page to try again.</p></section>'
        })
    } else {
      void mountCueAnalyticsRoute(aboutView, {
        signal: controller.signal,
      }).catch((error) => {
        if (controller.signal.aborted) return
        console.error('Failed to load Cue Data analytics', error)
        aboutView.innerHTML =
          '<section class="about-card"><h2>Analytics unavailable</h2><p>Reload this page to try again.</p></section>'
      })
    }
    titleEl.textContent = 'תיקון קוראים'
    syncReaderProgressVisibility()
    syncReaderSideNavigationVisibility()
    return
  }

  readerShell.classList.remove('u-hidden')
  aboutView.classList.add('u-hidden')
  aboutView.innerHTML = ''
  const nextReaderHash = (route.canonicalHash ?? routeHashPath()) || lastReaderHash
  const canonicalUrl = canonicalReaderUrl(new URL(location.href), nextReaderHash)
  if (canonicalUrl.href !== location.href) {
    history.replaceState(null, '', canonicalUrl)
  }
  const readerRouteChanged =
    currentReaderHash !== null && currentReaderHash !== nextReaderHash
  if (
    readerRouteChanged &&
    explicitAliyahSelectionHash !== nextReaderHash
  ) {
    clearExplicitAliyahSelection()
  }
  if (readerRouteChanged) resetReaderSideNavigationState(audioController)
  if (readerRouteChanged && isShowingParshaPicker()) hideParshaPicker()
  if (readerRouteChanged) latestViewportRange = null
  if (readerRouteChanged) readerControlsGlobal?.close()
  if (readerRouteChanged) closeAliyahStartPopup()
  if (readerRouteChanged) revealAliyahRail('peek')
  currentReaderHash = nextReaderHash
  lastReaderHash = nextReaderHash
  syncReaderProgressVisibility()
  syncReaderSideNavigationVisibility()
  const rendered = app.jumpTo(route.model)
  const routeDisplay = display
  const routeLifetime = readerRuntimeLifetime
  const isCurrentRoute = () =>
    Boolean(routeLifetime?.isCurrent() && routeDisplay && display === routeDisplay)
  if (shouldSaveLastReadingAfterRouteRender) {
    shouldSaveLastReadingAfterRouteRender = false
    void rendered
      .then(() => {
        if (isCurrentRoute()) saveCurrentLastReading()
      })
      .catch((error) => {
        if (isCurrentRoute()) console.error('Failed to render reader route', error)
      })
  }
  void rendered
    .then(() => {
      if (isCurrentRoute()) revealPageNumberForRoute(nextReaderHash)
    })
    .catch((error) => {
      if (isCurrentRoute()) console.error('Failed to render reader route', error)
    })
}

function pageNumberFromPageRouteHash(hash: string | null) {
  if (!hash) return null
  const [, page] = hash.match(/^#\/(?:torah|esther)\/page\/(\d+)$/) ?? []
  if (!page) return null
  const pageNumber = Number(page)
  return Number.isInteger(pageNumber) ? pageNumber : null
}

function revealPageNumberForRoute(hash: string | null) {
  const pageNumber = pageNumberFromPageRouteHash(hash)
  if (!pageNumber) return

  const pageNode = display?.getMountedPageNode(pageNumber)
  const marker = pageNode?.querySelector<HTMLElement>('.tikkun-page-number')
  if (!marker) return

  marker.classList.remove('mod-route-reveal')
  void marker.offsetWidth
  marker.classList.add('mod-route-reveal')
  window.setTimeout(() => {
    marker.classList.remove('mod-route-reveal')
  }, 1900)
}

function navigateToHash(hash: string, audioController: AudioController) {
  if (location.hash === hash) {
    const route = parseUrl(createCalendarGenerator(), hash.replace(/^#/, ''))
    if (route) renderRoute(route, audioController)
    return
  }
  location.hash = hash
}

function toggleAboutRoute(audioController: AudioController) {
  const currentView = parseCurrentRoute()?.view
  if (currentView === 'about' || currentView === 'cue-analytics') {
    navigateToHash(lastReaderHash, audioController)
    return
  }

  navigateToHash(generateAboutUrl(), audioController)
}

function setupReaderViewportResize(scope: MountScope, book: HTMLElement) {
  let pendingScrollTarget: HTMLElement | null = null
  let recenterFrame = 0

  const handleResize = () => {
    pendingScrollTarget ??= getReaderFocalPointScrollTarget(book)
    setAppHeight()
    if (recenterFrame) return

    recenterFrame = requestAnimationFrame(() => {
      recenterFrame = 0
      const scrollTarget = pendingScrollTarget
      pendingScrollTarget = null
      recenterReaderFocalPoint(scrollTarget)
    })
  }

  setAppHeight()
  window.addEventListener('resize', handleResize, { signal: scope.signal })
  window.visualViewport?.addEventListener('resize', handleResize, {
    signal: scope.signal,
  })
  scope.own(() => {
    pendingScrollTarget = null
    if (recenterFrame) cancelAnimationFrame(recenterFrame)
    recenterFrame = 0
  })
}

document.addEventListener('DOMContentLoaded', () => {
  const openedHashless = !location.hash
  const book = getBook()
  const toggle = document.querySelector<HTMLInputElement>(
    '[data-target-id="annotations-toggle"]'
  )!
  const audioElement = document.querySelector<HTMLAudioElement>(
    '[data-target-id="reader-audio"]'
  )!

  if (recordingMode.enabled) {
    document.documentElement.dataset.recordingMode = 'true'
  }

  readerPreferences = recordingMode.enabled
    ? applyRecordingModePreferences(loadReaderPreferences())
    : loadReaderPreferences()
  applyReaderPreferences(readerPreferences)
  bookmarks = loadBookmarks(browserLocalStorage)

  mountReaderRuntime((scope) => {
  const audioController = new AudioController(audioElement, {
    signal: scope.signal,
  })
  audioControllerGlobal = audioController
  scope.own(() => {
    deactivateReaderRuntime()
    audioController.destroy()
    if (audioControllerGlobal === audioController) audioControllerGlobal = null
  })
  audioController.audio.playbackRate = readerPreferences.playbackRate
  const highlightController = new HighlightController(book)
  highlightControllerGlobal = highlightController
  scope.own(() => {
    highlightController.clear()
    if (highlightControllerGlobal === highlightController) {
      highlightControllerGlobal = null
    }
  })
  const recordingSession = createRecordingSession({
    audioController,
    highlightController,
    library: {
      findRecording: findRecordingForRun,
      listRecordings,
      loadCues: getCuesForRecording,
    },
    display: {
      resolveRun: (runId) =>
        display?.viewModel.relevantRuns.find(
          (candidate) => candidate.id === runId
        ) ??
        createCalendarGenerator().parseId(runId),
      collectTokenKeys: collectAliyahTokenKeysFromDisplay,
      waitUntilReady: async () => {
        await display?.rendered
        await display?.scrolled
      },
      resolveRunForRecording: (recording) =>
        isParshaAudioRecording(recording)
          ? display?.viewModel.relevantRuns.find(
              (candidate) =>
                parshaSlugForRun(candidate) === recording.parshaSlug
            ) ?? null
          : null,
    },
    authoring: {
      isActive: () => cueAuthoringGlobal?.isActive() ?? false,
      isVisible: () => cueAuthoringGlobal?.isVisible() ?? false,
      getSession: () => cueAuthoringGlobal?.getSession() ?? null,
      bindSession: async (session) => {
        await cueAuthoringGlobal?.bindSession(session)
      },
      clearSession: () => cueAuthoringGlobal?.clearSession(),
    },
    presentation: {
      setCueIndex: (index) =>
        playbackTimelineGlobal?.command({ type: 'set-cue-index', index }),
      sessionLoaded: () => {
        playbackTimelineGlobal?.refresh()
        refreshInlineAudioButtons(audioController)
      },
    },
    getNarratorId: () => readerPreferences.narratorId,
    recordingMode: recordingMode.enabled,
  })
  recordingSessionGlobal = recordingSession
  scope.own(() => {
    recordingSession.reset()
    if (recordingSessionGlobal === recordingSession) {
      recordingSessionGlobal = null
    }
  })
  const cueAuthoringLoader = createCueAuthoringLoader(scope, {
    sessionStorage: browserSessionStorage,
    mount: (cueScope, module) =>
      module.createCueAuthoring(cueScope, {
        document,
        view: window,
        audioController,
        highlightController,
        localStorage: browserLocalStorage,
        sessionStorage: browserSessionStorage,
        prepareAuthoringSession: () => recordingSession.enterAuthoring(),
        restoreReaderSession: () => recordingSession.leaveAuthoring(),
        playNetworkRecording: async (retry) => {
          await playNetworkRecording(audioController, retry)
        },
        getAutoScroll: () => readerPreferences.autoScrollWithPlayback,
        getActiveTokenKey,
        getDisplayTime: () =>
          playbackTimelineGlobal?.displayTime ?? audioController.currentTime,
        getRecordingIssues: () => activeRecordingIssues,
        focusReader: focusReaderSurface,
        formatDuration,
        onChange: (change: CueAuthoringChange) => {
          if (change === 'access') commandPaletteGlobal?.refresh()
          else if (change === 'draft') invalidateAliyahRailRender()
          else if (change === 'mode') syncReaderMode()
          else if (change === 'playback') playbackTimelineGlobal?.refresh()
          else if (change === 'playback-progress') {
            playbackTimelineGlobal?.refresh('progress')
          }
        },
        onCueNavigationChange: (index) => {
          void playbackTimelineGlobal?.command({
            type: 'set-cue-index',
            index,
          })
        },
        onRecordingIssuesChanged: (issues) => {
          activeRecordingIssues = issues
          applyReaderVisibleIssueMarkers()
          syncActiveReaderIssueNotice()
          commandPaletteGlobal?.refresh()
        },
        showPersistenceNotice,
      }),
    onMounted: (authoring) => {
      cueAuthoringGlobal = authoring
    },
    onUnmounted: (authoring) => {
      if (cueAuthoringGlobal === authoring) cueAuthoringGlobal = null
    },
    onLoadError: (error) => {
      console.error('Failed to load Cue Authoring', error)
    },
  })
  cueAuthoringLoaderGlobal = cueAuthoringLoader
  scope.own(() => {
    if (cueAuthoringLoaderGlobal === cueAuthoringLoader) {
      cueAuthoringLoaderGlobal = null
    }
  })
  const lastReadingPrompt = createLastReadingPrompt(scope, {
    document,
    disabled: recordingMode.enabled,
    onResume: (target) => {
      shouldSaveLastReadingAfterRouteRender = true
      if (location.hash === target.hash) {
        window.dispatchEvent(new Event('hashchange'))
        return
      }
      location.hash = target.hash
    },
  })
  lastReadingPromptGlobal = lastReadingPrompt
  scope.own(() => {
    if (lastReadingPromptGlobal === lastReadingPrompt) {
      lastReadingPromptGlobal = null
    }
  })
  const commandPalette = createCommandPalette(scope, {
    document,
    getActions: createCommandPaletteActions,
    restoreFocus: focusReaderSurface,
    isBookmarkAction,
    formatBadge: titleCaseBookmarkBadge,
  })
  commandPaletteGlobal = commandPalette
  scope.own(() => {
    if (commandPaletteGlobal === commandPalette) commandPaletteGlobal = null
  })
  const offlineRecordingPrompt = createOfflineRecordingPrompt(scope, {
    document,
    view: window,
    isOnline: () => navigator.onLine,
    onRetryError: (error) => {
      console.error('Failed to retry recording after reconnecting', error)
    },
  })
  offlineRecordingPromptGlobal = offlineRecordingPrompt
  scope.own(() => {
    if (offlineRecordingPromptGlobal === offlineRecordingPrompt) {
      offlineRecordingPromptGlobal = null
    }
  })
  const readerControls = createReaderControls(scope, {
    document,
    getState: getReaderControlsState,
    openCommandPalette,
    toggleBookmark: () => {
      bookmarkCurrentToken()
      focusReaderSurface()
    },
    openAliyahNavigation: (returnFocus) => {
      if (isCompactReaderViewport()) {
        openMobileAliyahPickerFromControl(returnFocus)
        return
      }
      revealAliyahRail('expanded')
      scheduleAliyahRailHide()
      focusReaderSurface()
    },
    showAliyahStarts: () => {
      revealAliyahRail('peek')
      focusReaderSurface()
    },
    toggleAnnotations: () => {
      toggle.checked = !toggle.checked
      toggle.dispatchEvent(new Event('change', { bubbles: true }))
      focusReaderSurface()
    },
    openSettings: (returnFocus) => {
      readerSettingsGlobal?.open({ returnFocus })
    },
  })
  readerControlsGlobal = readerControls
  scope.own(() => {
    if (readerControlsGlobal === readerControls) {
      readerControlsGlobal = null
    }
  })
  setupShortcutCommands(scope)
  const launchLastReading =
    openedHashless && !recordingMode.enabled
      ? loadEligibleLastReading(browserLocalStorage)
      : null

  const topBarModel = new TopBarTracker()
  const titleEl = getTitleEl()

  setControlIcon(document.querySelector('[data-target-id="mobile-library-icon"]'), 'houseFilled')
  setControlIcon(document.querySelector('[data-target-id="admin-step-back"]'), 'arrowLeft')
  setControlIcon(
    document.querySelector('[data-target-id="mobile-aliyah-picker-chevron"]'),
    'chevronDown'
  )
  setControlIcon(
    document.querySelector('[data-target-id="mobile-aliyah-picker-speaker"]'),
    'speakerHigh'
  )
  setControlIcon(document.querySelector('[data-target-id="mobile-aliyah-picker-close"]'), 'x')
    const readerViewport = createReaderViewport(scope, window)
    readerViewportGlobal = readerViewport
    scope.own(() => {
      if (readerViewportGlobal === readerViewport) {
        readerViewportGlobal = null
      }
    })
    setupAliyahStartPopup(scope)
    listenForRevealGesture(scope, book)
    setupReaderViewportResize(scope, book)

    const viewportTracker = new ViewportTracker(book)
    viewportTrackerGlobal = viewportTracker
    scope.own(() => {
      viewportTracker.destroy()
      if (viewportTrackerGlobal === viewportTracker) {
        viewportTrackerGlobal = null
        latestViewportRange = null
      }
    })

    scope.own(
      highlightController.onActiveTokenChanged(syncActiveReaderIssueNotice)
    )
    setupAliyahNavigationChrome(scope, audioController, highlightController)
    const playbackTimeline = createPlaybackTimeline(scope, {
      document,
      view: window,
      audioController,
      highlightController,
      viewport: readerViewport,
      getAutoScroll: () => readerPreferences.autoScrollWithPlayback,
      getPlaybackRate: () => readerPreferences.playbackRate,
      onPlaybackRateChange: (playbackRate) => {
        readerPreferences = mergeReaderPreferences(readerPreferences, {
          playbackRate,
        })
        applyReaderPreferences(readerPreferences)
        readerSettingsGlobal?.sync()
      },
      playNetworkRecording: (retry) =>
        playNetworkRecording(audioController, retry),
      replayNetworkRecordingFromStart: (retry) =>
        replayNetworkRecordingFromStart(audioController, retry),
      isCueAuthoringRecording: () =>
        cueAuthoringGlobal?.isRecording() ?? false,
      saveReadingPosition: saveCurrentLastReading,
      focusReader: focusReaderSurface,
      restoreFocus: focusOverlayReturnTarget,
      onChange: (change) => {
        if (change.type === 'reader-chrome') {
          syncReaderPlaybackChrome(audioController)
        } else if (change.type === 'aliyah-playback') {
          syncMobileAliyahPlaybackState(audioController)
        } else if (change.type === 'session-loaded') {
          void loadIssuesForActiveSession()
          renderAliyahRail()
        } else if (change.type === 'segment-updated') {
          void loadIssuesForActiveSession()
        } else if (change.type === 'playback-error') {
          console.error(
            `Audio playback failed for ${change.recording.id}`,
            change.error
          )
        } else if (change.type === 'offline-media-error') {
          showOfflinePrompt({ force: true })
          setPendingNetworkRecordingRetry(change.retry)
        }
      },
    })
    playbackTimelineGlobal = playbackTimeline
    scope.own(() => {
      if (playbackTimelineGlobal === playbackTimeline) {
        playbackTimelineGlobal = null
      }
    })
    const readerSettings = createReaderSettings(scope, {
      document,
      view: window,
      narrators: listNarrators(),
      getPreferences: () => readerPreferences,
      updatePreferences: (updates) =>
        updateReaderPreferencesFromSettings(updates, audioController),
      setPlaybackRate: (playbackRate) => {
        void playbackTimeline.command({
          type: 'set-rate',
          rate: playbackRate,
        })
        refreshReaderChrome(audioController)
      },
      restoreFocus: focusOverlayReturnTarget,
      animateThemeChanges: !recordingMode.enabled,
    })
    readerSettingsGlobal = readerSettings
    scope.own(() => {
      if (readerSettingsGlobal === readerSettings) {
        readerSettingsGlobal = null
      }
    })
    setupDebugControls(scope)
    scope.own(
      viewportTracker.on('viewport-updated', (range) => {
        if (!display?.viewModel) return
        latestViewportRange = range
        topBarModel.setLine(display.viewModel, range)
        const run = topBarModel.info.currentRun
        titleEl.textContent = formatTopBarTitle(
          run ? display.viewModel.displayTitleForRun(run) : undefined
        )
        updateReaderProgress(range)
      })
    )
  const saveLastReadingDebounced = debounce(() => saveCurrentLastReading(), 1000)
  scope.own(saveLastReadingDebounced.cancel)

  const markUserScrolledReaderForLastReading: (_event?: Event) => void = () => {
    hasUserScrolledReaderForLastReading = true
    dismissLastReadingPrompt()
  }

  book.addEventListener('wheel', markUserScrolledReaderForLastReading, {
    passive: true,
    signal: scope.signal,
  })
  book.addEventListener('touchstart', markUserScrolledReaderForLastReading, {
    passive: true,
    signal: scope.signal,
  })
  book.addEventListener(
    'keydown',
    whenKey('ArrowDown', markUserScrolledReaderForLastReading),
    { signal: scope.signal }
  )
  book.addEventListener(
    'keydown',
    whenKey('ArrowUp', markUserScrolledReaderForLastReading),
    { signal: scope.signal }
  )
  book.addEventListener(
    'keydown',
    whenKey('PageDown', (event) => {
      markUserScrolledReaderForLastReading(event)
      revealAliyahRailForMovement()
    }),
    { signal: scope.signal }
  )
  book.addEventListener(
    'keydown',
    whenKey('PageUp', (event) => {
      markUserScrolledReaderForLastReading(event)
      revealAliyahRailForMovement()
    }),
    { signal: scope.signal }
  )

  book.addEventListener(
    'scroll',
    () => {
      const scrollTop = book.scrollTop
      const previousScrollTop = lastAliyahRailScrollTop
      lastAliyahRailScrollTop = scrollTop
      extendPendingAliyahRailSelectionForScroll()
      if (
        previousScrollTop !== null &&
        Math.abs(scrollTop - previousScrollTop) >= 28 &&
        (audioController.audio.paused || audioController.audio.ended)
      ) {
        revealAliyahRailForMovement()
      }
      if (!progressFrame) {
        progressFrame = requestAnimationFrame(() => {
          progressFrame = 0
          updateReaderProgress()
        })
      }
      scheduleViewportPlaceholderRemount()
      if (hasUserScrolledReaderForLastReading) saveLastReadingDebounced()
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'page-rendered',
    (event) => {
      const renderedPage = event instanceof CustomEvent ? event.detail?.node : null
      const pageRoot = renderedPage instanceof Element ? renderedPage : book
      indexAliyahDomTargets(pageRoot)
      applyAliyahStartWordMarkers(book, pageRoot)
      applyRecordingModePageLabels(pageRoot)
      applyReaderVisibleIssueMarkers(pageRoot)
      applyPageVirtualization()
      if (isPlaybackActive(audioController)) return
      refreshReaderChrome(audioController)
      scheduleDeferredProgressRefresh()
      void playbackTimelineGlobal?.syncHighlight({ scroll: false })
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'page-evicted',
    (event) => {
      const pageNumber =
        event instanceof CustomEvent ? event.detail?.pageNumber : null
      if (Number.isInteger(pageNumber)) {
        unindexAliyahDomTargetsForPage(pageNumber)
        pageVirtualizationMetrics.recordPageEvicted(pageNumber)
      }
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'page-remounted',
    (event) => {
      const pageNumber =
        event instanceof CustomEvent ? event.detail?.pageNumber : null
      if (Number.isInteger(pageNumber)) {
        pageVirtualizationMetrics.recordPageRemounted(pageNumber)
      }
    },
    { signal: scope.signal }
  )

  book.addEventListener('click', async (event) => {
    if (await handleAliyahPermalinkClick(event)) return

    const target = event.target as HTMLElement
    const playButton = target.closest<HTMLButtonElement>('[data-audio-button="true"]')
    if (playButton) {
      event.preventDefault()
      await startPlaybackForButton(playButton, audioController, highlightController)
      saveLastReadingFromAnchor(getAliyahProgressAnchorForElement(playButton))
      focusReaderSurface()
      return
    }

    const word = target.closest<HTMLElement>('.word')
    if (!word || !audioController.session) return
    const tokenKey = highlightController.getTokenKeyFromElement(word)
    if (!tokenKey) return
    const tokenIndex = audioController.session.tokenKeys.indexOf(tokenKey)
    const cue = audioController.session.cues.find(
      (candidate) => formatTokenKey(candidate) === tokenKey
    )
    const isPlaying = !audioController.audio.paused
    if (
      cueAuthoringGlobal?.isActive() &&
      !cueAuthoringGlobal.isRecording() &&
      tokenIndex >= 0
    ) {
      event.preventDefault()
      await cueAuthoringGlobal.selectReaderToken(tokenIndex, {
        play: isPlaying && Boolean(cue),
        preservePlayback: isPlaying,
        seekToCue: Boolean(cue),
        focusRow: true,
      })
      syncToolbarCurrentAliyahButton(
        getAliyahProgressAnchorForElement(word),
        audioController
      )
      return
    }

    let activeElement: HTMLElement | null = null
    if (cue) {
      if (
        audioController.audio.paused &&
        !canPlayNetworkRecording(async () => {
          if (!document.body.contains(word)) return
          word.click()
        })
      ) {
        return
      }
      await playbackTimelineGlobal?.command({
        type: 'set-cue-index',
        index: audioController.session.cues.indexOf(cue),
      })
      audioController.seek(cue.timeStart)
      await playNetworkRecording(audioController, async () => {
        if (!document.body.contains(word)) return
        word.click()
      })
      activeElement = await highlightController.activateCue(cue, {
        scroll: readerPreferences.autoScrollWithPlayback,
      })
    } else {
      activeElement = await highlightController.activateTokenKey(tokenKey, {
        scroll: readerPreferences.autoScrollWithPlayback,
      })
    }
    syncToolbarCurrentAliyahButton(
      getAliyahProgressAnchorForElement(activeElement ?? word),
      audioController
    )
    saveLastReadingFromAnchor(getAliyahProgressAnchorForElement(activeElement ?? word))
  }, { signal: scope.signal })

  document
    .querySelector('[data-target-id="toolbar-current-aliyah-audio"]')!
    .addEventListener('click', async () => {
      const button = getToolbarCurrentAliyahButton()
      if (!button) return
      const runId = button.dataset.runId
      const aliyahIndex = parsePlaybackAliyahIndex(button.dataset.aliyahIndex)
      if (!runId || !aliyahIndex) return
      await startPlaybackForToolbarCurrentAliyah(
        { runId, aliyahIndex },
        audioController,
        highlightController
      )
      focusReaderSurface()
    }, { signal: scope.signal })
  toggle.addEventListener(
    'change',
    () => toggleAnnotations(() => !toggle.checked),
    { signal: scope.signal }
  )

  const temporaryShiftToggle = createTemporaryShiftToggle({
    getValue: () => toggle.checked,
    setValue: setAnnotationsEnabled,
    isDisabled: () => readerPreferences.disableShiftNekudotHide,
  })
  document.addEventListener('keydown', temporaryShiftToggle.handleKeyDown, {
    signal: scope.signal,
  })
  document.addEventListener('keyup', temporaryShiftToggle.handleKeyUp, {
    signal: scope.signal,
  })
  window.addEventListener('blur', temporaryShiftToggle.release, {
    signal: scope.signal,
  })
  scope.own(temporaryShiftToggle.release)

  titleEl.addEventListener('click', toggleParshaPicker, {
    signal: scope.signal,
  })
  document.addEventListener('keydown', whenKey('/', toggleParshaPicker), {
    signal: scope.signal,
  })

  document.addEventListener(
    'keydown',
    whenKey('Escape', (e) => {
      if (isMobileAliyahPickerOpen()) {
        e.preventDefault()
        closeMobileAliyahPicker()
      }
      if (playbackTimelineGlobal?.closeOverlay()) {
        e.preventDefault()
        return
      }
      if (isShowingParshaPicker()) {
        e.preventDefault()
        hideParshaPicker()
        getTitleEl().focus({ preventScroll: true })
      }
      readerSettingsGlobal?.close()
      cueAuthoringGlobal?.closeOverlays()
      closeCommandPalette()
      closeAliyahStartPopup()
    }),
    { signal: scope.signal }
  )

  document
    .querySelector('[data-target-id="about-link"]')!
    .addEventListener('click', () => {
      toggleAboutRoute(audioController)
    }, { signal: scope.signal })

  document.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      'a[href^="#/"]'
    )
    if (!link) return

    const href = link.getAttribute('href')
    if (!href || href === location.hash) {
      event.preventDefault()
      navigateToHash(href ?? location.hash, audioController)
    }
  }, { signal: scope.signal })


  document.addEventListener('keydown', (event) => {
    if (cueAuthoringLoader.handleShortcut(event)) return
    if (event.defaultPrevented) return
    if (isEditableTarget(event.target)) return

    if (parseCurrentRoute()?.view !== 'reader' || !audioController.session) return

    if (event.code === 'Space') {
      event.preventDefault()
      void playbackTimelineGlobal?.command({
        type: 'toggle',
        retry: async () => {
          await playNetworkRecording(audioController)
        },
      })
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      void playbackTimelineGlobal?.command({ type: 'step', delta: 1 })
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      void playbackTimelineGlobal?.command({ type: 'step', delta: -1 })
    }
  }, { signal: scope.signal })

  if (recordingMode.enabled) {
    window.tikkunRecorder = {
      ready: async () => {
        await display?.rendered
        await display?.scrolled
      },
      loadAudio: (audioId: string) => recordingSession.loadByAudioId(audioId),
      renderAt: async (seconds: number) => {
        const session = audioController.session
        if (!session) return null

        document.documentElement.style.removeProperty(
          '--recording-highlight-animation-delay'
        )
        document.documentElement.style.removeProperty(
          '--recording-highlight-animation-play-state'
        )
        audioController.seek(seconds)
        await playbackTimelineGlobal?.syncHighlight()
        await waitForAnimationFrame()

        return {
          audioId: session.recording.id,
          currentTime: audioController.currentTime,
          duration: audioController.duration,
          activeTokenKey: highlightController.getActiveTokenKey(),
        }
      },
      renderHighlightAnimationAt: async (
        seconds: number,
        elapsedMs: number,
        settleBeforeAnimation: boolean,
        scrollTransition: boolean,
        transitionWaitMs: number
      ) => {
        const session = audioController.session
        if (!session) return null

        if (settleBeforeAnimation) {
          await window.tikkunRecorder?.settleAt(seconds)
        }

        document.documentElement.style.setProperty(
          '--recording-highlight-animation-delay',
          `${-Math.max(0, elapsedMs)}ms`
        )
        document.documentElement.style.setProperty(
          '--recording-highlight-animation-play-state',
          'paused'
        )
        if (scrollTransition || settleBeforeAnimation) {
          audioController.seek(seconds)
          const cueIndex = highlightController.getCueIndex(session.cues, seconds)
          if (cueIndex >= 0) {
            highlightController.clear()
            await highlightController.activateCue(session.cues[cueIndex], {
              scroll: scrollTransition,
            })
          } else {
            await playbackTimelineGlobal?.syncHighlight()
          }
        }
        await waitForAnimationFrame()
        if (transitionWaitMs > 0) {
          await new Promise<void>((resolve) =>
            window.setTimeout(resolve, transitionWaitMs)
          )
        }

        return {
          audioId: session.recording.id,
          currentTime: audioController.currentTime,
          duration: audioController.duration,
          activeTokenKey: highlightController.getActiveTokenKey(),
          scrollTop: getBook().scrollTop,
        }
      },
      settleAt: async (seconds: number) => {
        const session = audioController.session
        if (!session) return null

        await window.tikkunRecorder?.renderAt(seconds)
        let stableFrames = 0
        let previousScrollTop = getBook().scrollTop

        for (let frame = 0; frame < 90; frame += 1) {
          await waitForAnimationFrame()
          const scrollTop = getBook().scrollTop
          const activeWord = getBook().querySelector<HTMLElement>('.word.is-active-word')
          const activeRect = activeWord?.getBoundingClientRect()
          const highlightVisible = Boolean(
            activeRect &&
              activeRect.top >= 0 &&
              activeRect.bottom <= window.innerHeight &&
              activeRect.left >= 0 &&
              activeRect.right <= window.innerWidth
          )

          stableFrames =
            Math.abs(scrollTop - previousScrollTop) < 0.5 && highlightVisible
              ? stableFrames + 1
              : 0
          if (stableFrames >= 6) break
          previousScrollTop = scrollTop
        }

        return {
          audioId: session.recording.id,
          currentTime: audioController.currentTime,
          duration: audioController.duration,
          activeTokenKey: highlightController.getActiveTokenKey(),
          scrollTop: getBook().scrollTop,
        }
      },
      play: async () => {
        await audioController.play()
      },
      pause: () => audioController.pause(),
      state: () => ({
        ready: Boolean(display),
        audioId: audioController.session?.recording.id ?? null,
        duration: audioController.duration,
        currentTime: audioController.currentTime,
        activeTokenKey: highlightController.getActiveTokenKey(),
        scrollTop: getBook().scrollTop,
      }),
      captureRect: (margin = 240) => {
        const book = getBook()
        const isVisible = (rect: DOMRect) =>
          rect.left < window.innerWidth &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.bottom > 0
        const unionRects = (rects: DOMRect[]) => {
          if (!rects.length) return null
          const left = Math.min(...rects.map((rect) => rect.left))
          const top = Math.min(...rects.map((rect) => rect.top))
          const right = Math.max(...rects.map((rect) => rect.right))
          const bottom = Math.max(...rects.map((rect) => rect.bottom))
          return {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          }
        }
        const pageReadingRect = (page: HTMLElement | null) =>
          unionRects(
            page
              ? [...page.querySelectorAll<HTMLElement>('.line')]
                  .map((line) => line.getBoundingClientRect())
                  .filter(isVisible)
              : []
          )
        const activeWord = book.querySelector<HTMLElement>('.word.is-active-word')
        const activePage = activeWord?.closest<HTMLElement>('.tikkun-page')
        const activeTable = activePage?.querySelector<HTMLElement>('table') ?? null
        const activeTableRect = activeTable?.getBoundingClientRect()
        const visibleTables = [...book.querySelectorAll<HTMLElement>('.tikkun-page table')]
          .map((table) => ({ table, rect: table.getBoundingClientRect() }))
          .filter(({ rect }) => isVisible(rect))
          .sort((left, right) => {
            const leftVisibleHeight =
              Math.min(left.rect.bottom, window.innerHeight) - Math.max(left.rect.top, 0)
            const rightVisibleHeight =
              Math.min(right.rect.bottom, window.innerHeight) - Math.max(right.rect.top, 0)
            return rightVisibleHeight - leftVisibleHeight
          })
        const table =
          activeTable && activeTableRect && isVisible(activeTableRect)
            ? activeTable
            : visibleTables[0]?.table ?? activeTable
        const visiblePage = table?.closest<HTMLElement>('.tikkun-page') ?? null
        const rect =
          pageReadingRect(activePage ?? null) ??
          pageReadingRect(visiblePage) ??
          table?.getBoundingClientRect()
        return calculateCaptureRect({
          contentRect: rect
            ? {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              }
            : null,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          margin,
        })
      },
    }
    scope.own(() => {
      delete window.tikkunRecorder
      document.documentElement.style.removeProperty(
        '--recording-highlight-animation-delay'
      )
      document.documentElement.style.removeProperty(
        '--recording-highlight-animation-play-state'
      )
    })
  }

  cueAuthoringLoader.restoreIfOpen()

  window.addEventListener('hashchange', () => {
    const route = parseCurrentRoute()
    if (!route) return
    renderRoute(route, audioController)
  }, { signal: scope.signal })

  scope.own(() => {
    if (progressFrame) cancelAnimationFrame(progressFrame)
    progressFrame = 0
    if (deferredProgressFrame) cancelAnimationFrame(deferredProgressFrame)
    deferredProgressFrame = 0
    if (persistenceToastTimer !== null) {
      window.clearTimeout(persistenceToastTimer)
      persistenceToastTimer = null
    }
    activeParshaPicker?.destroy()
    activeParshaPicker = null
    closeCommandPalette()
    hideOfflinePrompt()
    hideLastReadingPrompt()
  })

  const initialRoute =
    parseCurrentRoute() ?? {
      view: 'reader' as const,
      canonicalHash: '#/next',
      model: ScrollViewModel.forDate(createCalendarGenerator(), new Date()),
    }
  renderRoute(initialRoute, audioController)
  if (launchLastReading) showLastReadingPrompt(launchLastReading)
  })
})
