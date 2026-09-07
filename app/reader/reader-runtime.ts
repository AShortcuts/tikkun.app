import { HDate } from '@hebcal/hdate'
import utils from '../components/utils.ts'
import { ScrollViewModel } from '../view-model/scroll-view-model.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import {
  CalendarSettingsStorageError,
  loadCalendarSettingsState,
  saveCalendarSettings,
  userSettingsFromCalendarSettings,
  type CalendarSettings,
} from '../calendar-settings.ts'
import { applyAnnotationMode } from '../components/annotation-rendering.ts'
import { applyReaderPageLayout } from '../components/reader-page-layout.ts'
import { alignSmallSpecialLettersWhenFontsReady } from '../special-letter-layout.ts'
import type { ViewportRange } from '../viewport-tracker.ts'
import {
  createReaderViewport,
  type ReaderViewport,
} from '../adaptive/reader-viewport.ts'
import { TopBarTracker } from '../view-model/navigation/top-bar-model.ts'
import {
  createAliyahNavigationActions,
  createNavigationAction,
  createPageNavigationActions,
  type NavigationAction,
} from '../navigation/actions.ts'
import {
  createLazyCommandPalette,
  type LazyCommandPalette,
} from '../navigation/lazy-command-palette.ts'
import {
  holidayLeiningKeywords,
  selectCommandPaletteHolidayRun,
} from '../navigation/holiday-actions.ts'
import {
  generateCueAnalyticsUrl,
  generatePageUrl,
} from '../view-model/navigation/url-parser.ts'
import { isSemanticallyRoutableReaderHash } from '../view-model/navigation/routable-reader-hash.ts'
import {
  generateParshaUrl,
  getParshaSearchTermsForSlug,
  resolveParshaRun,
} from '../view-model/navigation/parsha-routes.ts'
import { iconMarkup, type IconName } from '../components/icons.ts'
import {
  applyReaderPreferences,
  getDefaultReaderPreferences,
  loadReaderPreferencesState,
  mergeReaderPreferences,
  ReaderPreferencesStorageError,
  type ReaderPreferences,
  saveReaderPreferences,
} from '../reader-preferences.ts'
import {
  effectiveReaderSideMode,
  type ReaderPagePresentation,
} from '../reader-presentation.ts'
import {
  PersistedStateConflictError,
  type PersistedJsonRevision,
} from '../persistence/persisted-state.ts'
import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import {
  findAuthoringRecordingForRun,
  findRecordingForRun,
  getCuesForRecording,
  getCueProgressForRecording,
  getIssuesForRecording,
  listNarrators,
  listRecordings,
  parshaSlugForRun,
} from '../audio/library.ts'
import { handleAliyahPermalinkClick } from '../reader/aliyah-permalink.ts'
import {
  createAliyahNavigationSnapshot,
  formatAliyahLabel,
  getAliyahNavigationEntriesForRun,
  resolveActiveTargetForRun,
  type AliyahNavigationItem,
  type AliyahNavigationPlayback,
  type AliyahNavigationTarget,
} from '../reading/aliyah-navigation/model.ts'
import {
  aliyahCueAuthoringActionLabel,
  createAliyahNavigation,
  getMobileAliyahCapsuleState,
  isAliyahCueStatusUnfinished,
  type AliyahCueStatus,
  type AliyahNavigation,
} from '../reading/aliyah-navigation/aliyah-navigation.ts'
import {
  collectTokenKeysForExactAliyahRange,
  firstTokenKeyForExactAliyahStart,
} from '../reading/aliyah-token-sequence.ts'
import {
  createAliyahStartMarker,
  getAliyahStartMarkerPosition,
  getFirstGraphemeRect,
} from '../reading/aliyah-start-marker.ts'
import { isLastIndexedAliyahInRun } from '../reading/aliyah-range.ts'
import {
  findAliyahInRun,
  type PlaybackAliyahIndex,
} from '../reading/aliyah-dom-target.ts'
import {
  aliyahMembershipsForFocalLine,
  isSameAliyahIdentity,
  parseAliyahIndex,
  resolveActiveAliyahIdentity,
  type AliyahIdentity,
} from '../reading/aliyah-identity.ts'
import {
  formatPlaybackDuration as formatDuration,
} from '../reading/playback-timeline.ts'
import { LatestAction } from '../reading/latest-action.ts'
import {
  createReaderPlayback,
  type ReaderPlayback,
} from '../reading/reader-playback.ts'
import { createMount, type MountScope } from '../lifecycle/mount.ts'
import {
  createLastReadingHash,
  loadEligibleLastReading,
  saveLastReading,
  type LastReading,
} from '../reading/last-reading.ts'
import {
  checkpointFromCue,
  checkpointFromIssue,
  compareCheckpoints,
  type Checkpoint,
} from '../reader/checkpoints.ts'
import { parseTokenKey } from '../reader/token-position.ts'
import {
  BookmarkStorageError,
  createBookmark,
  loadBookmarksState,
  saveBookmarks,
  type ReaderBookmark,
} from '../reader/bookmarks.ts'
import {
  createLazyReaderSettings,
  type LazyReaderSettings,
} from '../reader/lazy-reader-settings.ts'
import {
  createReaderControls,
  type ReaderControls,
  type ReaderControlsState,
} from '../reader/reader-controls.ts'
import {
  createReaderShell,
  type ReaderShell,
} from '../reader/reader-shell.ts'
import {
  type ReaderProgressAnchor,
  type ReaderProgressAnchorSnapshot,
} from './reader-progress-anchor-index.ts'
import {
  createReaderDisplaySession,
  type ReaderDisplaySession,
} from './reader-display-session.ts'
import { resolveReaderProgressPresentation } from './reader-progress-presentation.ts'
import {
  createReaderRoute,
  INITIAL_READER_TITLE,
  formatTopBarTitle,
  type ReaderRoute,
  type ReaderRouteRendering,
} from '../reader/reader-route.ts'
import {
  createLastReadingPrompt,
  type LastReadingPrompt,
} from '../reader/last-reading-prompt.ts'
import {
  createOfflineRecordingPrompt,
  type OfflineRecordingPrompt,
} from '../reader/offline-recording-prompt.ts'
import {
  getReaderVisibleIssues,
  loadLocalRecordingIssues,
  mergePublishedAndLocalRecordingIssues,
  recordingIssueReaderLabel,
  type LocalRecordingIssuesSnapshot,
  type RecordingIssue,
} from '../audio/recording-issues.ts'
import {
  createTemporaryShiftToggle,
  createShortcutCommand,
  getShortcutCommand,
  isShortcutEditableTarget,
  type ReaderMode,
  type ShortcutCommand,
} from '../reader/shortcuts.ts'
import {
  isParshaAudioRecording,
  type AudioRecording,
} from '../audio/types.ts'
import {
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'
import { compareRefs } from '../calendar-model/ref-utils.ts'
import {
  loadAdminDraft,
  readVerifiedAdminDraftSummary,
} from '../admin/draft-storage.ts'
import { areCueDraftsEquivalent } from '../admin/draft-cue-comparison.ts'
import {
  type CueAuthoring,
  type CueAuthoringChange,
} from '../admin/cue-authoring.ts'
import {
  createCueAuthoringLoader,
  type CueAuthoringLoader,
} from '../admin/cue-authoring-loader.ts'
import {
  applyRecordingModePreferences,
  type RecordingModeConfig,
  recordingModeAliyahLabel,
} from '../recording-mode.ts'
import {
  centerElementInScrollRoot,
  getReaderFocalPointScrollTop,
} from '../reader-scroll.ts'

export interface ReaderRuntime {
  readonly ready: Promise<void>
  destroy(): void
}

export interface ReaderRuntimeOptions {
  document: Document
  view: Window
  localStorage: Storage | null
  sessionStorage: Storage | null
  recordingMode: RecordingModeConfig
  aboutHref: string
}

export function startReaderRuntime({
  document,
  view,
  localStorage: browserLocalStorage,
  sessionStorage: browserSessionStorage,
  recordingMode,
  aboutHref,
}: ReaderRuntimeOptions): ReaderRuntime {
  const window = view
  const location = view.location
  const navigator = view.navigator
  const requestAnimationFrame = view.requestAnimationFrame.bind(view)
  const cancelAnimationFrame = view.cancelAnimationFrame.bind(view)

  const { whenKey } = utils


  const loadedCalendarSettings = loadCalendarSettingsState(browserLocalStorage)
  let calendarSettings = loadedCalendarSettings.settings
  let calendarSettingsRevision = loadedCalendarSettings.revision
  const createCalendarGenerator = () =>
    new LeiningGenerator(userSettingsFromCalendarSettings(calendarSettings))

  const mountReaderRuntime = createMount()
  let readerDisplaySessionGlobal: ReaderDisplaySession | null = null
  let readerNoticeTimer: number | null = null
  let readerPreferences: ReaderPreferences = getDefaultReaderPreferences()
  let aliyahStartMarkerLayoutFrame = 0
  let aliyahStartMarkerResizeTimer: number | null = null
  let pendingAliyahRailSelection: {
    runId: string
    aliyahIndex: PlaybackAliyahIndex
    expiresAt: number
    maxExpiresAt: number
  } | null = null
  let explicitAliyahSelection: AliyahIdentity | null = null
  let explicitAliyahSelectionHash: string | null = null
  let lastAliyahRailScrollTop: number | null = null
  let aliyahNavigationGlobal: AliyahNavigation | null = null
  const resolvedAliyahCueStatuses = new Map<string, AliyahCueStatus>()
  let readerViewportGlobal: ReaderViewport | null = null
  let cueAuthoringGlobal: CueAuthoring | null = null
  let cueAuthoringLoaderGlobal: CueAuthoringLoader | null = null
  let readerPlaybackGlobal: ReaderPlayback | null = null
  let readerSettingsGlobal: LazyReaderSettings | null = null
  let readerControlsGlobal: ReaderControls | null = null
  let readerShellGlobal: ReaderShell | null = null
  let readerRouteGlobal: ReaderRoute | null = null
  let lastReadingPromptGlobal: LastReadingPrompt | null = null
  let commandPaletteGlobal: LazyCommandPalette | null = null
  let offlineRecordingPromptGlobal: OfflineRecordingPrompt | null = null
  let bookmarks: ReaderBookmark[] = []
  let bookmarkRevision: PersistedJsonRevision | null = null
  let readerPreferencesRevision: PersistedJsonRevision | null = null
  let publishedRecordingIssues: RecordingIssue[] = []
  let localRecordingIssues: RecordingIssue[] = []
  let localRecordingIssueRevision: LocalRecordingIssuesSnapshot['revision'] = null
  let mergedRecordingIssues: RecordingIssue[] = []
  let currentReaderMode: ReaderMode = recordingMode.enabled ? 'recording' : 'normal'
  let annotationsEnabled = true
  let hasUserScrolledReaderForLastReading = false
  let readerUrlSyncArmed = false
  let readerUrlPreviousFocalPosition: number | null = null
  let readerUrlScrollPending = false

  function getReaderDisplaySession() {
    if (!readerDisplaySessionGlobal) {
      throw new Error('Reader display session is not mounted')
    }
    return readerDisplaySessionGlobal
  }

  function resolvedAliyahCueStatusKey(
    runId: string,
    aliyahIndex: PlaybackAliyahIndex,
    recordingId: string
  ) {
    return `${runId}:${aliyahIndex}:${recordingId}`
  }

  function getResolvedAliyahCueStatus(
    runId: string,
    aliyahIndex: PlaybackAliyahIndex,
    recordingId: string
  ) {
    return resolvedAliyahCueStatuses.get(
      resolvedAliyahCueStatusKey(runId, aliyahIndex, recordingId)
    ) ?? null
  }

  function invalidateAliyahCueStatuses() {
    resolvedAliyahCueStatuses.clear()
    aliyahNavigationGlobal?.invalidate()
  }

  function scheduleSpecialLetterAlignment(
    root: Document | Element,
    signal: AbortSignal
  ) {
    void alignSmallSpecialLettersWhenFontsReady(root, signal)
      .then(() => {
        if (signal.aborted || !readerDisplaySessionGlobal) return
        readerDisplaySessionGlobal.invalidateProgressAnchors('text-layout')
        invalidateReaderPositionAfterLayout()
      })
      .catch((error) => {
        console.error('Failed to align special Hebrew letters', error)
      })
  }

  function getDebugActiveTokenKey() {
    return new URLSearchParams(location.search).get('debugActiveToken')
  }

  function renderReaderModel(target: ScrollViewModel): ReaderRouteRendering {
    return getReaderDisplaySession().render(target)
  }

  function deactivateReaderRuntime() {
    readerDisplaySessionGlobal?.deactivate()
  }

  function showReaderNotice(
    message: string,
    { assertive = false }: { assertive?: boolean } = {}
  ) {
    const toast = document.querySelector<HTMLElement>(
      '[data-target-id="persistence-toast"]'
    )
    if (!toast) return
    if (readerNoticeTimer !== null) window.clearTimeout(readerNoticeTimer)
    toast.setAttribute('role', assertive ? 'alert' : 'status')
    toast.setAttribute('aria-live', assertive ? 'assertive' : 'polite')
    toast.textContent = message
    toast.classList.remove('u-hidden')
    readerNoticeTimer = window.setTimeout(() => {
      toast.classList.add('u-hidden')
      toast.textContent = ''
      toast.setAttribute('role', 'status')
      toast.setAttribute('aria-live', 'polite')
      readerNoticeTimer = null
    }, 6_000)
  }

  const showPersistenceNotice = (message: string) => showReaderNotice(message)

  function readerHashFromAnchor(anchor: ReaderProgressAnchor | null) {
    if (!anchor?.run) return null
    const aliyah = anchor.run.aliyot.find(
      (candidate) => candidate.index === anchor.aliyahIndex
    )
    const hash = aliyah?.start
      ? createLastReadingHash(anchor.run, aliyah.start)
      : createLastReadingHash(anchor.run)
    return !hash || hash === '#/next' ? null : hash
  }

  function lastReadingInputFromAnchor(
    anchor: ReaderProgressAnchor | null
  ) {
    const activeDisplay = readerDisplaySessionGlobal?.capture()
    const hash = readerHashFromAnchor(anchor)
    if (!activeDisplay || !anchor?.run || !hash) return null
    return {
      hash,
      parshaName: activeDisplay.viewModel.displayTitleForRun(anchor.run),
      aliyahLabel: anchor.label === '—' ? undefined : anchor.label,
    }
  }

  function saveLastReadingFromAnchor(
    anchor: ReaderProgressAnchor | null
  ) {
    if (
      recordingMode.enabled ||
      readerRouteGlobal?.snapshot().view !== 'reader'
    ) {
      return
    }
    const input = lastReadingInputFromAnchor(anchor)
    if (!input) return
    try {
      saveLastReading(browserLocalStorage, input)
    } catch (error) {
      console.error('Failed to save the current reading position', error)
      showPersistenceNotice('Your reading position could not be saved in this browser.')
    }
  }

  function currentReadingAnchor() {
    const displaySession = readerDisplaySessionGlobal
    if (!displaySession?.capture()) return null
    const book = getBook()
    return displaySession
      .progressSnapshot()
      .at(getReaderFocalPointScrollTop(book)).current
  }

  function captureCurrentLastReading(): LastReading | null {
    const route = readerRouteGlobal?.snapshot()
    if (recordingMode.enabled || route?.view !== 'reader') return null
    const input = lastReadingInputFromAnchor(currentReadingAnchor())
    const savedAt = Date.now()
    if (input) return { ...input, savedAt }

    const activeDisplay = readerDisplaySessionGlobal?.capture()
    if (activeDisplay) {
      const titledRun = activeDisplay.viewModel.relevantRuns.find(
        (run) =>
          formatTopBarTitle(activeDisplay.viewModel.displayTitleForRun(run)) ===
          route.title
      )
      if (titledRun) {
        return {
          hash: createLastReadingHash(titledRun, titledRun.aliyot[0]?.start),
          parshaName: activeDisplay.viewModel.displayTitleForRun(titledRun),
          savedAt,
        }
      }
    }

    const hash =
      route.currentReaderHash === '#/next' ? null : route.currentReaderHash
    if (!hash) return null
    return {
      hash,
      parshaName: route.title,
      savedAt,
    }
  }

  function saveCurrentLastReading() {
    saveLastReadingFromAnchor(currentReadingAnchor())
  }

  function resetReaderSideNavigationState() {
    aliyahNavigationGlobal?.closeCompact()
    readerPlaybackGlobal?.resetRoute()
    publishedRecordingIssues = []
    localRecordingIssues = []
    localRecordingIssueRevision = null
    mergedRecordingIssues = []
    cueAuthoringGlobal?.recordingIssuesChanged()
    cueAuthoringGlobal?.clearSession()
    syncActiveReaderIssueNotice()
    refreshInlineAudioButtons()
    syncAliyahNavigationToolbar(null)
  }

  function updateCalendarSettings(settings: CalendarSettings) {
    try {
      calendarSettingsRevision = saveCalendarSettings(
        settings,
        browserLocalStorage,
        calendarSettingsRevision
      )
    } catch (error) {
      console.error('Failed to save calendar settings', error)
      if (
        error instanceof CalendarSettingsStorageError &&
        error.cause instanceof PersistedStateConflictError &&
        error.cause.reason === 'conflict'
      ) {
        const latest = loadCalendarSettingsState(browserLocalStorage)
        try {
          calendarSettingsRevision = saveCalendarSettings(
            settings,
            browserLocalStorage,
            latest.revision
          )
        } catch (retryError) {
          console.error(
            'Failed to save calendar settings after refreshing browser state',
            retryError
          )
          showPersistenceNotice(
            'Calendar settings changed in another tab. This choice applies now but could not be saved.'
          )
        }
      } else {
        showPersistenceNotice('Calendar settings will apply now but could not be saved.')
      }
    }
    calendarSettings = settings
  }

  const setAnnotationsEnabled = (enabled: boolean) => {
    annotationsEnabled = enabled
    getReaderShell().setAnnotationsEnabled(enabled)
    const book = getBook()
    applyAnnotationMode(book, enabled)
    if (
      book.dataset.readerLayout === 'match' &&
      book.dataset.readerSides === 'one'
    ) {
      book.querySelectorAll<HTMLElement>('.tikkun-page').forEach((page) => {
        applyReaderPageLayout(page, { layout: 'match', sides: 'one' })
      })
    }
    const displaySession = readerDisplaySessionGlobal
    displaySession?.invalidateProgressAnchors('annotations')
    const activeDisplay = displaySession?.capture()
    if (activeDisplay) {
      scheduleSpecialLetterAlignment(book, activeDisplay.signal)
    }
    scheduleAliyahStartMarkerLayout(book)
    if (displaySession) invalidateReaderPositionAfterLayout()
    readerControlsGlobal?.sync()
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
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        if (!target.closest('[data-target-id="debug-focal-measure-toggle"]')) {
          return
        }
        toggleDebugFocalMeasure()
      },
      { signal: scope.signal }
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

  function selectAliyah(identity: AliyahIdentity) {
    explicitAliyahSelection = identity
    explicitAliyahSelectionHash =
      readerRouteGlobal?.snapshot().hashPath ?? location.hash.split('?', 1)[0]
  }

  function clearExplicitAliyahSelection() {
    explicitAliyahSelection = null
    explicitAliyahSelectionHash = null
  }

  function getBook() {
    return document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
  }

  function getEffectiveReaderPagePresentation(): ReaderPagePresentation {
    return {
      layout: readerPreferences.readerTextLayout,
      sides: effectiveReaderSideMode(
        readerPreferences.readerSideMode,
        isCompactReaderViewport()
      ),
    }
  }

  function syncEffectiveReaderPagePresentation({
    rerender = true,
    beforeLayout,
  }: { rerender?: boolean; beforeLayout?: () => void } = {}) {
    const book = getBook()
    const presentation = getEffectiveReaderPagePresentation()
    // The display must capture the old geometry before these attributes change.
    const changed = rerender &&
      (readerDisplaySessionGlobal?.setPagePresentation(presentation, beforeLayout) ?? false)
    if (!changed) beforeLayout?.()
    book.dataset.readerLayout = presentation.layout
    book.dataset.readerSides = presentation.sides
    if (!changed) return false
    readerDisplaySessionGlobal?.invalidateProgressAnchors('text-layout')
    const activeSignal = readerDisplaySessionGlobal?.capture()?.signal
    if (activeSignal) scheduleSpecialLetterAlignment(book, activeSignal)
    scheduleAliyahStartMarkerLayout(book)
    invalidateReaderPositionAfterLayout()
    void readerPlaybackGlobal?.syncHighlight({ scroll: false })
    return true
  }

  function getReaderShell() {
    if (!readerShellGlobal) throw new Error('Reader Shell is not mounted')
    return readerShellGlobal
  }

  function focusReaderSurface() {
    getBook().focus({ preventScroll: true })
  }

  function isCompactReaderViewport() {
    return readerViewportGlobal?.isCompact() ?? false
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
    const nextReaderMode = getReaderMode()
    const changed = nextReaderMode !== currentReaderMode
    currentReaderMode = nextReaderMode
    document.documentElement.dataset.readerMode = currentReaderMode
    if (!changed) return

    if (readerPlaybackGlobal) refreshReaderChrome()
    else syncAliyahNavigationContent()
  }

  function getActiveTokenKey() {
    const highlighted = readerPlaybackGlobal?.snapshot().activeTokenKey
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
    const displaySession = getReaderDisplaySession()
    const virtualizationHold = displaySession.holdNavigation()
    try {
      await displaySession
        .capture()
        ?.ensurePageMountedForNavigation(position.pageNumber)
      virtualizationHold.releaseAfterNavigation()
      const token = await readerPlaybackGlobal?.activateToken(tokenKey, {
        scroll: true,
      })
      if (!token) virtualizationHold.release()
      if (
        options.audioTime !== undefined &&
        readerPlaybackGlobal?.snapshot().session
      ) {
        readerPlaybackGlobal.seek(options.audioTime)
      }
      if (token) {
        syncAliyahNavigationToolbar(
          displaySession.progressAnchorForElement(token)
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
      refreshReaderSearch()
      readerControlsGlobal?.sync()
      return
    }

    const session = readerPlaybackGlobal?.snapshot().session
    const cue = readerPlaybackGlobal?.cueForToken(tokenKey)
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
    refreshReaderSearch()
    readerControlsGlobal?.sync()
  }

  function persistBookmarks(nextBookmarks: ReaderBookmark[]) {
    try {
      bookmarkRevision = saveBookmarks(
        browserLocalStorage,
        nextBookmarks,
        bookmarkRevision
      )
      return true
    } catch (error) {
      console.error('Failed to save reader bookmarks', error)
      if (
        error instanceof BookmarkStorageError &&
        error.cause instanceof PersistedStateConflictError &&
        error.cause.reason === 'conflict'
      ) {
        const latest = loadBookmarksState(
          browserLocalStorage,
          isSemanticallyRoutableReaderHash
        )
        bookmarks = latest.bookmarks
        bookmarkRevision = latest.revision
        refreshReaderSearch()
        readerControlsGlobal?.sync()
        showPersistenceNotice(
          'Bookmarks changed in another tab. Review the latest list and try again.'
        )
        return false
      }
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
    return {
      bookmarkAvailable: Boolean(tokenKey),
      bookmarked: isBookmarked,
      annotationsEnabled,
      aliyahNavigationAvailable: isAliyahRailRouteAvailable(),
    }
  }

  function getBookmarkHashForTokenKey(tokenKey: string) {
    const token = document.querySelector<HTMLElement>(`[data-token-key="${tokenKey}"]`)
    const lineInfo = token ? getLineInfoFromElement(token) : null
    const verse = lineInfo?.verses[0]
    const initialRef = verse && lineInfo?.run
      ? { ...verse, scroll: lineInfo.run.scroll }
      : lineInfo?.run?.aliyot[0]?.start

    if (lineInfo?.run) return createLastReadingHash(lineInfo.run, initialRef)
    const currentReaderHash = readerRouteGlobal?.snapshot().currentReaderHash
    return currentReaderHash && currentReaderHash !== '#/next'
      ? currentReaderHash
      : location.hash
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
      ...getReaderVisibleIssues(mergedRecordingIssues).map(checkpointFromIssue),
    ]

    const session = readerPlaybackGlobal?.snapshot().session
    const activeTokenKey = getActiveTokenKey()
    if (session && activeTokenKey) {
      const cue = readerPlaybackGlobal?.cueForToken(activeTokenKey)
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

  async function scrollToAliyahMarker(
    runId: string,
    aliyahIndex: PlaybackAliyahIndex,
    actionToken = railScrollAction.start()
  ) {
    const displaySession = getReaderDisplaySession()
    const virtualizationHold = displaySession.holdNavigation()
    let target
    try {
      target = await displaySession.ensureAliyahDomTargetRendered(
        runId,
        aliyahIndex
      )
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
    syncAliyahNavigationToolbar(
      displaySession.progressAnchorForElement(line ?? target.element)
    )
    displaySession.refreshViewport()
    invalidateReaderPosition()
    window.setTimeout(() => {
      displaySession.refreshViewport()
      invalidateReaderPosition()
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
              aliases: [leiningDate.title.en, leiningDate.title.he],
              keywords: holidayLeiningKeywords(leiningDate.title, `${leining.id}`),
              showWhenEmpty: false,
              destinationId: createLastReadingHash(run),
              href: createLastReadingHash(run),
              run: () => readerRouteGlobal?.navigate(createLastReadingHash(run)),
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
              navigate: (hash) => readerRouteGlobal?.navigate(hash),
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
                navigate: (hash) => readerRouteGlobal?.navigate(hash),
              })
            )
          }
        }
      }
    }

    return actions
  }

  function recordingActionAliases(
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

  function createReaderSearchActions() {
    const actions: NavigationAction[] = [
      createNavigationAction({
        id: 'reading.current',
        group: 'reading',
        label: 'Today / Next Reading',
        aliases: ['Today', 'Next Reading', 'Next Shabbat'],
        keywords: ['current reading', 'upcoming reading'],
        emptyPriority: 100,
        destinationId: '#/next',
        href: '#/next',
        run: () => readerRouteGlobal?.navigate('#/next'),
      }),
      createNavigationAction({
        id: 'tools.analytics',
        group: 'tools',
        label: 'Cue Analytics',
        aliases: ['Playback Analytics', 'Word Analytics'],
        keywords: ['timing'],
        emptyPriority: 40,
        run: () => readerRouteGlobal?.navigate(generateCueAnalyticsUrl()),
      }),
      createNavigationAction({
        id: 'tools.settings',
        group: 'tools',
        label: 'Reader Settings',
        aliases: ['Preferences'],
        keywords: ['theme', 'highlight'],
        emptyPriority: 39,
        run: () => readerSettingsGlobal?.open(),
      }),
      createNavigationAction({
        id: 'admin.open',
        group: 'admin',
        label: 'Cue Authoring',
        keywords: ['timing', 'authoring', 'record cues'],
        available: cueAuthoringLoaderGlobal?.isUnlocked() ?? false,
        emptyPriority: 30,
        run: () => cueAuthoringLoaderGlobal?.open(),
      }),
    ]

    actions.push(...upcomingHolidayLeiningActions())

    const activeDisplay = readerDisplaySessionGlobal?.capture()
    if (activeDisplay) {
      const anchors = getReaderDisplaySession().progressSnapshot().anchors
      const activeRun =
        getCurrentAliyahFromViewportRange(
          readerDisplaySessionGlobal?.viewportRange() ?? null,
          anchors
        )?.run ??
        anchors.find((anchor) => anchor.run)?.run ??
        null
      if (activeRun) {
        const activeParshaSlug = activeRun.leining.isParsha
          ? parshaSlugForRun(activeRun)
          : null
        actions.push(
          ...createAliyahNavigationActions({
            run: activeRun,
            displayTitle: activeDisplay.viewModel.displayTitleForRun(activeRun),
            dedupeKeyPrefix: activeParshaSlug
              ? `reading.parsha.${activeParshaSlug}`
              : undefined,
            emptyPriority: 85,
            showWhenEmpty: false,
            navigate: (hash) => readerRouteGlobal?.navigate(hash),
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
          destinationId: targetHash,
          searchConstraint: {
            kind: 'aliyah',
            aliyah: recording.aliyah,
            allowTerms: ['recording', 'audio'],
          },
          href: targetHash,
          aliases: recordingActionAliases(recording),
          keywords: ['recording', 'audio'],
          showWhenEmpty: false,
          run: () => readerRouteGlobal?.navigate(targetHash),
        })
      )
    }

    actions.push(...searchableParshaActions())
    actions.push(...searchableHolidayActions())
    actions.push(
      ...createPageNavigationActions({
        navigateToPage: (scroll, page) =>
          readerRouteGlobal?.navigate(generatePageUrl(scroll, page)),
      })
    )

    const lastReading = loadEligibleLastReading(
      browserLocalStorage,
      Date.now(),
      isSemanticallyRoutableReaderHash
    )
    if (lastReading) {
      actions.push(
        createNavigationAction({
          id: 'resume.last-reading',
          group: 'resume',
          label: `Resume ${lastReading.aliyahLabel ? `${lastReading.parshaName}, ${lastReading.aliyahLabel}` : lastReading.parshaName}`,
          aliases: ['Resume Reading', 'Last Reading'],
          keywords: ['resume', 'last reading'],
          emptyPriority: 95,
          destinationId: lastReading.hash,
          href: lastReading.hash,
          run: () => readerRouteGlobal?.navigate(lastReading.hash),
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
          emptyPriority: checkpoint.kind === 'bookmark' ? 90 : 88,
          run: () => jumpToCheckpoint(checkpoint),
        })
      )
    }

    return actions
  }

  function refreshReaderSearch() {
    commandPaletteGlobal?.refresh()
    readerRouteGlobal?.refreshPickerSearch()
  }

  function openReaderSearch() {
    if (readerRouteGlobal?.focusPickerSearch()) {
      commandPaletteGlobal?.close()
      return
    }
    commandPaletteGlobal?.open()
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
      if (scope.signal.aborted) return
      readerDisplaySessionGlobal?.invalidateProgressAnchors('text-layout')
      scheduleAliyahStartMarkerLayout(book)
      if (readerDisplaySessionGlobal) invalidateReaderPositionAfterLayout()
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
        run: openReaderSearch,
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
          void readerPlaybackGlobal?.replayCurrentCue()
        },
      }),
    ]

    document.addEventListener(
      'keydown',
      (event) => {
        syncReaderMode()
        const command = getShortcutCommand(commands, event, currentReaderMode)
        if (!command) return
        const isSearchShortcutWithinSearch =
          command.id === 'palette.open' &&
          event.target instanceof Element &&
          Boolean(event.target.closest('[data-target-id="reader-search"]'))
        if (isSearchShortcutWithinSearch) return
        const isSearchShortcutWhileOpen =
          command.id === 'palette.open' &&
          ((commandPaletteGlobal?.isOpen() ?? false) ||
            (readerRouteGlobal?.snapshot().pickerOpen ?? false))
        if (isShortcutEditableTarget(event.target) && !isSearchShortcutWhileOpen) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        command.run()
      },
      { capture: true, signal: scope.signal }
    )
  }

  function getPreferredMobileAliyahRun(currentRun: LeiningRun | null) {
    const routeSnapshot = readerRouteGlobal?.snapshot()
    const slugMatch = routeSnapshot?.hashPath.match(
      /^#\/torah\/parsha\/([^/?]+)/
    )
    const routeSlug = slugMatch?.[1]
    const activeDisplay = readerDisplaySessionGlobal?.capture()
    if (!routeSlug || !activeDisplay) return currentRun

    const resolved = resolveParshaRun(
      createCalendarGenerator(),
      decodeURIComponent(routeSlug)
    )
    const preferredRun = resolved
      ? activeDisplay.viewModel.relevantRuns.find(
          (run) => run.id === resolved.run.id
        ) ?? null
      : null
    if (!preferredRun) return currentRun

    const preferredTitle = formatTopBarTitle(
      activeDisplay.viewModel.displayTitleForRun(preferredRun)
    )
    return routeSnapshot?.title === preferredTitle ? preferredRun : currentRun
  }

  function getAliyahNavigationPlayback(): AliyahNavigationPlayback {
    const playback = readerPlaybackGlobal?.snapshot()
    const session = playback?.session
    return {
      target: session
        ? { runId: session.runId, aliyahIndex: session.aliyahIndex }
        : null,
      playing: playback?.playing ?? false,
      progressLabel:
        playback && session
          ? `${formatDuration(playback.currentTime)}/${formatDuration(
              playback.duration
            )}`
          : '',
    }
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

  function isAliyahRailRouteAvailable() {
    const route = readerRouteGlobal?.snapshot()
    return route?.view === 'reader' && !route.pickerOpen
  }

  function getAliyahNavigationRecording(
    target: AliyahNavigationTarget,
    { includePreviousOverlap = false }: { includePreviousOverlap?: boolean } = {}
  ) {
    const activeDisplay = readerDisplaySessionGlobal?.capture()
    const run =
      activeDisplay?.viewModel.relevantRuns.find(
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
      getAudio: ({ run, aliyah }) => {
        const recording = findRecordingForRun({
          narratorId: readerPreferences.narratorId,
          run,
          aliyahIndex: aliyah.index,
        })
        return {
          playbackKey:
            (recording ?? getPreviousOverlapRecording(run, aliyah.index))
              ?.id ?? null,
          recordingKey: recording?.id ?? null,
        }
      },
    })
  }

  function syncAliyahNavigationContent(
    range: ViewportRange | null =
      readerDisplaySessionGlobal?.viewportRange() ?? null,
    progressSnapshot?: ReaderProgressAnchorSnapshot
  ) {
    if (!isAliyahRailRouteAvailable()) {
      aliyahNavigationGlobal?.clearContent()
      readerDisplaySessionGlobal?.syncAudioPreload(null)
      return
    }

    const anchors = (
      progressSnapshot ?? getReaderDisplaySession().progressSnapshot()
    ).anchors
    const current = getCurrentAliyahFromViewportRange(range, anchors)
    const currentRun = current?.run ?? anchors.find((anchor) => anchor.run)?.run ?? null

    if (!currentRun) {
      aliyahNavigationGlobal?.clearContent()
      readerDisplaySessionGlobal?.syncAudioPreload(null)
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

    syncCurrentAliyahAudioPreload(currentRun, currentTarget?.aliyahIndex ?? null)
    getReaderDisplaySession().scheduleResourcePrewarm(
      desktopEntries.flatMap(({ run, aliyah }) =>
        aliyah.index ? [{ run, aliyahIndex: aliyah.index }] : []
      ),
      desktopSnapshot.signature
    )
    aliyahNavigationGlobal?.syncContent({
      desktop: desktopSnapshot,
      compact: mobileSnapshot,
      authoringEnabled: cueAuthoringGlobal?.isActive() ?? false,
    })
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
    aliyahNavigationGlobal?.setActive({ runId, aliyahIndex })

    const actionToken = railScrollAction.start()
    void scrollToAliyahMarker(runId, aliyahIndex, actionToken)
  }

  function mountAliyahNavigation(scope: MountScope) {
    const navigation = createAliyahNavigation(scope, {
      document,
      onSelect: (target) =>
        selectAndScrollToAliyah(target.runId, target.aliyahIndex),
      onPlayCompact: async (target) => {
        await startPlaybackForToolbarCurrentAliyah(target)
        if (!scope.signal.aborted) saveCurrentLastReading()
        return getAliyahNavigationPlayback()
      },
      onPlayCurrent: async (target) => {
        await startPlaybackForToolbarCurrentAliyah(target)
        focusReaderSurface()
      },
      onBeforeCompactOpen: () => {
        const playback = readerPlaybackGlobal?.snapshot()
        if (playback?.session && playback.playing) {
          readerPlaybackGlobal?.pause()
        }
        return getAliyahNavigationPlayback()
      },
      onAfterNavigate: focusReaderSurface,
      onWideHidden: closeAliyahStartPopup,
      restoreFocus: focusOverlayReturnTarget,
      getReaderFocusTarget: getBook,
      loadCueStatus: (item) =>
        getAliyahRailCueStatus(getAliyahNavigationRecording(item.target)),
      onCueStatusChange: (item, status) => {
        if (!item.recordingKey) return
        resolvedAliyahCueStatuses.set(
          resolvedAliyahCueStatusKey(
            item.target.runId,
            item.target.aliyahIndex,
            item.recordingKey
          ),
          status
        )
        refreshInlineAudioButtons()
      },
      loadDurationLabel: loadMobileAliyahDurationLabel,
      onCueStatusError: (error, item) => {
        console.error(`Failed to load Cue Data status for ${item.key}`, error)
      },
      onDurationError: (error, item) => {
        console.error(
          `Failed to load duration for ${item.audioKey ?? item.key}`,
          error
        )
      },
    })

    aliyahNavigationGlobal = navigation
    scope.own(() => {
      if (aliyahNavigationGlobal === navigation) {
        aliyahNavigationGlobal = null
      }
    })
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
    const activeSession = readerPlaybackGlobal?.snapshot().session
    const draftTokenKeys =
      activeSession?.recording.id === recording.id
        ? activeSession.tokenKeys
        : null
    if (draftTokenKeys) {
      const draftSummary = readVerifiedAdminDraftSummary(
        recording,
        draftTokenKeys
      )
      if (draftSummary?.cueCount) {
        const draft = loadAdminDraft(recording, draftTokenKeys)
        const publishedCues = await getCuesForRecording(recording)
        if (
          !publishedCues.length ||
          !draft ||
          !areCueDraftsEquivalent(draft.cues, publishedCues)
        ) {
          return 'local-draft'
        }
      }
    }

    if (progress?.isComplete) return 'published'
    if (progress?.isUnfinished) return 'pending'

    return 'none'
  }

  async function loadIssuesForActiveSession() {
    const playback = readerPlaybackGlobal?.snapshot()
    const session = playback?.session
    const recording =
      cueAuthoringGlobal?.isVisible() && cueAuthoringGlobal.getSession()
        ? session?.recording ?? null
      : session?.activeRecording ?? session?.recording ?? null
    const sessionRevision = playback?.sessionRevision
    const actionToken = recordingIssueLoadAction.start()
    publishedRecordingIssues = []
    localRecordingIssues = []
    localRecordingIssueRevision = null
    mergedRecordingIssues = []
    cueAuthoringGlobal?.recordingIssuesChanged()
    applyReaderVisibleIssueMarkers()
    syncActiveReaderIssueNotice()

    if (session && recording) {
      const publishedIssues = await getIssuesForRecording(
        recording,
        TOKENIZATION_VERSION
      )
      const currentPlayback = readerPlaybackGlobal?.snapshot()
      const currentRecording =
        cueAuthoringGlobal?.isVisible() && cueAuthoringGlobal.getSession()
        ? currentPlayback?.session?.recording ?? null
        : currentPlayback?.session?.activeRecording ?? null
      if (
        !recordingIssueLoadAction.isCurrent(actionToken) ||
        currentPlayback?.sessionRevision !== sessionRevision ||
        currentRecording?.id !== recording.id
      ) return
      let localSnapshot: LocalRecordingIssuesSnapshot = {
        issues: [],
        revision: null,
      }
      try {
        localSnapshot = loadLocalRecordingIssues(
          browserLocalStorage,
          recording.id,
          TOKENIZATION_VERSION
        )
      } catch (error) {
        console.error(`Recording issue storage is unavailable for ${recording.id}`, error)
      }
      publishedRecordingIssues = publishedIssues
      localRecordingIssues = localSnapshot.issues
      localRecordingIssueRevision = localSnapshot.revision
      mergedRecordingIssues = mergePublishedAndLocalRecordingIssues(
        publishedRecordingIssues,
        localRecordingIssues
      )
      cueAuthoringGlobal?.recordingIssuesChanged()
      applyReaderVisibleIssueMarkers()
      syncActiveReaderIssueNotice()
    }

    refreshReaderSearch()
  }

  function applyReaderVisibleIssueMarkers(root: ParentNode = getBook()) {
    root.querySelectorAll<HTMLElement>('.word[data-recording-issue]').forEach((word) => {
      word.removeAttribute('data-recording-issue')
      word.removeAttribute('title')
    })

    for (const issue of getReaderVisibleIssues(mergedRecordingIssues)) {
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
      ? getReaderVisibleIssues(mergedRecordingIssues).find((candidate) => candidate.tokenKey === tokenKey)
      : null

    if (!issue) {
      toast.classList.add('u-hidden')
      toast.textContent = ''
      return
    }

    toast.textContent = issue.note?.trim() || recordingIssueReaderLabel(issue)
    toast.classList.remove('u-hidden')
  }


  function recordOfflinePlaybackFailure(retry: () => Promise<void>) {
    const failedPlayback = readerPlaybackGlobal
    if (!failedPlayback) return
    const activeDisplay = readerDisplaySessionGlobal?.capture()
    const failedSessionRevision = failedPlayback.snapshot().sessionRevision
    offlineRecordingPromptGlobal?.recordPlaybackFailure(
      retry,
      () =>
        readerPlaybackGlobal === failedPlayback &&
        failedPlayback.snapshot().sessionRevision === failedSessionRevision &&
        (activeDisplay?.isCurrent() ?? true)
    )
  }

  function parsePlaybackAliyahIndex(
    value: string | undefined
  ): PlaybackAliyahIndex | null {
    return parseAliyahIndex(value)
  }

  function isCurrentPlaybackTarget(
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
        readerPlaybackGlobal?.isTargetActive({
          recordingId: recording?.id ?? null,
          runId,
          aliyahIndex,
        })
    )
  }

  function isLastAliyahInRun(runId: string, aliyahIndex: PlaybackAliyahIndex) {
    const run = readerDisplaySessionGlobal
      ?.capture()
      ?.viewModel.relevantRuns.find((candidate) => candidate.id === runId)
    return isLastIndexedAliyahInRun(run, aliyahIndex)
  }

  function isLastAliyahProgressAnchor(
    anchor: ReaderProgressAnchor | null | undefined
  ) {
    return Boolean(
      anchor?.run?.id &&
        anchor.aliyahIndex &&
        isLastAliyahInRun(anchor.run.id, anchor.aliyahIndex)
    )
  }

  const railScrollAction = new LatestAction()
  const playbackAction = new LatestAction()
  const recordingIssueLoadAction = new LatestAction()

  function resetDisplayResources() {
    readerPlaybackGlobal?.resetRecordingCache()
    railScrollAction.cancel()
    playbackAction.cancel()
  }

  function isPlaybackActive() {
    return readerPlaybackGlobal?.snapshot().playing ?? false
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
    readerDisplaySessionGlobal?.syncAudioPreload(src)
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

  function getCenterLineAliyahMemberships(range: ViewportRange | null) {
    const center = range?.center
    const centerRun = center?.run
    const activeDisplay = readerDisplaySessionGlobal?.capture()
    const memberships = center
      ? aliyahMembershipsForFocalLine({
          runs:
            activeDisplay?.viewModel.relevantRuns ??
            (centerRun ? [centerRun] : []),
          lineRun: centerRun,
          focalRef: center.focalRef,
          aliyot: center.aliyot,
          aliyahStarts: center.aliyahStarts,
        })
      : []

    return { centerRun, memberships }
  }

  function progressAnchorForAliyahIdentity(
    identity: AliyahIdentity | null,
    centerRun: LeiningRun | undefined,
    anchors: readonly ReaderProgressAnchor[]
  ): ReaderProgressAnchor | null {
    if (!identity) return null

    const activeRun =
      readerDisplaySessionGlobal
        ?.capture()
        ?.viewModel.relevantRuns.find((run) => run.id === identity.runId) ??
      (centerRun?.id === identity.runId ? centerRun : null)
    if (!activeRun) return null

    const matchingAnchor = anchors.find(
      (anchor) =>
        anchor.run?.id === identity.runId &&
        anchor.aliyahIndex === identity.index
    )
    if (matchingAnchor) {
      return {
        ...matchingAnchor,
        label: formatAliyahLabel(identity.index),
      }
    }

    return {
      line: null,
      label: formatAliyahLabel(identity.index),
      run: activeRun,
      aliyahIndex: identity.index,
      position: getReaderFocalPointScrollTop(getBook()),
    }
  }

  function getCurrentAliyahFromViewportRange(
    range: ViewportRange | null,
    anchors: readonly ReaderProgressAnchor[]
  ): ReaderProgressAnchor | null {
    const { centerRun, memberships } = getCenterLineAliyahMemberships(range)

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

    const playbackSession = readerPlaybackGlobal?.snapshot().session
    const playback =
      playbackSession && isPlaybackActive()
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

    return progressAnchorForAliyahIdentity(activeIdentity, centerRun, anchors)
  }

  function getCrossedAliyahStartAnchor(
    anchors: readonly ReaderProgressAnchor[],
    previousPosition: number | null,
    currentPosition: number
  ) {
    if (previousPosition === null || currentPosition === previousPosition) {
      return null
    }

    // Start lines are directional checkpoints: keep the current URL between
    // crossings, including when its own start line is crossed in reverse.
    if (currentPosition > previousPosition) {
      for (let index = anchors.length - 1; index >= 0; index -= 1) {
        const anchor = anchors[index]
        if (anchor.position > currentPosition) continue
        if (anchor.position <= previousPosition) break
        return anchor
      }
      return null
    }

    for (const anchor of anchors) {
      if (anchor.position < currentPosition) continue
      if (anchor.position >= previousPosition) break
      return anchor
    }
    return null
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

    const centerLine = readerDisplaySessionGlobal?.viewportRange()?.center
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
    readerDisplaySessionGlobal?.refreshViewport()
    invalidateReaderPosition()
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
    const activeDisplay = readerDisplaySessionGlobal?.capture()
    const run =
      activeDisplay?.viewModel.relevantRuns.find(
        (candidate) => candidate.id === runId
      ) ??
      (lineInfo?.run?.id === runId ? lineInfo.run : null) ??
      (runId ? createCalendarGenerator().parseId(runId) : null)
    if (!run) return null

    const availability =
      readerPlaybackGlobal?.lookupRecording(run, aliyahIndex)
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
      readerPlaybackGlobal?.lookupRecording(run, aliyahIndex)
        .overlapRecording ?? null
    )
  }

  function authorizePlaybackForUserGesture(
    ...recordings: Array<AudioRecording | null | undefined>
  ) {
    readerPlaybackGlobal?.authorizePlayback(...recordings)
  }

  function refreshInlineAudioButtons() {
    const playback = readerPlaybackGlobal?.snapshot()
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-audio-button="true"]'
    )) {
      const state = getSessionButtonState(button)
      const available = Boolean(state?.available)
      const authoringEnabled = cueAuthoringGlobal?.isActive() ?? false
      const authoringAvailable = Boolean(
        state && authoringEnabled && !state.recording
      )
      const cueStatus = state?.recording
        ? getResolvedAliyahCueStatus(
            state.run.id,
            state.aliyahIndex,
            state.recording.id
          )
        : null
      const cueIsIncomplete = Boolean(
        state?.recording &&
        cueStatus &&
        isAliyahCueStatusUnfinished(cueStatus)
      )
      const isCurrentSession = isCurrentPlaybackTarget({
        recording: state?.recording,
        runId: state?.run.id,
        aliyahIndex: state?.aliyahIndex,
      })
      const isPlayingCurrentSession = Boolean(
        isCurrentSession && playback?.playing
      )

      button.disabled = !available && !authoringAvailable
      setControlIcon(button, isPlayingCurrentSession ? 'pause' : 'play')
      const label = state?.lineInfo.labels[0] ?? 'aliyah'
      button.title = authoringAvailable
        ? `Select ${label} for audio and cue recording`
        : authoringEnabled && cueIsIncomplete && cueStatus
          ? aliyahCueAuthoringActionLabel({
              label,
              status: cueStatus,
              playing: isPlayingCurrentSession,
            })
        : !available
          ? 'Recording unavailable'
          : `${isPlayingCurrentSession ? 'Pause' : 'Play'} ${label}`
      button.setAttribute('aria-label', button.title)
      if (cueStatus) button.dataset.cueStatus = cueStatus
      else delete button.dataset.cueStatus
      button.classList.toggle('is-active', isPlayingCurrentSession)
      button.classList.toggle('is-missing-audio', authoringAvailable)
      button.classList.toggle('is-cue-incomplete', cueIsIncomplete)
    }
  }

  function syncAliyahNavigationToolbar(
    current: ReaderProgressAnchor | null
  ) {
    const playback = readerPlaybackGlobal?.snapshot()
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
    const authoringEnabled = cueAuthoringGlobal?.isActive() ?? false
    const cueStatus =
      current?.run && current.aliyahIndex && recording
        ? getResolvedAliyahCueStatus(
            current.run.id,
            current.aliyahIndex,
            recording.id
          )
        : null

    const isTableOfContentsVisible =
      readerRouteGlobal?.snapshot().pickerOpen ?? false
    const available = Boolean(
      current?.run &&
        current.aliyahIndex &&
        (recording || fallbackRecording) &&
        !isTableOfContentsVisible
    )
    const authoringAvailable = Boolean(
      current?.run &&
        current.aliyahIndex &&
        !recording &&
        authoringEnabled &&
        !isTableOfContentsVisible
    )
    const isCurrentSession = isCurrentPlaybackTarget({
      recording,
      runId: current?.run?.id,
      aliyahIndex: current?.aliyahIndex,
    })
    const isPlayingCurrentSession = Boolean(
      isCurrentSession && playback?.playing
    )
    const preferredMobileRun = getPreferredMobileAliyahRun(current?.run ?? null)
    const preferredMobileItems = preferredMobileRun
      ? getAliyahNavigationEntriesForRun(preferredMobileRun)
      : []
    const mobilePlaybackSession = playback?.session
    const mobilePlaybackMatchesRun = Boolean(
      preferredMobileRun &&
        mobilePlaybackSession?.runId === preferredMobileRun.id
    )
    const mobilePlaybackPlaying = Boolean(
      mobilePlaybackMatchesRun && isPlaybackActive()
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
    const mobileTarget =
      mobileRunId && mobileAliyahIndex
        ? { runId: mobileRunId, aliyahIndex: mobileAliyahIndex }
        : null
    const mobileAudioAvailable = Boolean(
      mobileTarget &&
        (getAliyahNavigationRecording(mobileTarget, {
          includePreviousOverlap: true,
        }) ||
          cueAuthoringGlobal?.isActive())
    )

    aliyahNavigationGlobal?.syncToolbar({
      current: {
        labelVisible: Boolean(current && !isTableOfContentsVisible),
        label: current?.label ?? '—',
        target:
          current?.run && current.aliyahIndex
            ? {
                runId: current.run.id,
                aliyahIndex: current.aliyahIndex,
              }
            : null,
        audioAvailable: available,
        authoringAvailable,
        authoringEnabled,
        cueStatus,
        playing: isPlayingCurrentSession,
      },
      compact: {
        visible: Boolean(
          preferredMobileRun &&
            mobileAliyahIndex &&
            !isTableOfContentsVisible
        ),
        target: mobileTarget,
        label: mobileAliyahIndex
          ? formatAliyahLabel(mobileAliyahIndex)
          : '—',
        playbackState: getMobileAliyahCapsuleState({
          loaded: mobilePlaybackLoaded,
          playing: mobilePlaybackLoaded && mobilePlaybackPlaying,
        }),
        audioAvailable: mobileAudioAvailable,
      },
    })
  }

  async function collectAliyahTokenKeysFromDisplay({
    runId,
    aliyahIndex,
  }: {
    runId: string
    aliyahIndex: PlaybackAliyahIndex
  }) {
    const displaySession = getReaderDisplaySession()
    const activeDisplay = displaySession.capture()
    if (!activeDisplay) return []
    const run =
      activeDisplay.viewModel.relevantRuns.find(
        (candidate) => candidate.id === runId
      ) ??
      createCalendarGenerator().parseId(runId)
    const aliyah = findAliyahInRun(run, aliyahIndex)
    if (!run || !aliyah) return []

    const resolver = await activeDisplay.viewModel.resolver
    if (!activeDisplay.isCurrent()) return []
    const startLocation = resolver.physicalLocationFromRef(aliyah.start)
    const endLocation = resolver.physicalLocationFromRef(aliyah.end)
    const virtualizationPause = displaySession.pauseEviction()
    try {
      // The verse containing the ending reference may continue on the next page.
      for (
        let pageNumber = startLocation.pageNumber;
        pageNumber <= endLocation.pageNumber + 1;
        pageNumber++
      ) {
        await activeDisplay.ensurePageMounted(pageNumber)
        if (!activeDisplay.isCurrent()) return []
      }
    } finally {
      virtualizationPause.release()
    }

    const startLine = displaySession.getRenderedLineForLocation(
      startLocation,
      activeDisplay
    )
    const endLine = displaySession.getRenderedLineForLocation(
      endLocation,
      activeDisplay
    )
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
    return activeDisplay.isCurrent() ? [...tokenKeys] : []
  }

  async function loadAliyahForAudioAuthoring(
    { runId, aliyahIndex }: AliyahNavigationTarget,
    actionToken: number
  ) {
    const readerPlayback = readerPlaybackGlobal
    if (!readerPlayback) return
    selectAliyah({ runId, index: aliyahIndex })
    const session = await readerPlayback.loadRecording(
      { runId, aliyahIndex },
      { mode: 'authoring' }
    )
    if (!playbackAction.isCurrent(actionToken)) return
    if (!session) {
      console.error(
        `Could not prepare ${runId}:${aliyahIndex} for audio authoring`
      )
      return
    }
    syncReaderPlaybackChrome()
  }

  async function startPlaybackForButton(button: HTMLButtonElement) {
    const readerPlayback = readerPlaybackGlobal
    if (!readerPlayback) return
    const state = getSessionButtonState(button)
    if (!state) return
    const actionToken = playbackAction.start()
    if (cueAuthoringGlobal?.isActive() && !state.recording) {
      await loadAliyahForAudioAuthoring(
        { runId: state.run.id, aliyahIndex: state.aliyahIndex },
        actionToken
      )
      return
    }
    if (!state.available) return
    selectAliyah({ runId: state.run.id, index: state.aliyahIndex })

    if (readerPlayback.isTargetActive({
      recordingId: state.recording?.id ?? null,
      runId: state.run.id,
      aliyahIndex: state.aliyahIndex,
    })) {
      const resumePlayback = readerPlayback.snapshot().paused
      const playback = readerPlayback.toggle(() => startPlaybackForButton(button))

      if (resumePlayback) {
        await readerPlayback.restoreActiveHighlight({ scroll: true })
      }
      await playback
      return
    }

    const availability = readerPlayback.lookupRecording(
      state.run,
      state.aliyahIndex
    )
    authorizePlaybackForUserGesture(
      availability.recording,
      availability.overlapRecording,
      state.recording
    )

    const session = await readerPlayback.loadRecording({
      runId: state.run.id,
      aliyahIndex: state.aliyahIndex,
    })
    if (!session) return
    if (!playbackAction.isCurrent(actionToken)) return

    await readerPlayback.play(() => startPlaybackForButton(button))
  }

  async function startPlaybackForToolbarCurrentAliyah(
    { runId, aliyahIndex }: AliyahNavigationTarget
  ) {
    const readerPlayback = readerPlaybackGlobal
    if (!readerPlayback) return
    const actionToken = playbackAction.start()
    const activeDisplay = readerDisplaySessionGlobal?.capture()
    const run =
      activeDisplay?.viewModel.relevantRuns.find(
        (candidate) => candidate.id === runId
      ) ??
      createCalendarGenerator().parseId(runId)
    if (!run) return

    const availability = readerPlayback.lookupRecording(
      run,
      aliyahIndex
    )
    const authoringTarget = Boolean(
      cueAuthoringGlobal?.isActive() && !availability.recording
    )
    if (!authoringTarget && !availability.available) return

    if (readerPlayback.isTargetActive({
      recordingId: availability.recording?.id ?? null,
      runId,
      aliyahIndex,
    })) {
      selectAliyah({ runId, index: aliyahIndex })
      await readerPlayback.toggle(() =>
        startPlaybackForToolbarCurrentAliyah({ runId, aliyahIndex })
      )
      return
    }

    const retry = () =>
      startPlaybackForToolbarCurrentAliyah({ runId, aliyahIndex })
    if (!authoringTarget) {
      authorizePlaybackForUserGesture(
        availability.recording,
        availability.overlapRecording
      )
    }

    const target = await getReaderDisplaySession().ensureAliyahDomTargetRendered(
      runId,
      aliyahIndex
    )
    if (!playbackAction.isCurrent(actionToken)) return
    const marker = target?.marker ?? target?.element
    if (!marker) return

    if (authoringTarget) {
      await loadAliyahForAudioAuthoring(
        { runId, aliyahIndex },
        actionToken
      )
      return
    }
    selectAliyah({ runId, index: aliyahIndex })

    const session = await readerPlayback.loadRecording({
      runId,
      aliyahIndex,
    })
    if (!session) return
    if (!playbackAction.isCurrent(actionToken)) return

    await readerPlayback.play(retry)
  }

  function presentReaderPosition(
    range: ViewportRange | null =
      readerDisplaySessionGlobal?.viewportRange() ?? null
  ) {
    const book = getBook()
    const progressSnapshot = getReaderDisplaySession().progressSnapshot()
    const anchors = progressSnapshot.anchors
    const viewportCenter = anchors.length
      ? getReaderFocalPointScrollTop(book)
      : 0
    const crossedAliyahStart =
      readerUrlScrollPending && anchors.length
        ? getCrossedAliyahStartAnchor(
            anchors,
            readerUrlPreviousFocalPosition,
            viewportCenter
          )
        : null
    if (readerUrlSyncArmed) {
      readerUrlPreviousFocalPosition = viewportCenter
      readerUrlScrollPending = false
    }
    const presentation = resolveReaderProgressPresentation<ReaderProgressAnchor>({
      source: progressSnapshot,
      viewportPosition: viewportCenter,
      getScrollHeight: () => book.scrollHeight,
      rangeCurrent: anchors.length
        ? getCurrentAliyahFromViewportRange(range, anchors)
        : null,
      isLastAnchor: isLastAliyahProgressAnchor,
    })

    if (readerUrlSyncArmed && !recordingMode.enabled) {
      const hash = readerHashFromAnchor(crossedAliyahStart)
      if (hash) readerRouteGlobal?.syncScrolledReading(hash)
    }

    if (presentation.kind === 'empty') {
      getReaderShell().setProgress({
        label: presentation.label,
        percent: presentation.percent,
      })
      syncAliyahNavigationToolbar(null)
      readerControlsGlobal?.sync()
      syncAliyahNavigationContent(range, progressSnapshot)
      return
    }

    getReaderShell().setProgress({ label: presentation.label })
    syncAliyahNavigationToolbar(presentation.current)
    readerControlsGlobal?.sync()
    syncAliyahNavigationContent(range, progressSnapshot)

    if (presentation.kind === 'request-next-anchor') {
      void getReaderDisplaySession()
        .ensureNextProgressAnchorLoaded(presentation.requestNextAnchor.afterIndex)
        .then(() => invalidateReaderPositionAfterLayout())
        .catch((error) => {
          console.error('Failed to load the next reader progress anchor', error)
        })
      return
    }

    getReaderShell().setProgress({ percent: presentation.percent })
  }

  function invalidateReaderPositionAfterLayout() {
    if (readerDisplaySessionGlobal) {
      readerDisplaySessionGlobal.invalidatePresentationAfterLayout(
        'reader-position'
      )
      return
    }
    presentReaderPosition()
  }

  function invalidateReaderPosition() {
    if (readerDisplaySessionGlobal) {
      readerDisplaySessionGlobal.invalidatePresentation('reader-position')
      return
    }
    presentReaderPosition()
  }

  function presentReaderPlaybackState(readerPositionPresented = false) {
    if (!readerPositionPresented) {
      const progressSnapshot = getReaderDisplaySession().progressSnapshot()
      const viewportCenter = getReaderFocalPointScrollTop(getBook())
      syncAliyahNavigationToolbar(progressSnapshot.at(viewportCenter).current)
    }
    aliyahNavigationGlobal?.syncPlayback(
      getAliyahNavigationPlayback()
    )
  }

  function syncReaderPlaybackChrome() {
    if (readerDisplaySessionGlobal) {
      readerDisplaySessionGlobal.invalidatePresentation(
        'inline-audio',
        'playback-state'
      )
      return
    }
    refreshInlineAudioButtons()
    presentReaderPlaybackState()
  }

  function refreshReaderChrome() {
    if (readerDisplaySessionGlobal) {
      readerDisplaySessionGlobal.invalidatePresentation(
        'inline-audio',
        'reader-position'
      )
      return
    }
    refreshInlineAudioButtons()
    presentReaderPosition()
  }

  function updateReaderPreferencesFromSettings(
    updates: Partial<ReaderPreferences>
  ) {
    const shouldSmoothRecenter =
      updates.focalPointMode !== undefined &&
      updates.focalPointMode !== readerPreferences.focalPointMode
    const scrollTarget = shouldSmoothRecenter
      ? getReaderFocalPointScrollTarget(getBook())
      : null
    const shouldUpdatePagePresentation =
      (updates.readerTextLayout !== undefined &&
        updates.readerTextLayout !== readerPreferences.readerTextLayout) ||
      (updates.readerSideMode !== undefined &&
        updates.readerSideMode !== readerPreferences.readerSideMode)

    let nextPreferences = mergeReaderPreferences(readerPreferences, updates)
    try {
      readerPreferencesRevision = saveReaderPreferences(
        nextPreferences,
        readerPreferencesRevision
      )
    } catch (error) {
      console.error('Failed to save reader preferences', error)
      if (
        error instanceof ReaderPreferencesStorageError &&
        error.cause instanceof PersistedStateConflictError &&
        error.cause.reason === 'conflict'
      ) {
        const latest = loadReaderPreferencesState()
        const rebasedPreferences = mergeReaderPreferences(
          latest.preferences,
          updates
        )
        try {
          readerPreferencesRevision = saveReaderPreferences(
            rebasedPreferences,
            latest.revision
          )
          nextPreferences = rebasedPreferences
        } catch (retryError) {
          console.error(
            'Failed to save reader preferences after refreshing browser state',
            retryError
          )
          showPersistenceNotice(
            'Reader settings changed in another tab. This change applies now but could not be saved.'
          )
        }
      } else {
        showPersistenceNotice('Reader settings will apply now but could not be saved.')
      }
    }
    readerPreferences = nextPreferences
    if (shouldUpdatePagePresentation) {
      syncEffectiveReaderPagePresentation({
        beforeLayout: () => applyReaderPreferences(readerPreferences),
      })
    } else {
      applyReaderPreferences(readerPreferences)
    }
    recenterReaderFocalPoint(scrollTarget, { behavior: 'smooth' })
    refreshReaderChrome()
  }

  function setupReaderViewportResize(scope: MountScope, book: HTMLElement) {
    let pendingScrollTarget: HTMLElement | null = null
    let recenterFrame = 0

    const handleResize = () => {
      readerDisplaySessionGlobal?.invalidateProgressAnchors('viewport-resized')
      pendingScrollTarget ??= getReaderFocalPointScrollTarget(book)
      setAppHeight()
      if (recenterFrame) return

      recenterFrame = requestAnimationFrame(() => {
        recenterFrame = 0
        const scrollTarget = pendingScrollTarget
        pendingScrollTarget = null
        scheduleSpecialLetterAlignment(book, scope.signal)
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


  const openedHashless = !location.hash
  const audioElement = document.querySelector<HTMLAudioElement>(
    '[data-target-id="reader-audio"]'
  )!

  if (recordingMode.enabled) {
    document.documentElement.dataset.recordingMode = 'true'
  }

  const loadedReaderPreferences = loadReaderPreferencesState()
  readerPreferencesRevision = loadedReaderPreferences.revision
  readerPreferences = recordingMode.enabled
    ? applyRecordingModePreferences(loadedReaderPreferences.preferences)
    : loadedReaderPreferences.preferences
  applyReaderPreferences(readerPreferences)
  const loadedBookmarks = loadBookmarksState(
    browserLocalStorage,
    isSemanticallyRoutableReaderHash
  )
  bookmarks = loadedBookmarks.bookmarks
  bookmarkRevision = loadedBookmarks.revision

  let ready!: Promise<void>
  const destroy = mountReaderRuntime((scope) => {
  const readerShell = createReaderShell(scope, {
    document,
    initialTitle: INITIAL_READER_TITLE,
    initialAnnotationsEnabled: annotationsEnabled,
    onTitleClick: () => {
      commandPaletteGlobal?.close()
      readerRouteGlobal?.togglePicker({ animate: true })
    },
    onAboutClick: () => {
      aliyahNavigationGlobal?.closeCompact()
      readerRouteGlobal?.toggleAbout()
    },
    onAnnotationsChange: setAnnotationsEnabled,
    onSwapSides: () => {
      updateReaderPreferencesFromSettings({
        readerSideOrder:
          readerPreferences.readerSideOrder === 'tikkun-right'
            ? 'torah-right'
            : 'tikkun-right',
      })
    },
  })
  readerShellGlobal = readerShell
  scope.own(() => {
    if (readerShellGlobal === readerShell) readerShellGlobal = null
  })
  const book = getBook()
  const readerViewport = createReaderViewport(scope, window)
  readerViewportGlobal = readerViewport
  syncEffectiveReaderPagePresentation({ rerender: false })
  readerViewport.onChange(() => {
    syncEffectiveReaderPagePresentation()
    readerSettingsGlobal?.sync()
  })
  scope.own(() => {
    if (readerViewportGlobal === readerViewport) {
      readerViewportGlobal = null
    }
  })

  const topBarModel = new TopBarTracker()
  const readerDisplaySession = createReaderDisplaySession({
    document,
    view: window,
    root: book,
    search: location.search,
    frame: {
      request: requestAnimationFrame,
      cancel: cancelAnimationFrame,
    },
    timer: {
      set: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clear: (handle) => window.clearTimeout(handle),
    },
    background: {
      request: scheduleIdleTask,
      delay: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: cancelIdleTask,
    },
    effects: {
      beforeDisplayReplacement() {
        resolvedAliyahCueStatuses.clear()
      },
      resetDisplayResources,
      afterDisplayReplacementReset: syncAliyahNavigationContent,
      displayCreated(display) {
        readerPlaybackGlobal?.setDisplay(display)
      },
      displayDeactivating() {
        offlineRecordingPromptGlobal?.clearPlaybackFailure()
      },
      resolveRun: (runId) => createCalendarGenerator().parseId(runId),
      getPlaybackProtectedPageNumbers: (forwardPageCount) =>
        readerPlaybackGlobal?.protectedCuePageNumbers(forwardPageCount) ?? [],
      isPlaybackActive,
      async prewarmCueData({ run, aliyahIndex }) {
        const recording = findRecordingForRun({
          narratorId: readerPreferences.narratorId,
          run,
          aliyahIndex,
        })
        if (recording) await getCuesForRecording(recording)
      },
      present(invalidations) {
        const viewportTitleInvalidated = invalidations.includes('viewport-title')
        const readerPositionInvalidated = invalidations.includes('reader-position')
        const playbackStateInvalidated = invalidations.includes('playback-state')
        const activeDisplay = readerDisplaySessionGlobal?.capture()
        const viewportRange = readerDisplaySessionGlobal?.viewportRange() ?? null
        if (
          viewportTitleInvalidated &&
          activeDisplay &&
          viewportRange
        ) {
          topBarModel.setLine(activeDisplay.viewModel, viewportRange)
          const run = topBarModel.info.currentRun
          readerRouteGlobal?.setTitle(
            formatTopBarTitle(
              run
                ? activeDisplay.viewModel.displayTitleForRun(run)
                : undefined
            )
          )
        }
        if (invalidations.includes('inline-audio')) refreshInlineAudioButtons()
        if (readerPositionInvalidated) {
          presentReaderPosition()
        }
        if (playbackStateInvalidated) {
          presentReaderPlaybackState(readerPositionInvalidated)
        }
      },
      reportError(message, error) {
        if (message) console.error(message, error)
        else console.error(error)
      },
    },
  })
  readerDisplaySessionGlobal = readerDisplaySession
  scope.own(() => {
    readerDisplaySession.destroy()
    if (readerDisplaySessionGlobal === readerDisplaySession) {
      readerDisplaySessionGlobal = null
    }
  })
  const readerPlayback = createReaderPlayback(scope, {
    document,
    view: window,
    audioElement,
    book,
    viewport: readerViewport,
    initialPlaybackRate: readerPreferences.playbackRate,
    timeline: {
      getAutoScroll: () => readerPreferences.autoScrollWithPlayback,
      getPlaybackRate: () => readerPreferences.playbackRate,
      onPlaybackRateChange: (playbackRate) => {
        readerPreferences = mergeReaderPreferences(readerPreferences, {
          playbackRate,
        })
        applyReaderPreferences(readerPreferences)
        readerSettingsGlobal?.sync()
      },
      isCueAuthoringRecording: () =>
        cueAuthoringGlobal?.isRecording() ?? false,
      saveReadingPosition: saveCurrentLastReading,
      focusReader: focusReaderSurface,
      restoreFocus: focusOverlayReturnTarget,
    },
    recording: {
      library: {
        findRecording: findRecordingForRun,
        findAuthoringRecording: findAuthoringRecordingForRun,
        listRecordings,
        loadCues: getCuesForRecording,
      },
      display: {
        resolveRun: (runId) =>
          readerDisplaySession.capture()?.viewModel.relevantRuns.find(
            (candidate) => candidate.id === runId
          ) ??
          createCalendarGenerator().parseId(runId),
        collectTokenKeys: collectAliyahTokenKeysFromDisplay,
        waitUntilReady: () => readerDisplaySession.waitUntilReaderReady(),
        resolveRunForRecording: (recording) =>
          isParshaAudioRecording(recording)
            ? readerDisplaySession.capture()?.viewModel.relevantRuns.find(
                (candidate) =>
                  parshaSlugForRun(candidate) === recording.parshaSlug
              ) ?? null
            : null,
      },
      authoring: {
        isActive: () => cueAuthoringGlobal?.isActive() ?? false,
        isVisible: () => cueAuthoringGlobal?.isVisible() ?? false,
        hasSession: () => Boolean(cueAuthoringGlobal?.getSession()),
        bindSession: async () => {
          await cueAuthoringGlobal?.bindSession()
        },
        clearSession: () => cueAuthoringGlobal?.clearSession(),
      },
      getNarratorId: () => readerPreferences.narratorId,
      recordingMode: recordingMode.enabled,
    },
  })
  readerPlaybackGlobal = readerPlayback
  scope.own(
    readerPlayback.subscribe((change, snapshot) => {
      if (change.type === 'reader-chrome') {
        if (snapshot.playing) {
          offlineRecordingPromptGlobal?.clearPlaybackFailure()
        }
        syncReaderPlaybackChrome()
      } else if (change.type === 'aliyah-playback') {
        aliyahNavigationGlobal?.syncPlayback(
          getAliyahNavigationPlayback()
        )
      } else if (change.type === 'session-loaded') {
        offlineRecordingPromptGlobal?.clearPlaybackFailure()
        refreshInlineAudioButtons()
        void loadIssuesForActiveSession()
        invalidateAliyahCueStatuses()
        syncAliyahNavigationContent()
        readerSettingsGlobal?.sync()
      } else if (change.type === 'segment-updated') {
        void loadIssuesForActiveSession()
        readerSettingsGlobal?.sync()
      } else if (change.type === 'active-token-changed') {
        syncActiveReaderIssueNotice()
      } else if (change.type === 'playback-error') {
        if (navigator.onLine) {
          console.error(
            `Audio playback failed for ${change.recording.id}`,
            change.error
          )
          showReaderNotice(
            'This recording could not play. Check your connection and try again.',
            { assertive: true }
          )
        }
      } else if (change.type === 'offline-media-error') {
        recordOfflinePlaybackFailure(change.retry)
      }
    })
  )
  scope.own(() => {
    deactivateReaderRuntime()
    if (readerPlaybackGlobal === readerPlayback) {
      readerPlaybackGlobal = null
    }
  })
  const cuePlayback = readerPlayback.cueAuthoringAdapter()
  const cueAuthoringLoader = createCueAuthoringLoader(scope, {
    sessionStorage: browserSessionStorage,
    mount: (cueScope, module) =>
      module.createCueAuthoring(cueScope, {
        document,
        view: window,
        playback: cuePlayback,
        localStorage: browserLocalStorage,
        sessionStorage: browserSessionStorage,
        getAutoScroll: () => readerPreferences.autoScrollWithPlayback,
        getActiveTokenKey,
        getMergedRecordingIssues: () => mergedRecordingIssues,
        getLocalRecordingIssues: () => localRecordingIssues,
        getLocalRecordingIssueRevision: () => localRecordingIssueRevision,
        focusReader: focusReaderSurface,
        formatDuration,
        onChange: (change: CueAuthoringChange) => {
          if (change === 'access') refreshReaderSearch()
          else if (change === 'cue-data') {
            invalidateAliyahCueStatuses()
            refreshInlineAudioButtons()
            void loadIssuesForActiveSession()
          } else if (change === 'draft') {
            invalidateAliyahCueStatuses()
            refreshInlineAudioButtons()
          } else if (change === 'mode') syncReaderMode()
          else if (change === 'playback') cuePlayback.refresh()
          else if (change === 'playback-progress') {
            cuePlayback.refresh('progress')
          }
        },
        onCueNavigationChange: (index) => {
          void cuePlayback.setCueIndex(index)
        },
        onLocalRecordingIssuesChanged: (issues, revision) => {
          localRecordingIssues = issues
          localRecordingIssueRevision = revision
          mergedRecordingIssues = mergePublishedAndLocalRecordingIssues(
            publishedRecordingIssues,
            localRecordingIssues
          )
          applyReaderVisibleIssueMarkers()
          syncActiveReaderIssueNotice()
          refreshReaderSearch()
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
      readerRouteGlobal?.navigate(target.hash, {
        saveReadingAfterRender: true,
      })
    },
  })
  lastReadingPromptGlobal = lastReadingPrompt
  scope.own(() => {
    if (lastReadingPromptGlobal === lastReadingPrompt) {
      lastReadingPromptGlobal = null
    }
  })
  const commandPalette = createLazyCommandPalette(scope, {
    document,
    getActions: createReaderSearchActions,
    createGenerator: createCalendarGenerator,
    restoreFocus: focusReaderSurface,
    isBookmarkAction,
    formatBadge: titleCaseBookmarkBadge,
    onLoadError: (error) => {
      console.error('Failed to load the search overlay', error)
      showPersistenceNotice(
        'Search could not be opened. Reload this page to try again.'
      )
    },
  })
  commandPaletteGlobal = commandPalette
  scope.own(() => {
    if (commandPaletteGlobal === commandPalette) commandPaletteGlobal = null
  })
  const offlineRecordingPrompt = createOfflineRecordingPrompt(scope, {
    document,
    view: window,
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
  mountAliyahNavigation(scope)
  const readerControls = createReaderControls(scope, {
    document,
    getState: getReaderControlsState,
    toggleBookmark: () => {
      bookmarkCurrentToken()
      focusReaderSurface()
    },
    openAliyahNavigation: (returnFocus) => {
      if (isCompactReaderViewport()) {
        aliyahNavigationGlobal?.openCompact(returnFocus)
        return
      }
      aliyahNavigationGlobal?.revealWide('expanded')
      aliyahNavigationGlobal?.scheduleWideHide()
      focusReaderSurface()
    },
    showAliyahStarts: () => {
      aliyahNavigationGlobal?.revealWide('peek')
      focusReaderSurface()
    },
    toggleAnnotations: () => {
      setAnnotationsEnabled(!annotationsEnabled)
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
      ? loadEligibleLastReading(
          browserLocalStorage,
          Date.now(),
          isSemanticallyRoutableReaderHash
        )
      : null

    setupAliyahStartPopup(scope)
    listenForRevealGesture(scope, book)
    setupReaderViewportResize(scope, book)

    const readerSettings = createLazyReaderSettings(scope, {
      document,
      view: window,
      narrators: listNarrators(),
      getPreferences: () => readerPreferences,
      updatePreferences: (updates) =>
        updateReaderPreferencesFromSettings(updates),
      setPlaybackRate: (playbackRate) => {
        void readerPlayback.setPlaybackRate(playbackRate)
        refreshReaderChrome()
      },
      restoreFocus: focusOverlayReturnTarget,
      animateThemeChanges: !recordingMode.enabled,
      serviceWorker:
        'serviceWorker' in window.navigator
          ? window.navigator.serviceWorker
          : null,
      getCurrentRecording: () =>
        readerPlayback.snapshot().session?.activeRecording ?? null,
      onLoadError: (error) => {
        console.error('Failed to load Reader Settings', error)
        showPersistenceNotice(
          'Reader Settings could not be opened. Reload this page to try again.'
        )
      },
    })
    readerSettingsGlobal = readerSettings
    scope.own(() => {
      if (readerSettingsGlobal === readerSettings) {
        readerSettingsGlobal = null
      }
    })
    setupDebugControls(scope)
  const saveLastReadingDebounced = debounce(() => saveCurrentLastReading(), 1000)
  scope.own(saveLastReadingDebounced.cancel)

  const armReaderUrlSync = () => {
    if (!readerUrlSyncArmed || readerUrlPreviousFocalPosition === null) {
      readerUrlPreviousFocalPosition = getReaderFocalPointScrollTop(book)
    }
    readerUrlSyncArmed = true
  }

  const markUserScrolledReaderForLastReading: (_event?: Event) => void = () => {
    hasUserScrolledReaderForLastReading = true
    armReaderUrlSync()
    lastReadingPromptGlobal?.dismiss()
  }

  book.addEventListener('pointerdown', armReaderUrlSync, {
    passive: true,
    signal: scope.signal,
  })
  book.addEventListener('keydown', armReaderUrlSync, {
    signal: scope.signal,
  })
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
      aliyahNavigationGlobal?.revealWideForMovement()
    }),
    { signal: scope.signal }
  )
  book.addEventListener(
    'keydown',
    whenKey('PageUp', (event) => {
      markUserScrolledReaderForLastReading(event)
      aliyahNavigationGlobal?.revealWideForMovement()
    }),
    { signal: scope.signal }
  )

  book.addEventListener(
    'scroll',
    () => {
      if (readerUrlSyncArmed) readerUrlScrollPending = true
      readerDisplaySession.onReaderScroll(() => {
        const scrollTop = book.scrollTop
        const previousScrollTop = lastAliyahRailScrollTop
        lastAliyahRailScrollTop = scrollTop
        extendPendingAliyahRailSelectionForScroll()
        if (
          previousScrollTop !== null &&
          Math.abs(scrollTop - previousScrollTop) >= 28 &&
          !readerPlayback.snapshot().playing
        ) {
          aliyahNavigationGlobal?.revealWideForMovement()
        }
      })
      if (hasUserScrolledReaderForLastReading) saveLastReadingDebounced()
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'page-rendered',
    (event) => {
      const renderedPage = event instanceof CustomEvent ? event.detail?.node : null
      const pageRoot = renderedPage instanceof Element ? renderedPage : book
      applyAnnotationMode(pageRoot, annotationsEnabled)
      scheduleSpecialLetterAlignment(pageRoot, scope.signal)
      readerDisplaySession.pageRendered(pageRoot, () => {
        applyAliyahStartWordMarkers(book, pageRoot)
        applyRecordingModePageLabels(pageRoot)
        applyReaderVisibleIssueMarkers(pageRoot)
      })
      if (isPlaybackActive()) return
      refreshReaderChrome()
      void readerPlayback.syncHighlight({ scroll: false })
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'page-evicted',
    (event) => {
      const pageNumber =
        event instanceof CustomEvent ? event.detail?.pageNumber : null
      readerDisplaySession.pageEvicted(
        Number.isInteger(pageNumber) ? pageNumber : null
      )
    },
    { signal: scope.signal }
  )

  let readerFormTap:
    | {
        pointerId: number
        startX: number
        startY: number
        startedAt: number
        canceled: boolean
        readyAt: number | null
      }
    | null = null
  const readerFormTapBlockedSelector = [
    'button',
    'a',
    'input',
    'select',
    'textarea',
    '[contenteditable="true"]',
    '[data-reader-no-form-toggle="true"]',
  ].join(',')

  book.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target
      if (
        !isCompactReaderViewport() ||
        !(target instanceof Element) ||
        !target.closest('.reader-text-side') ||
        target.closest(readerFormTapBlockedSelector)
      ) {
        readerFormTap = null
        return
      }
      readerFormTap = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: performance.now(),
        canceled: false,
        readyAt: null,
      }
    },
    { passive: true, signal: scope.signal }
  )
  book.addEventListener(
    'pointermove',
    (event) => {
      if (!readerFormTap || readerFormTap.pointerId !== event.pointerId) return
      if (
        Math.hypot(
          event.clientX - readerFormTap.startX,
          event.clientY - readerFormTap.startY
        ) > 8
      ) {
        readerFormTap.canceled = true
      }
    },
    { passive: true, signal: scope.signal }
  )
  book.addEventListener(
    'pointerup',
    (event) => {
      if (!readerFormTap || readerFormTap.pointerId !== event.pointerId) return
      const heldFor = performance.now() - readerFormTap.startedAt
      readerFormTap.readyAt =
        !readerFormTap.canceled && heldFor < 450 ? performance.now() : null
    },
    { passive: true, signal: scope.signal }
  )
  book.addEventListener(
    'pointercancel',
    () => {
      readerFormTap = null
    },
    { passive: true, signal: scope.signal }
  )

  function consumeReaderFormTap(event: MouseEvent) {
    const tap = readerFormTap
    readerFormTap = null
    if (
      !tap?.readyAt ||
      performance.now() - tap.readyAt > 500 ||
      getEffectiveReaderPagePresentation().sides !== 'one'
    ) {
      return false
    }
    const target = event.target
    if (
      !(target instanceof Element) ||
      !target.closest('.reader-text-side') ||
      target.closest(readerFormTapBlockedSelector)
    ) {
      return false
    }
    const selection = window.getSelection()
    return !selection || selection.isCollapsed
  }

  book.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement
    const playButton = target.closest<HTMLButtonElement>('[data-audio-button="true"]')
    if (playButton) {
      event.preventDefault()
      await startPlaybackForButton(playButton)
      saveLastReadingFromAnchor(
        readerDisplaySession.progressAnchorForElement(playButton)
      )
      focusReaderSurface()
      return
    }

    if (await handleAliyahPermalinkClick(event)) return

    const word = target.closest<HTMLElement>('.word')
    const playback = readerPlayback.snapshot()
    if (
      consumeReaderFormTap(event) &&
      (!word || !playback.session)
    ) {
      event.preventDefault()
      setAnnotationsEnabled(!annotationsEnabled)
      focusReaderSurface()
      return
    }
    if (!word || !playback.session) return
    const tokenKey = word.dataset.tokenKey ?? null
    if (!tokenKey) return
    const tokenIndex = readerPlayback.tokenIndex(tokenKey)
    const cue = readerPlayback.cueForToken(tokenKey)
    const isPlaying = playback.playing
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
      syncAliyahNavigationToolbar(
        readerDisplaySession.progressAnchorForElement(word)
      )
      return
    }

    const retry = async () => {
      if (!document.body.contains(word)) return
      word.click()
    }
    const activeElement = await readerPlayback.activateSessionToken(tokenKey, {
      play: Boolean(cue),
      seekToCue: Boolean(cue),
      retry,
      scroll: readerPreferences.autoScrollWithPlayback,
    })
    const progressAnchor = readerDisplaySession.progressAnchorForElement(
      activeElement ?? word
    )
    syncAliyahNavigationToolbar(
      progressAnchor
    )
    saveLastReadingFromAnchor(progressAnchor)
  }, { signal: scope.signal })

  const temporaryShiftToggle = createTemporaryShiftToggle({
    getValue: () => annotationsEnabled,
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

  document.addEventListener(
    'keydown',
    whenKey('/', (event) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      commandPaletteGlobal?.close()
      readerRouteGlobal?.togglePicker()
    }),
    { signal: scope.signal }
  )

  document.addEventListener(
    'keydown',
    whenKey('Escape', (e) => {
      if (aliyahNavigationGlobal?.isCompactOpen()) {
        e.preventDefault()
        aliyahNavigationGlobal.closeCompact()
      }
      if (readerPlayback.closeOverlay()) {
        e.preventDefault()
        return
      }
      if (readerRouteGlobal?.snapshot().pickerOpen) {
        e.preventDefault()
        readerRouteGlobal.closePicker()
      }
      readerSettingsGlobal?.close()
      cueAuthoringGlobal?.closeOverlays()
      commandPaletteGlobal?.close()
      closeAliyahStartPopup()
    }),
    { signal: scope.signal }
  )

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      'a[href^="#/"]'
    )
    if (!link) return

    const href = link.getAttribute('href')
    if (!href || href === location.hash) {
      event.preventDefault()
      readerRouteGlobal?.navigate(href ?? location.hash)
    }
  }, { signal: scope.signal })


  document.addEventListener('keydown', (event) => {
    if (cueAuthoringLoader.handleShortcut(event)) return
    if (event.defaultPrevented) return
    if (isEditableTarget(event.target)) return

    if (
      readerRouteGlobal?.snapshot().view !== 'reader' ||
      !readerPlayback.snapshot().session
    ) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      void readerPlayback.toggle(async () => {
        await readerPlayback.play()
      })
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      void readerPlayback.step(1)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      void readerPlayback.step(-1)
    }
  }, { signal: scope.signal })

  if (recordingMode.enabled) {
    void import('../video/recording-harness.ts')
      .then(({ mountRecordingHarness }) => {
        if (scope.signal.aborted) return
        const harnessPlayback = readerPlayback.recordingHarnessAdapter()
        mountRecordingHarness(scope, {
          document,
          view: window,
          playback: harnessPlayback,
          isReaderReady: () => readerDisplaySession.isReaderReady(),
          waitUntilReaderReady: () =>
            readerDisplaySession.waitUntilReaderReady(),
          getBook,
        })
      })
      .catch((error: unknown) => {
        if (!scope.signal.aborted) {
          console.error('Failed to load the Recording Harness', error)
        }
      })
  }

  cueAuthoringLoader.restoreIfOpen()

  const readerRoute = createReaderRoute(scope, {
    document,
    view: window,
    shell: readerShell,
    createGenerator: createCalendarGenerator,
    getCalendarSettings: () => calendarSettings,
    updateCalendarSettings,
    getSearchActions: createReaderSearchActions,
    isBookmarkAction,
    formatSearchBadge: titleCaseBookmarkBadge,
    host: {
      renderReader: renderReaderModel,
      leaveReader: () => {
        readerPlayback.pause()
        deactivateReaderRuntime()
        closeCueAuthoring()
        lastReadingPromptGlobal?.hide()
      },
      openAbout: () => view.location.assign(aboutHref),
      readerRouteChanged: (nextReaderHash) => {
        readerUrlSyncArmed = false
        readerUrlPreviousFocalPosition = null
        readerUrlScrollPending = false
        if (explicitAliyahSelectionHash !== nextReaderHash) {
          clearExplicitAliyahSelection()
        }
        resetReaderSideNavigationState()
        readerDisplaySession.resetViewport()
        readerControlsGlobal?.close()
        closeAliyahStartPopup()
        aliyahNavigationGlobal?.revealWide('peek')
      },
      readerReady: () => {
        const lifetime = readerDisplaySession.capture()
        refreshReaderChrome()
        if (readerPlaybackGlobal === readerPlayback) {
          void readerPlayback
            .syncHighlight({ scroll: false })
            .catch((error) => {
              if (lifetime?.isCurrent()) {
                console.error('Failed to restore reader highlight', error)
              }
            })
        }
        const debugActiveToken = getDebugActiveTokenKey()
        if (debugActiveToken && readerPlaybackGlobal === readerPlayback) {
          void readerPlayback
            .activateToken(debugActiveToken, { scroll: false })
            .catch((error) => {
              if (lifetime?.isCurrent()) {
                console.error('Failed to activate debug token', error)
              }
            })
        }
      },
      preparePicker: () => {
        commandPaletteGlobal?.close()
        closeCueAuthoring()
      },
      pickerChanged: (open) => {
        syncAliyahNavigationContent()
        if (open) {
          syncAliyahNavigationToolbar(null)
        } else {
          refreshReaderChrome()
        }
      },
      pickerLoadFailed: (error) => {
        console.error('Failed to load the Reading Index', error)
        showPersistenceNotice(
          'The Reading Index could not be opened. Reload this page to try again.'
        )
      },
      captureReadingPosition: captureCurrentLastReading,
      showReturnToPreviousReading: (lastReading) => {
        lastReadingPromptGlobal?.show(lastReading, 'return')
      },
      dismissLastReadingPrompt: () => lastReadingPromptGlobal?.dismiss(),
      saveReadingPosition: saveCurrentLastReading,
    },
  })
  readerRouteGlobal = readerRoute
  scope.own(() => {
    if (readerRouteGlobal === readerRoute) readerRouteGlobal = null
  })
  ready = readerRoute.start()

  scope.own(() => {
    if (readerNoticeTimer !== null) {
      window.clearTimeout(readerNoticeTimer)
      readerNoticeTimer = null
    }
    const readerNotice = document.querySelector<HTMLElement>(
      '[data-target-id="persistence-toast"]'
    )
    if (readerNotice) {
      readerNotice.classList.add('u-hidden')
      readerNotice.textContent = ''
      readerNotice.setAttribute('role', 'status')
      readerNotice.setAttribute('aria-live', 'polite')
    }
    commandPaletteGlobal?.close()
    offlineRecordingPromptGlobal?.hide()
    lastReadingPromptGlobal?.hide()
  })

  if (launchLastReading) lastReadingPromptGlobal?.show(launchLastReading)
  })

  return { ready, destroy }
}
