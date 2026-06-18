import InfiniteScroller from './infinite-scroller.ts'
import ParshaPicker from './components/ParshaPicker.ts'
import type { CalendarSettings } from './components/ParshaPicker.ts'
import utils from './components/utils.ts'
import { ScrollViewModel } from './view-model/scroll-view-model.ts'
import { LeiningGenerator } from './calendar-model/generator.ts'
import type { UserSettings } from './calendar-model/user-settings.ts'
import { ScrollDisplay } from './components/ScrollDisplay.ts'
import { ViewportTracker, type ViewportRange } from './viewport-tracker.ts'
import { TopBarTracker } from './view-model/navigation/top-bar-model.ts'
import {
  AppRoute,
  generateAboutUrl,
  parseUrl,
} from './view-model/navigation/url-parser.ts'
import AboutPage from './components/AboutPage.ts'
import CueAnalyticsPage, { mountCueAnalyticsPage } from './components/CueAnalyticsPage.ts'
import { iconMarkup, type IconName } from './components/icons.ts'
import {
  applyReaderPreferences,
  getDefaultHighlightPreferences,
  getDefaultReaderPreferences,
  isReaderFocalPointMode,
  isThemeMode,
  loadReaderPreferences,
  mergeReaderPreferences,
  ReaderPreferences,
  saveReaderPreferences,
  TOKENIZATION_VERSION,
} from './reader-preferences.ts'
import {
  findRecordingForRun,
  getCuesForRecording,
  getCueSavedAtForRecording,
  listNarrators,
  listRecordings,
  parshaSlugForRun,
} from './audio/library.ts'
import { cueFileRelativePath, formatCueFileJson } from './audio/cue-file.ts'
import { normalizeFirstCueStart } from './audio/normalize-first-cue.ts'
import { AudioController, ActiveAudioSession } from './reading/audio-controller.ts'
import { HighlightController, cueKey } from './reading/highlight-controller.ts'
import { collectTokenKeysForAliyahRange } from './reading/aliyah-token-sequence.ts'
import {
  createLastReadingHash,
  LastReading,
  loadEligibleLastReading,
  saveLastReading,
} from './reading/last-reading.ts'
import type { AudioRecording, CueExportPayload, WordCue } from './audio/types.ts'
import { getWordProgress } from './audio/progress.ts'
import type { LeiningAliyah, LeiningRun } from './calendar-model/model-types.ts'
import { verifyAdminPassword } from './admin/access.ts'
import {
  getAdminDraftStorageKey,
  loadAdminDraft,
  type AdminDraftPayload,
} from './admin/draft-storage.ts'
import hebrewNumeral from './hebrew-numeral.ts'
import { findVideoForRecording } from './video/library.ts'
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

const { whenKey } = utils

const CALENDAR_SETTINGS_STORAGE_KEY = 'tikkun.calendar-settings.v1'
const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  israel: false,
}

function userSettingsFromCalendarSettings(
  settings: CalendarSettings
): UserSettings {
  return {
    ashkenazi: true,
    includeModernHolidays: false,
    israel: settings.israel,
  }
}

function loadCalendarSettings(): CalendarSettings {
  try {
    const raw = window.localStorage.getItem(CALENDAR_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_CALENDAR_SETTINGS

    const parsed = JSON.parse(raw) as Partial<CalendarSettings>
    return {
      israel: parsed.israel === true,
    }
  } catch {
    return DEFAULT_CALENDAR_SETTINGS
  }
}

function saveCalendarSettings(settings: CalendarSettings) {
  window.localStorage.setItem(
    CALENDAR_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings)
  )
}

let calendarSettings = loadCalendarSettings()
const createCalendarGenerator = () =>
  new LeiningGenerator(userSettingsFromCalendarSettings(calendarSettings))
const recordingMode = getRecordingModeConfig()
type PlaybackAliyahIndex = Exclude<LeiningAliyah['index'], undefined>

type AliyahProgressAnchor = {
  line: HTMLElement | null
  label: string
  run: LeiningRun | null
  aliyahIndex: PlaybackAliyahIndex | null
  position: number
}

let display: ScrollDisplay
let viewportTrackerGlobal: ViewportTracker | null = null
let latestViewportRange: ViewportRange | null = null
let readerPreferences: ReaderPreferences = getDefaultReaderPreferences()
let lastReaderHash = '#/next'
let currentReaderHash: string | null = null
let progressFrame = 0
let deferredProgressFrame = 0
let progressAnchorLoadPromise: Promise<void> | null = null
let cueNavigationIndex: number | null = null
let lastAdminRenderedCueCount = 0
let lastAdminFollowedCueIndex = -1
let exportDownloadUrl: string | null = null
let floatingPlayerExpanded = false
let hasDismissedOfflinePrompt = false
let pendingNetworkRecordingRetry: (() => Promise<void>) | null = null
let lastReadingPromptDismissed = false
let lastReadingPromptTarget: LastReading | null = null
let shouldSaveLastReadingAfterRouteRender = false
let hasUserScrolledReaderForLastReading = false
const floatingPlayerDesktopMediaQuery = window.matchMedia('(min-width: 716px)')
const PLAYBACK_RATE_MIN = 0.5
const PLAYBACK_RATE_MAX = 3
const PLAYBACK_RATE_MAGNET_THRESHOLD = 0.09
const PLAYBACK_RATE_MARKS = [0.5, 1, 1.5, 2, 3] as const
const ADMIN_SESSION_UNLOCKED_KEY = 'tikkun-admin-unlocked'
const ADMIN_SESSION_PANEL_OPEN_KEY = 'tikkun-admin-panel-open'
const adminDraftTimeFormat = Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

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

const adminState: {
  unlocked: boolean
  recording: boolean
  tokenPointer: number
  cues: WordCue[]
  sourceCues: WordCue[]
  draftOrigin: 'none' | 'published' | 'local'
  draftSavedAt: number | null
} = {
  unlocked: false,
  recording: false,
  tokenPointer: -1,
  cues: [],
  sourceCues: [],
  draftOrigin: 'none',
  draftSavedAt: null,
}

declare global {
  interface Window {
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

const cloneCue = (cue: WordCue): WordCue => ({ ...cue })
const cloneCues = (cues: WordCue[]) => cues.map(cloneCue)

const roundCueTime = (value: number) => Number(value.toFixed(3))

const formatCueTimestamp = (seconds: number) => {
  const milliseconds = Math.max(0, Math.round(seconds * 1000))
  const wholeSeconds = Math.floor(milliseconds / 1000)
  return `${formatDuration(wholeSeconds)}.${String(milliseconds % 1000).padStart(3, '0')}`
}

const cueFromTokenKey = (tokenKey: string, timeStart: number): WordCue => {
  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = tokenKey
    .split(':')
    .map(Number)

  return {
    timeStart: roundCueTime(timeStart),
    pageNumber,
    lineIndex,
    fragmentIndex,
    wordIndex,
  }
}

const assignAdminCues = (
  cues: WordCue[],
  audioController?: AudioController | null
) => {
  adminState.cues = cues
  const session = (audioController ?? audioControllerGlobal)?.session
  if (session) session.cues = cues
}

const getAdminSession = (audioController?: AudioController | null) =>
  (audioController ?? audioControllerGlobal)?.session ?? null

function resetExportDownloadLink() {
  if (exportDownloadUrl) {
    URL.revokeObjectURL(exportDownloadUrl)
    exportDownloadUrl = null
  }

  const downloadLink = document.querySelector<HTMLAnchorElement>(
    '[data-target-id="export-download"]'
  )
  if (!downloadLink) return
  downloadLink.removeAttribute('href')
  downloadLink.removeAttribute('download')
}

function hideExportModal() {
  document
    .querySelector<HTMLElement>('[data-target-id="export-modal"]')!
    .classList.add('u-hidden')
  resetExportDownloadLink()
}

function saveAdminDraft(audioController?: AudioController | null) {
  const session = getAdminSession(audioController)
  if (!session) return

  const storageKey = getAdminDraftStorageKey(session.recording.id)
  const updatedAt = Date.now()
  const payload: AdminDraftPayload = {
    audioId: session.recording.id,
    tokenCount: session.tokenKeys.length,
    tokenPointer: adminState.tokenPointer,
    tokenizationVersion: TOKENIZATION_VERSION,
    updatedAt,
    cues: cloneCues(adminState.cues),
  }

  window.localStorage.setItem(storageKey, JSON.stringify(payload))
  adminState.draftOrigin = 'local'
  adminState.draftSavedAt = updatedAt
}

const app = {
  jumpTo: (target: ScrollViewModel) => {
    display = new ScrollDisplay(
      target,
      document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
    )
    highlightControllerGlobal?.setDisplay(display)

    const rendered = display.rendered.then(() => {
      hideParshaPicker()
      refreshReaderChrome()
      if (audioControllerGlobal && highlightControllerGlobal)
        syncCurrentSessionHighlight(audioControllerGlobal, highlightControllerGlobal)
      const debugActiveToken = getDebugActiveTokenKey()
      if (debugActiveToken && highlightControllerGlobal) {
        void highlightControllerGlobal.activateTokenKey(debugActiveToken, {
          scroll: false,
        })
      }
    })
    display.scrolled.then(() => viewportTrackerGlobal?.refresh())
    return rendered
  },
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

const getAdminPanel = () =>
  document.querySelector<HTMLElement>('[data-target-id="admin-panel"]')

const isAdminPanelVisible = () => {
  const panel = getAdminPanel()
  return Boolean(panel && !panel.classList.contains('u-hidden'))
}

function persistAdminAccessState() {
  window.sessionStorage.setItem(
    ADMIN_SESSION_UNLOCKED_KEY,
    adminState.unlocked ? '1' : '0'
  )
  window.sessionStorage.setItem(
    ADMIN_SESSION_PANEL_OPEN_KEY,
    getAdminPanel()?.classList.contains('u-hidden') ? '0' : '1'
  )
}

function setAdminPanelVisible(
  visible: boolean,
  audioController?: AudioController | null
) {
  const panel = getAdminPanel()
  if (!panel) return
  panel.classList.toggle('u-hidden', !visible)
  persistAdminAccessState()
  syncAdminPanelState(audioController)
}

function closeAdminMode(audioController?: AudioController | null) {
  adminState.recording = false
  adminState.unlocked = false
  const controller = audioController ?? audioControllerGlobal
  controller?.pause()
  if (controller) updateFloatingPlayer(controller)
  setAdminPanelVisible(false, controller)
}

const syncReaderProgressVisibility = () => {
  const visible =
    parseCurrentRoute()?.view === 'reader' && !isShowingParshaPicker()

  ;[
    '[data-target-id="reader-progress"]',
    '[data-target-id="reader-progress-mobile"]',
    '.reader-corner-controls',
  ].forEach((selector) => setVisibility({ selector, visible }))
}

const syncReaderSideNavigationVisibility = () => {
  const visible =
    parseCurrentRoute()?.view === 'reader' && !isShowingParshaPicker()

  setVisibility({ selector: '.reader-side', visible })
}

function getLastReadingPrompt() {
  return document.querySelector<HTMLElement>(
    '[data-target-id="last-reading-prompt"]'
  )
}

function hideLastReadingPrompt() {
  getLastReadingPrompt()?.classList.add('u-hidden')
}

function dismissLastReadingPrompt() {
  lastReadingPromptDismissed = true
  hideLastReadingPrompt()
}

function showLastReadingPrompt(lastReading: LastReading) {
  if (lastReadingPromptDismissed || recordingMode.enabled) return
  const prompt = getLastReadingPrompt()
  const copy = document.querySelector<HTMLElement>(
    '[data-target-id="last-reading-copy"]'
  )
  if (!prompt || !copy) return

  const locationLabel = lastReading.aliyahLabel
    ? `${lastReading.parshaName}, ${lastReading.aliyahLabel}`
    : lastReading.parshaName
  copy.textContent = `Resume ${locationLabel}?`
  lastReadingPromptTarget = lastReading
  prompt.classList.remove('u-hidden')
}

function setupLastReadingPrompt() {
  document
    .querySelector<HTMLButtonElement>('[data-target-id="last-reading-dismiss"]')
    ?.addEventListener('click', dismissLastReadingPrompt)

  document
    .querySelector<HTMLButtonElement>('[data-target-id="last-reading-resume"]')
    ?.addEventListener('click', () => {
      const target = lastReadingPromptTarget
      if (!target) return
      dismissLastReadingPrompt()
      shouldSaveLastReadingAfterRouteRender = true
      if (location.hash === target.hash) {
        window.dispatchEvent(new Event('hashchange'))
        return
      }
      location.hash = target.hash
    })
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
  saveLastReading(localStorage, input)
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

function resetReaderSideNavigationState(audioController?: AudioController) {
  setFloatingPlayerExpanded(false)
  document
    .querySelector<HTMLElement>('[data-target-id="floating-speed-popover"]')
    ?.classList.add('u-hidden')
  document
    .querySelector<HTMLButtonElement>('[data-target-id="floating-speed-toggle"]')
    ?.setAttribute('aria-expanded', 'false')

  if (!audioController) return
  audioController.clearSession()
  highlightControllerGlobal?.clear()
  updateFloatingPlayer(audioController)
  refreshInlineAudioButtons(audioController)
  syncToolbarCurrentAliyahButton(null, audioController)
  syncAdminPanelState(audioController)
}

const showParshaPicker = () => {
  setAdminPanelVisible(false, audioControllerGlobal)
  ;[
    { selector: '[data-test-id="annotations-toggle"]', visible: false },
    { selector: '[data-target-id="settings-toggle"]', visible: false },
    { selector: '[data-target-id="about-link"]', visible: false },
    { selector: '[data-target-id="tikkun-book"]', visible: false },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  const jumper = ParshaPicker(createCalendarGenerator(), {
    calendarSettings,
    onCalendarSettingsChange: updateCalendarSettings,
  })
  jumper.node.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const link = target.closest<HTMLAnchorElement>('a[href^="#/"]')
    if (!link) return

    requestLastReadingSaveAfterRouteRender()
    if (link.hash !== location.hash || !audioControllerGlobal) return

    const route = parseUrl(createCalendarGenerator(), link.hash.replace(/^#/, ''))
    if (!route) return
    event.preventDefault()
    renderRoute(route, audioControllerGlobal)
  })
  jumper.node.addEventListener('submit', () => {
    requestLastReadingSaveAfterRouteRender()
  })

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

  const picker = document.querySelector('.parsha-picker')
  if (picker) {
    document
      .querySelector('[data-target-id="reader-shell"]')!
      .removeChild(picker)
  }

  syncReaderProgressVisibility()
  syncReaderSideNavigationVisibility()
  refreshReaderChrome(audioControllerGlobal ?? undefined)
}

const isShowingParshaPicker = () =>
  Boolean(document.querySelector('.parsha-picker'))

function updateCalendarSettings(settings: CalendarSettings) {
  saveCalendarSettings(settings)
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

const toggleAnnotations = (getPreviousCheckedState: () => boolean) => {
  const toggle = document.querySelector<HTMLInputElement>(
    '[data-target-id="annotations-toggle"]'
  )!

  toggle.checked = !getPreviousCheckedState()

  const book = document.querySelector('[data-target-id=tikkun-book]')!
  book.classList.toggle('mod-annotations-on', toggle.checked)
  book.classList.toggle('mod-annotations-off', !toggle.checked)
}

const debounce = (callback: () => void, delay: number) => {
  let timeout: ReturnType<typeof setTimeout>
  return () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      callback()
    }, delay)
  }
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

function setupDebugControls() {
  document
    .querySelectorAll<HTMLButtonElement>('[data-target-id="debug-focal-measure-toggle"]')
    .forEach((button) => button.addEventListener('click', toggleDebugFocalMeasure))
}

function listenForRevealGesture(book: HTMLElement) {
  const PULL_THRESHOLD = 30
  const PULL_MAXIMUM = 100

  const endTouch = () => {
    book.classList.add('mod-pull-releasing')
    book.style.setProperty('--pull-translation', `0`)
  }

  let startX = 0

  book.addEventListener('touchstart', (e) => {
    book.classList.remove('mod-pull-releasing')
    startX = e.changedTouches[0].screenX
  })

  book.addEventListener('touchmove', (e) => {
    const touchX = e.changedTouches[0].screenX
    const pullDistance = -Math.max(touchX - startX, -PULL_MAXIMUM)
    if (pullDistance < PULL_THRESHOLD) return

    book.style.setProperty(
      '--pull-translation',
      `${PULL_THRESHOLD - pullDistance}px`
    )
  })

  book.addEventListener('touchend', endTouch)
  book.addEventListener('touchcancel', endTouch)
}

function parseCurrentRoute(): AppRoute | null {
  return parseUrl(createCalendarGenerator(), location.hash.replace(/^#/, ''))
}

function getBook() {
  return document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
}

function focusReaderSurface() {
  getBook().focus({ preventScroll: true })
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

function getAudioButtonElements() {
  return [
    ...document.querySelectorAll<HTMLButtonElement>('[data-audio-button="true"]'),
  ]
}

function clampPlaybackRate(rate: number) {
  if (!Number.isFinite(rate)) return readerPreferences.playbackRate
  return Math.max(PLAYBACK_RATE_MIN, Math.min(PLAYBACK_RATE_MAX, rate))
}

function snapPlaybackRateToMark(rate: number, threshold = PLAYBACK_RATE_MAGNET_THRESHOLD) {
  const clampedRate = clampPlaybackRate(rate)
  const nearestMark = PLAYBACK_RATE_MARKS.reduce((nearest, mark) =>
    Math.abs(mark - clampedRate) < Math.abs(nearest - clampedRate) ? mark : nearest
  )

  return Math.abs(nearestMark - clampedRate) <= threshold ? nearestMark : clampedRate
}

function formatPlaybackRate(rate: number) {
  const rounded = Math.round(clampPlaybackRate(rate) * 100) / 100
  return `${rounded.toFixed(2).replace(/\.?0+$/, '')}x`
}

function syncSettingsPlaybackRateInput() {
  const playbackRate = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-playback-rate"]'
  )
  if (playbackRate) {
    playbackRate.value = `${Number(clampPlaybackRate(readerPreferences.playbackRate).toFixed(2))}`
  }
}

function syncFloatingPlaybackRateControl(audioController?: AudioController) {
  const rate = clampPlaybackRate(readerPreferences.playbackRate)
  const button = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-speed-toggle"]'
  )
  const slider = document.querySelector<HTMLInputElement>(
    '[data-target-id="floating-speed-slider"]'
  )

  if (button) button.textContent = formatPlaybackRate(rate)
  if (slider) slider.value = `${rate}`
  if (audioController) audioController.audio.playbackRate = rate
}

function applyPlaybackRatePreference(
  audioController: AudioController,
  requestedRate: number,
  { snap = false }: { snap?: boolean } = {}
) {
  const playbackRate = snap
    ? snapPlaybackRateToMark(requestedRate)
    : clampPlaybackRate(requestedRate)
  readerPreferences = mergeReaderPreferences(readerPreferences, { playbackRate })
  applyReaderPreferences(readerPreferences)
  audioController.audio.playbackRate = playbackRate
  syncSettingsPlaybackRateInput()
  syncFloatingPlaybackRateControl(audioController)
}

function playbackRateFromSliderPointer(slider: HTMLInputElement, clientX: number) {
  const rect = slider.getBoundingClientRect()
  const ratio = (clientX - rect.left) / Math.max(rect.width, 1)
  return PLAYBACK_RATE_MIN + Math.max(0, Math.min(1, ratio)) *
    (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN)
}

function getOfflinePrompt() {
  return document.querySelector<HTMLElement>('[data-target-id="app-offline-prompt"]')
}

function showOfflinePrompt({ force = false }: { force?: boolean } = {}) {
  if (force) hasDismissedOfflinePrompt = false
  if (hasDismissedOfflinePrompt) return
  getOfflinePrompt()?.classList.remove('u-hidden')
}

function hideOfflinePrompt() {
  getOfflinePrompt()?.classList.add('u-hidden')
}

function setPendingNetworkRecordingRetry(retry?: () => Promise<void>) {
  pendingNetworkRecordingRetry = retry ?? null
}

function canPlayNetworkRecording(retry?: () => Promise<void>) {
  if (navigator.onLine) return true
  setPendingNetworkRecordingRetry(retry)
  showOfflinePrompt({ force: true })
  return false
}

async function playNetworkRecording(
  audioController: AudioController,
  retry?: () => Promise<void>
) {
  if (audioController.audio.paused && !canPlayNetworkRecording(retry)) return false
  if (audioController.audio.error && audioController.session) audioController.audio.load()
  await audioController.play()
  return true
}

async function replayNetworkRecordingFromStart(
  audioController: AudioController,
  retry?: () => Promise<void>
) {
  if (!canPlayNetworkRecording(retry)) return false
  await audioController.replayFromStart()
  return true
}

function setupOfflineRecordingPrompt() {
  document
    .querySelector<HTMLButtonElement>('[data-target-id="app-offline-dismiss"]')
    ?.addEventListener('click', () => {
      hasDismissedOfflinePrompt = true
      hideOfflinePrompt()
    })

  window.addEventListener('offline', () => {
    hasDismissedOfflinePrompt = false
    showOfflinePrompt()
  })
  window.addEventListener('online', () => {
    hasDismissedOfflinePrompt = false
    hideOfflinePrompt()
    const retry = pendingNetworkRecordingRetry
    pendingNetworkRecordingRetry = null
    void retry?.()
  })

  if (!navigator.onLine) showOfflinePrompt()
}

function getAliyahMarkerElements() {
  return [
    ...document.querySelectorAll<HTMLElement>('[data-aliyah-marker="true"]'),
  ]
}

function parsePlaybackAliyahIndex(
  value: string | undefined
): PlaybackAliyahIndex | null {
  if (value === 'Maftir') return 'Maftir'
  const index = Number(value)
  return Number.isInteger(index) && index >= 1 ? index : null
}

function recordingAliyahIndexForPlayback(
  aliyahIndex: PlaybackAliyahIndex
): number {
  return aliyahIndex === 'Maftir' ? 7 : aliyahIndex
}

function aliyahMarkerSelector(runId: string, aliyahIndex: PlaybackAliyahIndex) {
  return `[data-aliyah-marker="true"][data-run-id="${runId}"][data-aliyah-index="${aliyahIndex}"]`
}

function isSameRunMaftirMarker(marker: HTMLElement | null, runId: string) {
  return marker?.dataset.runId === runId && marker.dataset.aliyahIndex === 'Maftir'
}

const aliyahTokenKeysCache = new Map<string, string[]>()

function getAliyahTokenKeysCacheKey(
  runId: string,
  aliyahIndex: PlaybackAliyahIndex
) {
  return `${runId}:${aliyahIndex}`
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

function getAliyahProgressAnchors(): AliyahProgressAnchor[] {
  const book = getBook()
  const bookRect = book.getBoundingClientRect()

  return [...book.querySelectorAll<HTMLElement>('[data-line-index][data-aliyah-starts]')]
    .map((line) => {
      const rect = line.getBoundingClientRect()
      const label = line.querySelector('.aliyah-label-text')?.textContent?.trim() ?? '—'
      const aliyahStarts = (line.dataset.aliyahStarts ?? '').split(',')
      const aliyahIndex = parsePlaybackAliyahIndex(aliyahStarts[0])
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

function getPlaybackAliyahLabel(aliyahIndex: PlaybackAliyahIndex) {
  if (aliyahIndex === 'Maftir') return 'מפטיר'
  return ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'ששי', 'שביעי'][
    aliyahIndex - 1
  ]
}

function getCurrentAliyahFromViewportRange(
  range: ViewportRange | null,
  anchors: AliyahProgressAnchor[]
): AliyahProgressAnchor | null {
  const center = range?.center
  const centerAliyah = center?.aliyot[0]
  const centerRun = center?.run
  if (!centerRun || !centerAliyah?.index) return null

  const matchingAnchor = anchors.find(
    (anchor) =>
      anchor.run === centerRun && anchor.aliyahIndex === centerAliyah.index
  )
  if (matchingAnchor) {
    return {
      ...matchingAnchor,
      label: getPlaybackAliyahLabel(centerAliyah.index),
    }
  }

  return {
    line: null,
    label: getPlaybackAliyahLabel(centerAliyah.index),
    run: centerRun,
    aliyahIndex: centerAliyah.index,
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
  if (!display) return
  if (progressAnchorLoadPromise) return progressAnchorLoadPromise

  progressAnchorLoadPromise = (async () => {
    let anchors = getAliyahProgressAnchors()
    while (anchors.length <= currentIndex + 1) {
      const renderedPages = display.getRenderedPageNumbers()
      const lastPage = renderedPages[renderedPages.length - 1]
      const loaded = await display.ensurePageRendered(lastPage + 1)
      if (!loaded) break
      anchors = getAliyahProgressAnchors()
    }
  })().finally(() => {
    progressAnchorLoadPromise = null
  })

  return progressAnchorLoadPromise
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
  if (!lineInfo?.run || !aliyahIndex) return null

  const recording = findRecordingForRun({
    narratorId: readerPreferences.narratorId,
    run: lineInfo.run,
    aliyahIndex,
  })

  return {
    lineInfo,
    aliyahIndex,
    recording,
  }
}

function refreshInlineAudioButtons(audioController: AudioController) {
  for (const button of getAudioButtonElements()) {
    const state = getSessionButtonState(button)
    const available = Boolean(state?.recording)
    const isCurrentSession = Boolean(
      available &&
        audioController.session?.recording.id === state?.recording?.id
    )
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

  const isTableOfContentsVisible = isShowingParshaPicker()
  const available = Boolean(
    current?.run &&
      current.aliyahIndex &&
      recording &&
      !isTableOfContentsVisible
  )
  const isCurrentSession = Boolean(
    available && audioController?.session?.recording.id === recording?.id
  )
  const isPlayingCurrentSession = Boolean(
    isCurrentSession && audioController && !audioController.audio.paused
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
}

async function collectAliyahTokenKeys({
  runId,
  aliyahIndex,
}: {
  runId: string
  aliyahIndex: PlaybackAliyahIndex
}) {
  const cacheKey = getAliyahTokenKeysCacheKey(runId, aliyahIndex)
  const cachedTokenKeys = aliyahTokenKeysCache.get(cacheKey)
  if (cachedTokenKeys) return [...cachedTokenKeys]

  const markerSelector = aliyahMarkerSelector(runId, aliyahIndex)
  let marker = document.querySelector<HTMLElement>(markerSelector)
  while (!marker) {
    const renderedPages = display.getRenderedPageNumbers()
    const lastPage = renderedPages[renderedPages.length - 1]
    if (!lastPage) return []

    const loaded = await display.ensurePageRendered(lastPage + 1)
    if (!loaded) return []

    marker = document.querySelector<HTMLElement>(markerSelector)
  }

  let markers = getAliyahMarkerElements()
  let markerIndex = markers.indexOf(marker)
  let nextMarker = markers[markerIndex + 1] ?? null

  while (!nextMarker) {
    const renderedPages = display.getRenderedPageNumbers()
    const lastPage = renderedPages[renderedPages.length - 1]
    const loaded = await display.ensurePageRendered(lastPage + 1)
    if (!loaded) break
    markers = getAliyahMarkerElements()
    marker = document.querySelector<HTMLElement>(markerSelector)
    if (!marker) break
    markerIndex = markers.indexOf(marker)
    nextMarker = markers[markerIndex + 1] ?? null
  }

  if (aliyahIndex === 7 && isSameRunMaftirMarker(nextMarker, runId)) {
    nextMarker = markers[markerIndex + 2] ?? null
  }

  const startLine = marker.closest<HTMLElement>('[data-class="line"]')
  const endLine = nextMarker?.closest<HTMLElement>('[data-class="line"]') ?? null
  if (!startLine) return []

  const tokenKeys = collectTokenKeysForAliyahRange({
    book: getBook(),
    startLine,
    endLine,
  })
  if (tokenKeys.length) aliyahTokenKeysCache.set(cacheKey, tokenKeys)
  return [...tokenKeys]
}

async function seekAudioSessionToTokenKey(
  audioController: AudioController,
  highlightController: HighlightController,
  tokenKey: string | undefined
) {
  const session = audioController.session
  if (!session) return

  const cueIndex = tokenKey
    ? session.cues.findIndex((candidate) => cueKey(candidate) === tokenKey)
    : session.cues.length ? 0 : -1
  const cue = cueIndex >= 0 ? session.cues[cueIndex] : undefined

  if (cue) {
    audioController.seek(cue.timeStart)
    cueNavigationIndex = cueIndex
    await highlightController.activateCue(cue, { scroll: true })
    return
  }

  const fallbackTokenKey = tokenKey ?? session.tokenKeys[0]
  if (fallbackTokenKey) {
    await highlightController.activateTokenKey(fallbackTokenKey, {
      scroll: true,
    })
  }
}

function isCurrentPlaybackWithinTokenKeys(
  audioController: AudioController,
  highlightController: HighlightController,
  tokenKeys: string[]
) {
  const activeTokenKey = highlightController.getActiveTokenKey()
  if (activeTokenKey && tokenKeys.includes(activeTokenKey)) return true

  const session = audioController.session
  if (!session?.cues.length) return false

  const cueIndex = highlightController.getCueIndex(
    session.cues,
    audioController.audio.currentTime
  )
  if (cueIndex < 0) return false

  return tokenKeys.includes(cueKey(session.cues[cueIndex]))
}

async function loadAudioSessionForRecording(
  {
    recording,
    runId,
    aliyahIndex,
  }: {
    recording: AudioRecording
    runId: string
    aliyahIndex: PlaybackAliyahIndex
  },
  audioController: AudioController,
  highlightController: HighlightController
) {
  const recordingAliyahIndex = recordingAliyahIndexForPlayback(aliyahIndex)
  const isMaftirPlaybackRequest = aliyahIndex === 'Maftir'
  const tokenKeys = await collectAliyahTokenKeys({
    runId,
    aliyahIndex: recordingAliyahIndex,
  })
  if (!tokenKeys.length) return null

  if (audioController.session?.recording.id === recording.id) {
    if (isMaftirPlaybackRequest) {
      const requestedTokenKeys = await collectAliyahTokenKeys({ runId, aliyahIndex })
      highlightController.setSequence(tokenKeys)
      await seekAudioSessionToTokenKey(
        audioController,
        highlightController,
        requestedTokenKeys[0] ?? tokenKeys[0]
      )
    }
    return audioController.session
  }

  const session: ActiveAudioSession = {
    recording,
    cues: cloneCues(getCuesForRecording(recording)),
    runId,
    aliyahIndex: recordingAliyahIndex,
    tokenKeys,
  }

  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  adminState.sourceCues = cloneCues(session.cues)
  const draft = loadAdminDraft(session.recording.id, tokenKeys.length)
  assignAdminCues(draft?.cues ?? cloneCues(adminState.sourceCues), audioController)
  adminState.tokenPointer =
    draft?.tokenPointer ?? getAdminResumeTokenPointer(tokenKeys.length)
  adminState.draftOrigin = draft ? 'local' : adminState.sourceCues.length ? 'published' : 'none'
  adminState.draftSavedAt =
    draft?.updatedAt ?? getCueSavedAtForRecording(session.recording) ?? null
  adminState.recording = false
  cueNavigationIndex = session.cues.length ? 0 : null
  syncAdminPanelState(audioController)

  if (isMaftirPlaybackRequest) {
    const requestedTokenKeys = await collectAliyahTokenKeys({ runId, aliyahIndex })
    await seekAudioSessionToTokenKey(
      audioController,
      highlightController,
      requestedTokenKeys[0] ?? tokenKeys[0]
    )
  } else if (session.cues.length) {
    audioController.seek(session.cues[0].timeStart)
    await highlightController.activateCue(session.cues[0], {
      scroll: true,
    })
  } else if (tokenKeys[0]) {
    await highlightController.activateTokenKey(tokenKeys[0], {
      scroll: true,
    })
  }

  updateFloatingPlayer(audioController)
  refreshInlineAudioButtons(audioController)
  return session
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function waitForCurrentAudioMetadata(audioController: AudioController) {
  if (Number.isFinite(audioController.audio.duration) && audioController.audio.duration > 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for audio metadata'))
    }, 15000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      audioController.audio.removeEventListener('loadedmetadata', loaded)
      audioController.audio.removeEventListener('error', failed)
    }
    const loaded = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('Audio metadata failed to load'))
    }

    audioController.audio.addEventListener('loadedmetadata', loaded, { once: true })
    audioController.audio.addEventListener('error', failed, { once: true })
  })
}

async function loadRecordingSessionByAudioId(
  audioId: string,
  audioController: AudioController,
  highlightController: HighlightController
) {
  const recording = listRecordings().find((entry) => entry.id === audioId) ?? null
  if (!recording) return null

  await display?.rendered
  await display?.scrolled
  const run =
    display?.viewModel.relevantRuns.find(
      (candidate) => parshaSlugForRun(candidate) === recording.parshaSlug
    ) ?? null
  if (!run) return null

  const session = await loadAudioSessionForRecording(
    {
      recording,
      runId: run.id,
      aliyahIndex: recording.aliyah,
    },
    audioController,
    highlightController
  )
  if (!session) return null

  await waitForCurrentAudioMetadata(audioController)
  return session
}

function updateFloatingPlayer(audioController: AudioController) {
  const player = document.querySelector<HTMLElement>('[data-target-id="floating-player"]')!
  const cornerControls = document.querySelector<HTMLElement>('.reader-corner-controls')
  const prevButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-prev"]'
  )!
  const playButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-play"]'
  )!
  const mobileDash = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-mobile-toggle"]'
  )!
  const nextButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-next"]'
  )!
  const replayButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-replay"]'
  )!
  const expandButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-expand-toggle"]'
  )!
  const downloadLink = document.querySelector<HTMLAnchorElement>(
    '[data-target-id="floating-download"]'
  )!
  const videoDownloadLink = document.querySelector<HTMLAnchorElement>(
    '[data-target-id="floating-video-download"]'
  )!
  const activeSession = audioController.session
  const activeVideo = activeSession
    ? findVideoForRecording(activeSession.recording.id)
    : null

  player.classList.toggle('u-hidden', !activeSession)
  if (!activeSession) {
    setFloatingPlayerExpanded(false)
  }
  cornerControls?.classList.toggle('mod-raised', Boolean(activeSession))
  const isPaused = audioController.audio.paused
  setControlIcon(playButton, isPaused ? 'play' : 'pause')
  for (const button of [prevButton, playButton, nextButton, replayButton, expandButton]) {
    button.disabled = !activeSession
  }
  mobileDash.disabled = !activeSession
  mobileDash.classList.toggle('is-active', Boolean(activeSession && !isPaused))
  mobileDash.title = isPaused ? 'Play' : 'Pause'
  mobileDash.setAttribute('aria-label', mobileDash.title)
  downloadLink.setAttribute('aria-disabled', activeSession ? 'false' : 'true')
  downloadLink.tabIndex = activeSession ? 0 : -1
  videoDownloadLink.classList.toggle('u-hidden', !activeVideo)
  videoDownloadLink.setAttribute('aria-disabled', activeVideo ? 'false' : 'true')
  videoDownloadLink.tabIndex = activeVideo ? 0 : -1

  if (activeSession) {
    downloadLink.href = activeSession.recording.downloadSrc
    downloadLink.download = `${activeSession.recording.id}.${activeSession.recording.format}`
  } else {
    downloadLink.href = '#'
    downloadLink.removeAttribute('download')
  }

  if (activeVideo) {
    videoDownloadLink.href = activeVideo.downloadSrc
    videoDownloadLink.download = `${activeVideo.audioId}_${activeVideo.quality}.mp4`
  } else {
    videoDownloadLink.href = '#'
    videoDownloadLink.removeAttribute('download')
  }

  syncFloatingPlaybackRateControl(audioController)
  updateFloatingPlayerAudioProgress(audioController)
  updateFloatingPlayerMeta(audioController)
  const anchors = getAliyahProgressAnchors()
  const viewportCenter = getReaderFocalPointScrollTop(getBook())
  let currentIndex = 0
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i].position <= viewportCenter) currentIndex = i
    else break
  }
  syncToolbarCurrentAliyahButton(anchors[currentIndex] ?? null, audioController)
}

function setFloatingPlayerExpanded(expanded: boolean) {
  const player = document.querySelector<HTMLElement>('[data-target-id="floating-player"]')
  if (!player) return

  const canExpand = floatingPlayerDesktopMediaQuery.matches
  const nextExpanded = canExpand ? expanded : false
  floatingPlayerExpanded = nextExpanded

  player.classList.toggle('is-expanded', nextExpanded)
  player.classList.toggle('mod-expandable', canExpand)
  player.removeAttribute('title')

  const expandButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-expand-toggle"]'
  )
  if (!expandButton) return

  const label = nextExpanded ? 'Hide player progress' : 'Show player progress'
  setControlIcon(expandButton, nextExpanded ? 'collapse' : 'expand')
  expandButton.title = label
  expandButton.setAttribute('aria-label', label)
  expandButton.setAttribute('aria-expanded', `${nextExpanded}`)
}

function getProgressTargets() {
  const player = document.querySelector<HTMLElement>('[data-target-id="floating-player"]')
  const adminProgress = document.querySelector<HTMLElement>(
    '[data-target-id="admin-progress"]'
  )
  return [player, adminProgress]
}

function updateFloatingPlayerAudioProgress(audioController: AudioController) {
  const { currentTime, duration } = audioController.audio
  const progress =
    audioController.session && Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(1, currentTime / duration))
      : 0

  for (const target of getProgressTargets()) {
    target?.style.setProperty('--audio-progress-ratio', `${progress}`)
  }

  updateFloatingPlayerCueProgress(audioController)
}

function updateFloatingPlayerCueProgress(
  audioController: AudioController,
  cueIndex = audioController.session
    ? getCurrentCueIndex(audioController.session, audioController.audio.currentTime)
    : -1
) {
  const session = audioController.session
  const wordProgress = getWordProgress({
    cueIndex,
    cueCount: session?.cues.length ?? 0,
    tokenCount: session?.tokenKeys.length ?? 0,
  })

  for (const target of getProgressTargets()) {
    target?.style.setProperty('--cue-progress-ratio', `${wordProgress.ratio}`)
  }

  const floatingCues = document.querySelector<HTMLElement>(
    '[data-target-id="floating-meta-cues"]'
  )
  const adminCues = document.querySelector<HTMLElement>(
    '[data-target-id="admin-meta-cues"]'
  )
  if (floatingCues) floatingCues.textContent = wordProgress.label
  if (adminCues) adminCues.textContent = wordProgress.label
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'

  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function getCurrentCueIndex(session: ActiveAudioSession, currentTime: number) {
  let cueIndex = -1
  for (let i = 0; i < session.cues.length; i++) {
    if (session.cues[i].timeStart <= currentTime) cueIndex = i
    else break
  }
  return cueIndex
}

function updateFloatingPlayerMeta(audioController: AudioController) {
  const parsha = document.querySelector<HTMLElement>('[data-target-id="floating-meta-parsha"]')
  const aliyah = document.querySelector<HTMLElement>('[data-target-id="floating-meta-aliyah"]')
  const cues = document.querySelector<HTMLElement>('[data-target-id="floating-meta-cues"]')
  const duration = document.querySelector<HTMLElement>('[data-target-id="floating-meta-duration"]')
  const adminCues = document.querySelector<HTMLElement>('[data-target-id="admin-meta-cues"]')
  const adminDuration = document.querySelector<HTMLElement>(
    '[data-target-id="admin-meta-duration"]'
  )
  const session = audioController.session

  if (!session) {
    if (parsha) parsha.textContent = '—'
    if (aliyah) aliyah.textContent = '—'
    if (cues) cues.textContent = '0 / 0'
    if (duration) duration.textContent = '0:00 / 0:00'
    if (adminCues) adminCues.textContent = '0 / 0'
    if (adminDuration) adminDuration.textContent = '0:00 / 0:00'
    return
  }

  const cueIndex = getCurrentCueIndex(session, audioController.audio.currentTime)
  const wordProgress = getWordProgress({
    cueIndex,
    cueCount: session.cues.length,
    tokenCount: session.tokenKeys.length,
  })
  const durationLabel = `${formatDuration(audioController.audio.currentTime)} / ${formatDuration(
    audioController.audio.duration
  )}`

  if (parsha) parsha.textContent = session.recording.parshaName
  if (aliyah) aliyah.textContent = hebrewNumeral(session.recording.aliyah)
  if (cues) cues.textContent = wordProgress.label
  if (duration) duration.textContent = durationLabel
  if (adminCues) adminCues.textContent = wordProgress.label
  if (adminDuration) adminDuration.textContent = durationLabel
}

function pauseCurrentRecording(audioController: AudioController) {
  audioController.pause()
  updateFloatingPlayer(audioController)
  refreshInlineAudioButtons(audioController)
  syncAdminPanelState(audioController)
}

async function toggleCurrentRecordingPlayback(
  audioController: AudioController,
  retry?: () => Promise<void>
) {
  if (!audioController.audio.paused) {
    pauseCurrentRecording(audioController)
    return true
  }

  const played = await playNetworkRecording(audioController, retry)
  if (played) updateFloatingPlayer(audioController)
  return played
}

async function startPlaybackForButton(
  button: HTMLButtonElement,
  audioController: AudioController,
  highlightController: HighlightController
) {
  const state = getSessionButtonState(button)
  if (!state?.recording || !state.lineInfo.run) return

  if (audioController.session?.recording.id === state.recording.id) {
    if (state.aliyahIndex === 'Maftir') {
      if (!audioController.audio.paused) {
        pauseCurrentRecording(audioController)
        return
      }

      const maftirTokenKeys = await collectAliyahTokenKeys({
        runId: state.lineInfo.run.id,
        aliyahIndex: state.aliyahIndex,
      })

      if (isCurrentPlaybackWithinTokenKeys(audioController, highlightController, maftirTokenKeys)) {
        await toggleCurrentRecordingPlayback(audioController, () =>
          startPlaybackForButton(button, audioController, highlightController)
        )
        return
      }

      const session = await loadAudioSessionForRecording(
        {
          recording: state.recording,
          runId: state.lineInfo.run.id,
          aliyahIndex: state.aliyahIndex,
        },
        audioController,
        highlightController
      )
      if (!session) return

      await playNetworkRecording(audioController, () =>
        startPlaybackForButton(button, audioController, highlightController)
      )
      updateFloatingPlayer(audioController)
      return
    }

    if (audioController.audio.paused) {
      const session = audioController.session
      const activeTokenKey = highlightController.getActiveTokenKey()
      const cueIndex = session?.cues.length
        ? highlightController.getCueIndex(session.cues, audioController.audio.currentTime)
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

    await toggleCurrentRecordingPlayback(audioController, () =>
      startPlaybackForButton(button, audioController, highlightController)
    )
    return
  }

  if (
    !canPlayNetworkRecording(() =>
      startPlaybackForButton(button, audioController, highlightController)
    )
  ) {
    return
  }

  const session = await loadAudioSessionForRecording(
    {
      recording: state.recording,
      runId: state.lineInfo.run.id,
      aliyahIndex: state.aliyahIndex,
    },
    audioController,
    highlightController
  )
  if (!session) return

  await playNetworkRecording(audioController, () =>
    startPlaybackForButton(button, audioController, highlightController)
  )
}

async function startPlaybackForToolbarCurrentAliyah(
  button: HTMLButtonElement,
  audioController: AudioController,
  highlightController: HighlightController
) {
  const runId = button.dataset.runId
  const aliyahIndex = parsePlaybackAliyahIndex(button.dataset.aliyahIndex)
  if (!runId || !aliyahIndex) return

  const marker = document.querySelector<HTMLElement>(
    aliyahMarkerSelector(runId, aliyahIndex)
  )
  if (!marker) return

  const lineInfo = getLineInfoFromElement(marker)
  if (!lineInfo?.run) return

  const recording = findRecordingForRun({
    narratorId: readerPreferences.narratorId,
    run: lineInfo.run,
    aliyahIndex,
  })
  if (!recording) return

  if (audioController.session?.recording.id === recording.id) {
    if (aliyahIndex === 'Maftir') {
      if (!audioController.audio.paused) {
        pauseCurrentRecording(audioController)
        return
      }

      const maftirTokenKeys = await collectAliyahTokenKeys({ runId, aliyahIndex })

      if (
        isCurrentPlaybackWithinTokenKeys(
          audioController,
          highlightController,
          maftirTokenKeys
        )
      ) {
        await toggleCurrentRecordingPlayback(audioController, () =>
          startPlaybackForToolbarCurrentAliyah(button, audioController, highlightController)
        )
        return
      }

      const session = await loadAudioSessionForRecording(
        {
          recording,
          runId,
          aliyahIndex,
        },
        audioController,
        highlightController
      )
      if (!session) return

      await playNetworkRecording(audioController, () =>
        startPlaybackForToolbarCurrentAliyah(button, audioController, highlightController)
      )
      updateFloatingPlayer(audioController)
      return
    }

    await toggleCurrentRecordingPlayback(audioController, () =>
      startPlaybackForToolbarCurrentAliyah(button, audioController, highlightController)
    )
    return
  }

  if (
    !canPlayNetworkRecording(() =>
      startPlaybackForToolbarCurrentAliyah(button, audioController, highlightController)
    )
  ) {
    return
  }

  const session = await loadAudioSessionForRecording(
    {
      recording,
      runId,
      aliyahIndex,
    },
    audioController,
    highlightController
  )
  if (!session) return

  await playNetworkRecording(audioController, () =>
    startPlaybackForToolbarCurrentAliyah(button, audioController, highlightController)
  )
}

async function syncCurrentSessionHighlight(
  audioController?: AudioController,
  highlightController?: HighlightController
) {
  if (!audioController || !highlightController) return
  const session = audioController.session
  if (!session) return

  if (session.cues.length) {
    const cueIndex = highlightController.getCueIndex(
      session.cues,
      audioController.audio.currentTime
    )
    if (cueIndex >= 0) {
      cueNavigationIndex = cueIndex
      await highlightController.activateCue(session.cues[cueIndex], {
        scroll: readerPreferences.autoScrollWithPlayback,
      })
    }
    return
  }

  const current = highlightController.getActiveTokenKey()
  if (!current && session.tokenKeys[0]) {
    await highlightController.activateTokenKey(session.tokenKeys[0], {
      scroll: readerPreferences.autoScrollWithPlayback,
    })
  }
}

function stepPlayback(
  delta: -1 | 1,
  audioController: AudioController,
  highlightController: HighlightController
) {
  const session = audioController.session
  if (!session) return

  if (session.cues.length) {
    const currentCueIndex =
      cueNavigationIndex ??
      highlightController.getCueIndex(session.cues, audioController.audio.currentTime)
    const targetCue = session.cues[Math.max(0, currentCueIndex + delta)]
    if (!targetCue) return
    cueNavigationIndex = session.cues.indexOf(targetCue)
    audioController.seek(targetCue.timeStart)
    highlightController.activateCue(targetCue, {
      scroll: readerPreferences.autoScrollWithPlayback,
    })
    return
  }

  highlightController.step(delta, {
    scroll: readerPreferences.autoScrollWithPlayback,
  })
}

async function replayAliyahFromStart(
  audioController: AudioController,
  highlightController: HighlightController,
  { restartAudio = true }: { restartAudio?: boolean } = {}
) {
  const session = audioController.session
  if (!session) return
  if (
    restartAudio &&
    !canPlayNetworkRecording(() =>
      replayAliyahFromStart(audioController, highlightController, { restartAudio })
    )
  ) {
    return
  }

  if (session.cues.length) {
    cueNavigationIndex = 0
    await highlightController.activateCue(session.cues[0], { scroll: true })
  } else if (session.tokenKeys[0]) {
    await highlightController.activateTokenKey(session.tokenKeys[0], {
      scroll: true,
    })
  }

  if (restartAudio) {
    await replayNetworkRecordingFromStart(audioController, () =>
      replayAliyahFromStart(audioController, highlightController, { restartAudio })
    )
  }
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
  const matchingProgressIndex =
    currentForChrome && currentForChrome.line
      ? anchors.findIndex((anchor) => anchor.line === currentForChrome.line)
      : currentIndex
  const progressIndex =
    matchingProgressIndex >= 0 ? matchingProgressIndex : currentIndex
  const progressCurrent = anchors[progressIndex] ?? current
  const next = anchors[progressIndex + 1]

  if (!progressCurrent || !next) {
    if (progressCurrent) {
      void ensureNextProgressAnchorLoaded(progressIndex).then(() =>
        scheduleDeferredProgressRefresh()
      )
      return
    }
    fill.style.height = '0%'
    percent.textContent = '0%'
    mobileFill?.style.setProperty('width', '0%')
    return
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      (viewportCenter - progressCurrent.position) /
        (next.position - progressCurrent.position)
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

function refreshReaderChrome(audioController?: AudioController) {
  if (audioController) refreshInlineAudioButtons(audioController)
  updateReaderProgress()
}

function updateAdminCounter(tokenCount: number) {
  const counter = document.querySelector<HTMLElement>(
    '[data-target-id="admin-cue-count"]'
  )!
  const pointer = adminState.tokenPointer >= 0 ? adminState.tokenPointer + 1 : 0
  counter.textContent = `${adminState.cues.length} / ${tokenCount} Words · ${pointer}`
}

function mountAdminEditorUi() {
  const panel = document.querySelector<HTMLElement>('[data-target-id="admin-panel"]')
  if (!panel || panel.querySelector('[data-target-id="admin-draft-status"]')) return

  panel.insertAdjacentHTML(
    'beforeend',
    `
      <div class="admin-panel-draft" data-target-id="admin-draft-status">
        Drafts autosave locally per recording.
      </div>
      <div class="admin-panel-actions mod-secondary" data-target-id="admin-resume-wrap" hidden>
        <button type="button" class="toolbar-button" data-target-id="admin-resume-draft">Resume Draft</button>
      </div>
      <div class="admin-panel-draft" data-target-id="admin-sync-note" hidden>
        To visualize synced autoplay highlighting, press 'Stop Recording'.
      </div>
      <div class="admin-panel-actions mod-secondary">
        <button type="button" class="toolbar-button" data-target-id="admin-prev-saved">Prev Saved</button>
        <button type="button" class="toolbar-button" data-target-id="admin-play-current">Play Current</button>
        <button type="button" class="toolbar-button" data-target-id="admin-next-saved">Next Saved</button>
        <button type="button" class="toolbar-button" data-target-id="admin-trim-here">Trim From Here</button>
      </div>
      <div class="admin-panel-actions mod-secondary mod-timing">
        <button type="button" class="toolbar-button" data-admin-nudge="-0.25" title="Move selected cue back 250ms" aria-label="Move selected cue back 250ms">-250</button>
        <button type="button" class="toolbar-button" data-admin-nudge="-0.05" title="Move selected cue back 50ms" aria-label="Move selected cue back 50ms">-50</button>
        <button type="button" class="toolbar-button" data-admin-nudge="0.05" title="Move selected cue forward 50ms" aria-label="Move selected cue forward 50ms">+50</button>
        <button type="button" class="toolbar-button" data-admin-nudge="0.25" title="Move selected cue forward 250ms" aria-label="Move selected cue forward 250ms">+250</button>
      </div>
      <div class="admin-cue-list" data-target-id="admin-cue-list"></div>
      <div class="admin-progress-list" data-target-id="admin-progress">
        <div class="floating-player-progress-item">
          <div class="floating-player-progress-head">
            <span class="floating-player-progress-label">Word Progress</span>
            <span class="floating-player-progress-value" data-target-id="admin-meta-cues">0 / 0</span>
          </div>
          <div class="floating-player-progress-track">
            <div class="floating-player-progress-fill mod-cues"></div>
          </div>
        </div>
        <div class="floating-player-progress-item">
          <div class="floating-player-progress-head">
            <span class="floating-player-progress-label">Audio Progress</span>
            <span class="floating-player-progress-value" data-target-id="admin-meta-duration">0:00 / 0:00</span>
          </div>
          <div class="floating-player-progress-track">
            <div class="floating-player-progress-fill mod-audio"></div>
          </div>
        </div>
      </div>
    `
  )
}

function getAdminSelectedTokenIndex(
  highlightController: HighlightController | null = highlightControllerGlobal
) {
  const session = getAdminSession()
  if (!session?.tokenKeys.length) return -1
  if (adminState.tokenPointer >= 0) {
    return Math.min(adminState.tokenPointer, session.tokenKeys.length - 1)
  }

  const activeIndex = highlightController?.getActiveIndex() ?? -1
  if (activeIndex < 0) return -1
  return Math.min(activeIndex, session.tokenKeys.length - 1)
}

function getEditableAdminCueIndex(
  highlightController: HighlightController | null = highlightControllerGlobal
) {
  if (!adminState.cues.length) return -1

  const selectedTokenIndex = getAdminSelectedTokenIndex(highlightController)
  if (selectedTokenIndex >= 0 && selectedTokenIndex < adminState.cues.length) {
    return selectedTokenIndex
  }

  return adminState.cues.length - 1
}

function getAdminResumeTokenPointer(tokenCount: number) {
  if (!tokenCount) return -1
  return adminState.cues.length < tokenCount
    ? adminState.cues.length
    : tokenCount - 1
}

function isSeededFirstCuePreview(
  session: ActiveAudioSession,
  activeIndex: number
) {
  if (activeIndex !== 0 || adminState.tokenPointer !== 1 || adminState.cues.length !== 1) {
    return false
  }

  const firstCue = adminState.cues[0]
  return Boolean(
    firstCue &&
      firstCue.timeStart === 0 &&
      session.tokenKeys[0] &&
      cueKey(firstCue) === session.tokenKeys[0]
  )
}

async function selectAdminTokenIndex(
  index: number,
  highlightController: HighlightController,
  {
    play = false,
    preservePlayback = false,
    seekToCue = true,
    focusRow = false,
  }: {
    play?: boolean
    preservePlayback?: boolean
    seekToCue?: boolean
    focusRow?: boolean
  } = {}
) {
  const audioController = audioControllerGlobal
  const session = audioController?.session
  if (!audioController || !session?.tokenKeys.length) return

  const clampedIndex = Math.max(0, Math.min(index, session.tokenKeys.length - 1))
  adminState.tokenPointer = clampedIndex

  const cue = adminState.cues[clampedIndex]
  if (seekToCue && cue) {
    if (!preservePlayback) audioController.pause()
    audioController.seek(cue.timeStart)
    cueNavigationIndex = clampedIndex
  } else if (!play && !preservePlayback) {
    audioController.pause()
  }

  await highlightController.activateTokenKey(session.tokenKeys[clampedIndex], {
    scroll: readerPreferences.autoScrollWithPlayback,
  })

  if (play && cue && audioController.audio.paused) {
    await playNetworkRecording(audioController, () =>
      selectAdminTokenIndex(index, highlightController, {
        play,
        preservePlayback,
        seekToCue,
        focusRow,
      })
    )
  }

  updateFloatingPlayer(audioController)
  syncAdminPanelState(audioController)
  if (focusRow) {
    focusAdminCueRow(getEditableAdminCueIndex(highlightController))
  }
}

function getAdminTokenLabel(index: number) {
  const session = getAdminSession()
  const cue = adminState.cues[index]
  const tokenKey = session?.tokenKeys[index]

  if (tokenKey) {
    const token = document.querySelector<HTMLElement>(`[data-token-key="${tokenKey}"]`)
    const tokenText = token?.textContent?.trim().replace(/\s+/g, ' ')
    if (tokenText) return tokenText
  }

  if (!cue) return `Word ${index + 1}`

  return `Page ${cue.pageNumber} · Line ${cue.lineIndex + 1} · Word ${cue.wordIndex + 1}`
}

function getAdminDraftStatusText(audioController?: AudioController | null) {
  const session = getAdminSession(audioController)
  if (!session) return 'Drafts autosave locally per recording.'

  if (adminState.draftOrigin === 'local' && adminState.draftSavedAt) {
    return `Local draft active for ${session.recording.title}. Last saved at ${adminDraftTimeFormat.format(adminState.draftSavedAt)}.`
  }

  if (adminState.sourceCues.length) {
    if (adminState.draftSavedAt) {
      return `Published timing loaded for ${session.recording.title}. Last saved at ${adminDraftTimeFormat.format(adminState.draftSavedAt)}.`
    }
    return `Published timing loaded for ${session.recording.title}. Last saved time unavailable. Local edits autosave in this browser.`
  }

  return `${session.recording.title} has no saved timing yet. Local edits autosave in this browser.`
}

function syncAdminCueListViewport(list: HTMLElement, followCueIndex: number) {
  const rows = Array.from(list.querySelectorAll<HTMLElement>('.admin-cue-row'))
  if (!rows.length) {
    list.style.maxHeight = ''
    lastAdminRenderedCueCount = 0
    lastAdminFollowedCueIndex = -1
    return
  }

  const visibleRows = rows.slice(0, 5)
  const listStyles = window.getComputedStyle(list)
  const rowGap = Number.parseFloat(listStyles.rowGap || listStyles.gap || '0') || 0
  const viewportHeight =
    visibleRows.reduce((height, row) => height + row.offsetHeight, 0) +
    rowGap * Math.max(visibleRows.length - 1, 0)

  list.style.maxHeight = `${Math.ceil(viewportHeight)}px`

  const shouldFollow =
    followCueIndex >= 0 &&
    followCueIndex < rows.length &&
    (followCueIndex !== lastAdminFollowedCueIndex ||
      rows.length !== lastAdminRenderedCueCount)

  if (shouldFollow) {
    const row = rows[followCueIndex]
    const rowRect = row?.getBoundingClientRect()
    const listRect = list.getBoundingClientRect()
    if (rowRect && rowRect.top < listRect.top) {
      list.scrollTop -= listRect.top - rowRect.top
    } else if (rowRect && rowRect.bottom > listRect.bottom) {
      list.scrollTop += rowRect.bottom - listRect.bottom
    }

    requestAnimationFrame(() => {
      const panel = getAdminPanel()
      if (!panel || panel.classList.contains('u-hidden')) return
      panel.scrollTop = panel.scrollHeight - panel.clientHeight
    })
    lastAdminFollowedCueIndex = followCueIndex
  }

  lastAdminRenderedCueCount = rows.length
}

function focusAdminCueRow(index: number) {
  if (index < 0) return
  const row = document.querySelector<HTMLElement>(
    `[data-target-id="admin-cue-list"] [data-admin-cue-index="${index}"]`
  )
  row?.focus({ preventScroll: true })
}

function syncAdminCueListCurrentIndex(index: number) {
  const panel = getAdminPanel()
  if (!panel || panel.classList.contains('u-hidden')) return

  const list = document.querySelector<HTMLElement>('[data-target-id="admin-cue-list"]')
  if (!list) return

  const currentRows = Array.from(
    list.querySelectorAll<HTMLElement>('.admin-cue-row.is-current')
  )
  const currentRow = list.querySelector<HTMLElement>(
    `[data-admin-cue-index="${index}"]`
  )
  if (
    currentRow?.classList.contains('is-current') &&
    currentRows.length === 1 &&
    lastAdminFollowedCueIndex === index
  ) {
    return
  }

  for (const row of currentRows) {
    if (row !== currentRow) row.classList.remove('is-current')
  }
  currentRow?.classList.add('is-current')
  syncAdminCueListViewport(list, index)
}

function renderAdminCueList(audioController?: AudioController | null) {
  const list = document.querySelector<HTMLElement>('[data-target-id="admin-cue-list"]')
  if (!list) return

  const session = getAdminSession(audioController)
  list.replaceChildren()

  const emptyState = document.createElement('div')
  emptyState.className = 'admin-cue-empty'

  if (!session) {
    list.style.maxHeight = ''
    emptyState.textContent = 'Select an aliyah to load timing.'
    list.appendChild(emptyState)
    lastAdminRenderedCueCount = 0
    lastAdminFollowedCueIndex = -1
    return
  }

  if (!adminState.cues.length) {
    list.style.maxHeight = ''
    emptyState.textContent = 'No timing saved yet. Start recording, then refine it.'
    list.appendChild(emptyState)
    lastAdminRenderedCueCount = 0
    lastAdminFollowedCueIndex = -1
    return
  }

  const selectedCueIndex = getEditableAdminCueIndex()
  const currentTime = (audioController ?? audioControllerGlobal)?.audio.currentTime ?? 0
  const playingCueIndex =
    !adminState.recording && session.cues.length && highlightControllerGlobal
      ? highlightControllerGlobal.getCueIndex(session.cues, currentTime)
      : -1

  let previousCue: WordCue | null = null
  adminState.cues.forEach((cue, index) => {
    if (!cue) return

    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'admin-cue-row'
    row.dataset.adminCueIndex = `${index}`

    if (index === selectedCueIndex) row.classList.add('is-selected')
    if (index === playingCueIndex) row.classList.add('is-current')

    const deltaText = previousCue
      ? `+${(cue.timeStart - previousCue.timeStart).toFixed(3)}s`
      : 'start'
    let noteText = ''
    if (previousCue) {
      const gap = cue.timeStart - previousCue.timeStart
      if (gap <= 0) {
        noteText = 'Out of order'
        row.classList.add('mod-invalid')
      } else if (gap > 8) {
        noteText = `Long gap ${gap.toFixed(3)}s`
        row.classList.add('mod-warning')
      }
    }

    const indexEl = document.createElement('span')
    indexEl.className = 'admin-cue-index'
    indexEl.textContent = `${index + 1}`

    const tokenEl = document.createElement('span')
    tokenEl.className = 'admin-cue-token'
    tokenEl.textContent = getAdminTokenLabel(index)

    const timeEl = document.createElement('span')
    timeEl.className = 'admin-cue-time'
    timeEl.textContent = formatCueTimestamp(cue.timeStart)

    const deltaEl = document.createElement('span')
    deltaEl.className = 'admin-cue-delta'
    deltaEl.textContent = deltaText

    row.append(indexEl, tokenEl, timeEl, deltaEl)

    if (noteText) {
      const noteEl = document.createElement('span')
      noteEl.className = 'admin-cue-note'
      noteEl.textContent = noteText
      row.append(noteEl)
    }

    row.title = `${getAdminTokenLabel(index)} at ${formatCueTimestamp(cue.timeStart)}`
    list.appendChild(row)
    if (cue) previousCue = cue
  })

  const followCueIndex = adminState.recording
    ? adminState.cues.length - 1
    : playingCueIndex >= 0
      ? playingCueIndex
      : selectedCueIndex

  syncAdminCueListViewport(list, followCueIndex)
}

function syncAdminRecordButton() {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-record"]'
  )!
  button.textContent = adminState.recording ? 'Stop Recording' : 'Record/Edit Timing'
}

async function resumeAdminDraft(
  audioController: AudioController,
  highlightController: HighlightController
) {
  const session = audioController.session
  if (!session?.tokenKeys.length || !adminState.cues.length) return

  adminState.recording = false
  const lastSavedCueIndex = Math.max(
    0,
    Math.min(adminState.cues.length - 1, session.tokenKeys.length - 1)
  )
  await selectAdminTokenIndex(lastSavedCueIndex, highlightController, {
    play: true,
  })
  focusReaderSurface()
}

function syncAdminPanelState(audioController?: AudioController | null) {
  const session = audioController?.session ?? null
  const tokenCount = session?.tokenKeys.length ?? 0
  const hasSession = Boolean(session && tokenCount)
  const hasCues = adminState.cues.length > 0
  const hasIncompleteDraft = hasSession && hasCues && adminState.cues.length < tokenCount
  const canResumeDraft = hasIncompleteDraft && !adminState.recording
  const canStepBack = hasSession && adminState.tokenPointer >= 0
  const counter = document.querySelector<HTMLElement>(
    '[data-target-id="admin-cue-count"]'
  )!
  const status = document.querySelector<HTMLElement>('[data-target-id="admin-status"]')!
  const recordButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-record"]'
  )!
  const stepBackButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-step-back"]'
  )!
  const undoButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-undo"]'
  )!
  const resetButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-reset"]'
  )!
  const exportButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-export"]'
  )!
  const prevSavedButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-prev-saved"]'
  )
  const playCurrentButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-play-current"]'
  )
  const nextSavedButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-next-saved"]'
  )
  const trimHereButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-trim-here"]'
  )
  const draftStatus = document.querySelector<HTMLElement>(
    '[data-target-id="admin-draft-status"]'
  )
  const resumeDraftWrap = document.querySelector<HTMLElement>(
    '[data-target-id="admin-resume-wrap"]'
  )
  const resumeDraftButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-resume-draft"]'
  )
  const syncNote = document.querySelector<HTMLElement>('[data-target-id="admin-sync-note"]')
  const nudgeButtons = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-admin-nudge]'),
  ]
  const selectedCueIndex = getEditableAdminCueIndex()
  const hasSelectedCue = selectedCueIndex >= 0
  const hasNextSavedCue =
    hasSelectedCue && selectedCueIndex < adminState.cues.length - 1
  const hasPreviousSavedCue = hasSelectedCue && selectedCueIndex > 0

  if (!hasSession) {
    counter.textContent = '0 Words'
    status.textContent = 'Select an aliyah and press play to start timing words.'
  } else if (adminState.recording) {
    const pointer =
      Math.max(
        1,
        Math.min(
          (adminState.tokenPointer >= 0 ? adminState.tokenPointer : adminState.cues.length) +
            1,
          tokenCount
        )
      ) || 1
    status.textContent = `${session!.recording.title}: recording Word ${pointer}. Space or Right Arrow saves the current time; Left Arrow steps back.`
    updateAdminCounter(tokenCount)
  } else if (adminState.cues.length === tokenCount && tokenCount > 0) {
    status.textContent = `${session!.recording.title}: all ${tokenCount} Words are timed. Select one to play, adjust, or export.`
    updateAdminCounter(tokenCount)
  } else {
    const pointer =
      adminState.cues.length < tokenCount
        ? Math.min(adminState.cues.length + 1, tokenCount)
        : tokenCount
    status.textContent = hasCues
      ? `${session!.recording.title}: ${adminState.cues.length}/${tokenCount} Words saved. Resume from Word ${pointer}, or select one to refine.`
      : `${session!.recording.title}: ready to time. Press Record/Edit Timing to begin.`
    updateAdminCounter(tokenCount)
  }

  recordButton.disabled = !hasSession
  stepBackButton.disabled = !canStepBack
  undoButton.disabled = !hasCues
  resetButton.disabled = !hasCues && !adminState.recording && adminState.tokenPointer < 0
  exportButton.disabled = !hasSession || !hasCues
  if (resumeDraftWrap) resumeDraftWrap.hidden = !canResumeDraft
  if (resumeDraftButton) {
    resumeDraftButton.disabled = !canResumeDraft
    resumeDraftButton.textContent = canResumeDraft
      ? `Resume Draft from Word ${adminState.cues.length}`
      : 'Resume Draft'
  }
  if (prevSavedButton) prevSavedButton.disabled = !hasPreviousSavedCue
  if (playCurrentButton) playCurrentButton.disabled = !hasSelectedCue
  if (nextSavedButton) nextSavedButton.disabled = !hasNextSavedCue
  if (trimHereButton) trimHereButton.disabled = !hasSelectedCue
  for (const button of nudgeButtons) {
    button.disabled = !hasSelectedCue
  }
  if (draftStatus) {
    draftStatus.textContent = getAdminDraftStatusText(audioController)
  }
  if (syncNote) {
    syncNote.hidden = !adminState.recording
  }
  renderAdminCueList(audioController)
  syncAdminRecordButton()
}

async function resetAdminRecorder(
  audioController: AudioController,
  highlightController: HighlightController
) {
  const session = audioController.session
  if (!session) return

  const startingCues = session.tokenKeys[0] ? [cueFromTokenKey(session.tokenKeys[0], 0)] : []
  assignAdminCues(startingCues, audioController)
  adminState.tokenPointer =
    session.tokenKeys.length > 1 ? 1 : session.tokenKeys.length ? 0 : -1
  adminState.recording = session.tokenKeys.length > 1
  cueNavigationIndex = startingCues.length ? 0 : null

  audioController.pause()
  audioController.seek(0)

  const activeTokenKey = session.tokenKeys[0] ?? null

  if (activeTokenKey) {
    await highlightController.activateTokenKey(activeTokenKey, {
      scroll: true,
    })
  } else {
    highlightController.clear()
  }

  focusReaderSurface()
  saveAdminDraft(audioController)
  await playNetworkRecording(audioController, () =>
    resetAdminRecorder(audioController, highlightController)
  )
  updateFloatingPlayer(audioController)
  syncAdminPanelState(audioControllerGlobal)
}

let audioControllerGlobal: AudioController | null = null
let highlightControllerGlobal: HighlightController | null = null

async function exportAdminCues(audioController: AudioController) {
  const session = audioController.session
  if (!session) return

  const exportCues = normalizeFirstCueStart(adminState.cues).map((cue, index) => ({
    cueNumber: index + 1,
    timeStart: cue.timeStart,
    ...(cue.timeEnd === undefined ? {} : { timeEnd: cue.timeEnd }),
    pageNumber: cue.pageNumber,
    lineIndex: cue.lineIndex,
    fragmentIndex: cue.fragmentIndex,
    wordIndex: cue.wordIndex,
  }))

  const payload: CueExportPayload = {
    audioId: session.recording.id,
    audioFormat: session.recording.format,
    narratorId: session.recording.narratorId,
    parshaSlug: session.recording.parshaSlug,
    aliyah: session.recording.aliyah,
    tokenCount: session.tokenKeys.length,
    cueCount: exportCues.length,
    tokenizationVersion: TOKENIZATION_VERSION,
    audioVersion: session.recording.notes,
    savedAt: new Date().toISOString(),
    cues: exportCues,
  }

  const modal = document.querySelector<HTMLElement>('[data-target-id="export-modal"]')!
  const status = document.querySelector<HTMLElement>(
    '[data-target-id="export-copy-status"]'
  )!
  const targetPath = document.querySelector<HTMLElement>(
    '[data-target-id="export-target-path"]'
  )!
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '[data-target-id="export-text"]'
  )!
  const downloadLink = document.querySelector<HTMLAnchorElement>(
    '[data-target-id="export-download"]'
  )!
  const exportPath = cueFileRelativePath(session.recording)
  const exportFileName = exportPath.split('/').pop() ?? 'audio-cues.json'
  const serialized = formatCueFileJson(payload)
  resetExportDownloadLink()
  exportDownloadUrl = URL.createObjectURL(
    new Blob([serialized], { type: 'application/json' })
  )
  downloadLink.href = exportDownloadUrl
  downloadLink.download = exportFileName
  targetPath.textContent = exportPath
  textarea.value = serialized
  modal.classList.remove('u-hidden')
  setTimeout(() => textarea.select(), 0)
  try {
    await navigator.clipboard.writeText(serialized)
    status.textContent = `Copied to clipboard. Paste into ${exportPath}.`
  } catch {
    status.textContent =
      `Automatic clipboard copy was blocked. Paste the JSON below into ${exportPath}.`
  }
  syncAdminPanelState(audioController)
}

function recordNextCue(
  audioController: AudioController,
  highlightController: HighlightController
) {
  const session = audioController.session
  if (!session) return

  const activeIndex = highlightController.getActiveIndex()
  const currentIndex =
    isSeededFirstCuePreview(session, activeIndex)
      ? adminState.tokenPointer
      : activeIndex >= 0
        ? Math.min(activeIndex + 1, session.tokenKeys.length - 1)
        : adminState.tokenPointer >= 0
          ? adminState.tokenPointer
        : 0
  const tokenKey = session.tokenKeys[currentIndex]
  if (!tokenKey) return

  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = tokenKey
    .split(':')
    .map(Number)
  adminState.cues[currentIndex] = {
    timeStart: Number(audioController.audio.currentTime.toFixed(3)),
    pageNumber,
    lineIndex,
    fragmentIndex,
    wordIndex,
  }
  adminState.tokenPointer = Math.min(currentIndex + 1, session.tokenKeys.length - 1)
  highlightController.activateTokenKey(tokenKey, {
    scroll: readerPreferences.autoScrollWithPlayback,
  })
  saveAdminDraft(audioController)
  updateFloatingPlayer(audioController)
  syncAdminPanelState(audioController)
}

function stepAdminBack(highlightController: HighlightController) {
  const session = audioControllerGlobal?.session
  if (!session?.tokenKeys.length) return
  const selectedCueIndex = getEditableAdminCueIndex(highlightController)
  const targetIndex =
    selectedCueIndex > 0
      ? selectedCueIndex - 1
      : adminState.tokenPointer <= 0
        ? 0
        : Math.max(0, adminState.tokenPointer - 1)
  void selectAdminTokenIndex(targetIndex, highlightController, {
    play: true,
    preservePlayback: true,
  })
}

function undoLastAdminCue(highlightController: HighlightController) {
  const session = audioControllerGlobal?.session
  adminState.cues.pop()
  adminState.tokenPointer = adminState.cues.length
    ? Math.min(adminState.cues.length, (session?.tokenKeys.length ?? 1) - 1)
    : -1
  saveAdminDraft(audioControllerGlobal)
  const tokenKey =
    audioControllerGlobal?.session?.tokenKeys[adminState.tokenPointer] ??
    audioControllerGlobal?.session?.tokenKeys[0] ??
    null
  if (tokenKey) {
    highlightController.activateTokenKey(tokenKey, {
      scroll: readerPreferences.autoScrollWithPlayback,
    })
  } else {
    highlightController.clear()
  }
  updateFloatingPlayer(audioControllerGlobal!)
  syncAdminPanelState(audioControllerGlobal)
}

function trimAdminCuesFromSelection(highlightController: HighlightController) {
  const audioController = audioControllerGlobal
  const session = audioController?.session
  if (!audioController || !session) return

  const selectedCueIndex = getEditableAdminCueIndex(highlightController)
  if (selectedCueIndex < 0) return

  assignAdminCues(adminState.cues.slice(0, selectedCueIndex), audioController)
  adminState.tokenPointer = Math.min(selectedCueIndex, session.tokenKeys.length - 1)
  adminState.recording = false
  saveAdminDraft(audioController)
  void selectAdminTokenIndex(adminState.tokenPointer, highlightController, {
    seekToCue: false,
  })
}

function nudgeAdminCue(
  deltaSeconds: number,
  highlightController: HighlightController
) {
  const audioController = audioControllerGlobal
  const session = audioController?.session
  if (!audioController || !session) return

  const selectedCueIndex = getEditableAdminCueIndex(highlightController)
  const cue = selectedCueIndex >= 0 ? adminState.cues[selectedCueIndex] : null
  if (!cue) return

  const previousTime =
    selectedCueIndex > 0 ? adminState.cues[selectedCueIndex - 1].timeStart + 0.01 : 0
  const nextTime =
    selectedCueIndex < adminState.cues.length - 1
      ? adminState.cues[selectedCueIndex + 1].timeStart - 0.01
      : Number.isFinite(audioController.audio.duration) && audioController.audio.duration > 0
        ? audioController.audio.duration
        : Number.POSITIVE_INFINITY
  const proposedTime = cue.timeStart + deltaSeconds
  const boundedTime =
    nextTime >= previousTime
      ? Math.max(previousTime, Math.min(nextTime, proposedTime))
      : proposedTime

  cue.timeStart = roundCueTime(boundedTime)
  audioController.pause()
  audioController.seek(cue.timeStart)
  cueNavigationIndex = selectedCueIndex
  saveAdminDraft(audioController)
  void highlightController.activateCue(cue, {
    scroll: readerPreferences.autoScrollWithPlayback,
  })
  updateFloatingPlayer(audioController)
  syncAdminPanelState(audioController)
}

function restoreAdminAccessState(audioController: AudioController) {
  adminState.unlocked =
    window.sessionStorage.getItem(ADMIN_SESSION_UNLOCKED_KEY) === '1'

  const shouldShowPanel =
    adminState.unlocked &&
    window.sessionStorage.getItem(ADMIN_SESSION_PANEL_OPEN_KEY) === '1'

  setAdminPanelVisible(shouldShowPanel, audioController)
}

function setupSettingsPane(audioController: AudioController) {
  const pane = document.querySelector<HTMLElement>('[data-target-id="settings-pane"]')!
  const narratorSelect = document.querySelector<HTMLSelectElement>(
    '[data-target-id="settings-narrator"]'
  )!
  const playbackRate = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-playback-rate"]'
  )!
  const highlightFill = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-highlight-fill"]'
  )!
  const highlightOpacity = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-highlight-opacity"]'
  )!
  const highlightOpacityValue = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-highlight-opacity-value"]'
  )!
  const outlineColor = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-outline-color"]'
  )!
  const outlineWidth = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-outline-width"]'
  )!
  const outlineWidthValue = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-outline-width-value"]'
  )!
  const outlineOffset = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-outline-offset"]'
  )!
  const outlineOffsetValue = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-outline-offset-value"]'
  )!
  const radius = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-radius"]'
  )!
  const radiusValue = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-radius-value"]'
  )!
  const glow = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-glow"]'
  )!
  const glowValue = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-glow-value"]'
  )!
  const autoScroll = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-auto-scroll"]'
  )!
  const disableShiftHide = document.querySelector<HTMLInputElement>(
    '[data-target-id="settings-disable-shift-hide"]'
  )!
  const themeModeButtons = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-theme-mode]'),
  ]
  const focalPointModeButtons = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-focal-point-mode]'),
  ]
  const resetHighlightButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="settings-reset-highlight"]'
  )!

  narratorSelect.innerHTML = listNarrators()
    .map(
      (narrator) =>
        `<option value="${narrator.id}">${narrator.displayName}</option>`
    )
    .join('')

  resetHighlightButton.innerHTML = iconMarkup('replay')

  const syncForm = () => {
    narratorSelect.value = readerPreferences.narratorId
    syncSettingsPlaybackRateInput()
    highlightFill.value = readerPreferences.highlightFill
    highlightOpacity.value = `${readerPreferences.highlightOpacity}`
    highlightOpacityValue.value = `${readerPreferences.highlightOpacity}`
    outlineColor.value = readerPreferences.outlineColor
    outlineWidth.value = `${readerPreferences.outlineWidth}`
    outlineWidthValue.value = `${readerPreferences.outlineWidth}`
    outlineOffset.value = `${readerPreferences.outlineOffset}`
    outlineOffsetValue.value = `${readerPreferences.outlineOffset}`
    radius.value = `${readerPreferences.radius}`
    radiusValue.value = `${readerPreferences.radius}`
    glow.value = `${readerPreferences.glow}`
    glowValue.value = `${readerPreferences.glow}`
    autoScroll.checked = readerPreferences.autoScrollWithPlayback
    disableShiftHide.checked = readerPreferences.disableShiftNekudotHide
    for (const button of themeModeButtons) {
      const isActive = button.dataset.themeMode === readerPreferences.themeMode
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', `${isActive}`)
    }
    for (const button of focalPointModeButtons) {
      const isActive =
        button.dataset.focalPointMode === readerPreferences.focalPointMode
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', `${isActive}`)
    }
    syncFloatingPlaybackRateControl(audioController)
  }

  const applyUpdates = (updates: Partial<ReaderPreferences>) => {
    const book = getBook()
    const shouldSmoothRecenter =
      updates.focalPointMode !== undefined &&
      updates.focalPointMode !== readerPreferences.focalPointMode
    const scrollTarget = shouldSmoothRecenter
      ? getReaderFocalPointScrollTarget(book)
      : null
    readerPreferences = mergeReaderPreferences(readerPreferences, updates)
    saveReaderPreferences(readerPreferences)
    applyReaderPreferences(readerPreferences)
    syncForm()
    recenterReaderFocalPoint(scrollTarget, { behavior: 'smooth' })
    refreshReaderChrome(audioController)
  }

  syncForm()

  const applyPlaybackRate = () => {
    const nextRate = Number.parseFloat(playbackRate.value)
    if (!Number.isFinite(nextRate)) return
    applyPlaybackRatePreference(audioController, nextRate)
    refreshReaderChrome(audioController)
  }

  const bindRangeValuePair = ({
    range,
    value,
    apply,
  }: {
    range: HTMLInputElement
    value: HTMLInputElement
    apply: (nextValue: number) => void
  }) => {
    const syncAndApply = (nextValue: number) => {
      if (!Number.isFinite(nextValue)) return
      range.value = `${nextValue}`
      value.value = `${nextValue}`
      apply(nextValue)
    }

    range.addEventListener('input', () =>
      syncAndApply(Number.parseFloat(range.value))
    )
    value.addEventListener('input', () =>
      syncAndApply(Number.parseFloat(value.value))
    )
    value.addEventListener('change', () =>
      syncAndApply(Number.parseFloat(value.value))
    )
  }

  narratorSelect.addEventListener('change', () =>
    applyUpdates({ narratorId: narratorSelect.value })
  )
  playbackRate.addEventListener('change', applyPlaybackRate)
  playbackRate.addEventListener('blur', applyPlaybackRate)
  highlightFill.addEventListener('input', () =>
    applyUpdates({ highlightFill: highlightFill.value })
  )
  outlineColor.addEventListener('input', () =>
    applyUpdates({ outlineColor: outlineColor.value })
  )
  bindRangeValuePair({
    range: highlightOpacity,
    value: highlightOpacityValue,
    apply: (nextValue) => applyUpdates({ highlightOpacity: nextValue }),
  })
  bindRangeValuePair({
    range: outlineWidth,
    value: outlineWidthValue,
    apply: (nextValue) => applyUpdates({ outlineWidth: nextValue }),
  })
  bindRangeValuePair({
    range: outlineOffset,
    value: outlineOffsetValue,
    apply: (nextValue) => applyUpdates({ outlineOffset: nextValue }),
  })
  bindRangeValuePair({
    range: radius,
    value: radiusValue,
    apply: (nextValue) => applyUpdates({ radius: nextValue }),
  })
  bindRangeValuePair({
    range: glow,
    value: glowValue,
    apply: (nextValue) => applyUpdates({ glow: nextValue }),
  })
  autoScroll.addEventListener('change', () =>
    applyUpdates({ autoScrollWithPlayback: autoScroll.checked })
  )
  disableShiftHide.addEventListener('change', () =>
    applyUpdates({ disableShiftNekudotHide: disableShiftHide.checked })
  )
  for (const button of themeModeButtons) {
    button.addEventListener('click', () => {
      const themeMode = button.dataset.themeMode
      if (!isThemeMode(themeMode)) return
      applyUpdates({ themeMode })
    })
  }
  for (const button of focalPointModeButtons) {
    button.addEventListener('click', () => {
      const focalPointMode = button.dataset.focalPointMode
      if (!isReaderFocalPointMode(focalPointMode)) return
      applyUpdates({ focalPointMode })
    })
  }
  resetHighlightButton.addEventListener('click', () =>
    applyUpdates(getDefaultHighlightPreferences())
  )

  const settingsToggle = document.querySelector<HTMLElement>(
    '[data-target-id="settings-toggle"]'
  )!
  const closeSettingsPane = () => pane.classList.add('u-hidden')

  settingsToggle.addEventListener('click', () => pane.classList.toggle('u-hidden'))
  document
    .querySelector('[data-target-id="settings-close"]')!
    .addEventListener('click', closeSettingsPane)
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement
    if (pane.classList.contains('u-hidden')) return
    if (target.closest('[data-target-id="settings-pane"]')) return
    if (target.closest('[data-target-id="settings-toggle"]')) return
    closeSettingsPane()
  })
}

function renderRoute(route: AppRoute, audioController: AudioController) {
  const readerShell = document.querySelector<HTMLElement>('[data-target-id="reader-shell"]')!
  const aboutView = document.querySelector<HTMLElement>('[data-target-id="about-view"]')!
  const titleEl = getTitleEl()

  if (route.view === 'about' || route.view === 'cue-analytics') {
    audioController.pause()
    setAdminPanelVisible(false, audioController)
    hideLastReadingPrompt()
    readerShell.classList.add('u-hidden')
    aboutView.classList.remove('u-hidden')
    aboutView.innerHTML = route.view === 'about' ? AboutPage() : CueAnalyticsPage()
    if (route.view === 'cue-analytics') mountCueAnalyticsPage(aboutView)
    titleEl.textContent = 'תיקון קוראים'
    syncReaderProgressVisibility()
    syncReaderSideNavigationVisibility()
    return
  }

  readerShell.classList.remove('u-hidden')
  aboutView.classList.add('u-hidden')
  aboutView.innerHTML = ''
  if (route.canonicalHash && location.hash !== route.canonicalHash) {
    history.replaceState(null, '', route.canonicalHash)
  }
  const nextReaderHash = (route.canonicalHash ?? location.hash) || lastReaderHash
  const readerRouteChanged =
    currentReaderHash !== null && currentReaderHash !== nextReaderHash
  if (readerRouteChanged) resetReaderSideNavigationState(audioController)
  if (readerRouteChanged && isShowingParshaPicker()) hideParshaPicker()
  if (readerRouteChanged) latestViewportRange = null
  currentReaderHash = nextReaderHash
  lastReaderHash = nextReaderHash
  syncReaderProgressVisibility()
  syncReaderSideNavigationVisibility()
  const rendered = app.jumpTo(route.model)
  if (shouldSaveLastReadingAfterRouteRender) {
    shouldSaveLastReadingAfterRouteRender = false
    void rendered.then(() => saveCurrentLastReading())
  }
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

document.addEventListener('DOMContentLoaded', async () => {
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

  const audioController = new AudioController(audioElement)
  audioControllerGlobal = audioController
  readerPreferences = mergeReaderPreferences(readerPreferences, {
    playbackRate: clampPlaybackRate(readerPreferences.playbackRate),
  })
  audioController.audio.playbackRate = readerPreferences.playbackRate
  const highlightController = new HighlightController(book)
  highlightControllerGlobal = highlightController
  mountAdminEditorUi()
  setupLastReadingPrompt()
  const launchLastReading =
    openedHashless && !recordingMode.enabled
      ? loadEligibleLastReading(localStorage)
      : null

  const viewportTracker = new ViewportTracker(book)
  viewportTrackerGlobal = viewportTracker
  const topBarModel = new TopBarTracker()
  const titleEl = getTitleEl()

  setControlIcon(document.querySelector('[data-target-id="floating-prev"]'), 'previous')
  setControlIcon(document.querySelector('[data-target-id="floating-play"]'), 'play')
  setControlIcon(document.querySelector('[data-target-id="floating-next"]'), 'next')
  setControlIcon(document.querySelector('[data-target-id="floating-replay"]'), 'replay')
  setControlIcon(document.querySelector('[data-target-id="floating-expand-toggle"]'), 'expand')
  setControlIcon(document.querySelector('[data-target-id="floating-download"]'), 'download')
  setControlIcon(document.querySelector('[data-target-id="floating-video-download"]'), 'download')
  setControlIcon(document.querySelector('[data-target-id="settings-toggle"]'), 'settings2')
  updateFloatingPlayer(audioController)
  setupOfflineRecordingPrompt()
  setupDebugControls()

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

  InfiniteScroller.new({
    container: book,
    fetchPreviousContent: {
      fetch: () => display.viewModel.fetchPreviousPage(),
      render: (entry) => display.renderPrevious(entry),
    },
    fetchNextContent: {
      fetch: () => display.viewModel.fetchNextPage(),
      render: (entry) => display.renderNext(entry),
    },
  }).attach()

  const saveLastReadingDebounced = debounce(() => saveCurrentLastReading(), 1000)

  const markUserScrolledReaderForLastReading = () => {
    hasUserScrolledReaderForLastReading = true
    dismissLastReadingPrompt()
  }

  book.addEventListener('wheel', markUserScrolledReaderForLastReading, {
    passive: true,
  })
  book.addEventListener('touchstart', markUserScrolledReaderForLastReading, {
    passive: true,
  })
  book.addEventListener(
    'keydown',
    whenKey('ArrowDown', markUserScrolledReaderForLastReading)
  )
  book.addEventListener(
    'keydown',
    whenKey('ArrowUp', markUserScrolledReaderForLastReading)
  )
  book.addEventListener(
    'keydown',
    whenKey('PageDown', markUserScrolledReaderForLastReading)
  )
  book.addEventListener(
    'keydown',
    whenKey('PageUp', markUserScrolledReaderForLastReading)
  )

  book.addEventListener('scroll', () => {
    if (!progressFrame) {
      progressFrame = requestAnimationFrame(() => {
        progressFrame = 0
        updateReaderProgress()
      })
    }
    if (hasUserScrolledReaderForLastReading) saveLastReadingDebounced()
  })

  book.addEventListener('page-rendered', (event) => {
    const renderedPage = event instanceof CustomEvent ? event.detail?.node : null
    applyRecordingModePageLabels(renderedPage instanceof Element ? renderedPage : book)
    refreshReaderChrome(audioController)
    scheduleDeferredProgressRefresh()
    syncCurrentSessionHighlight(audioController, highlightController)
  })

  book.addEventListener('click', async (event) => {
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
    const cue = audioController.session.cues.find((candidate) => cueKey(candidate) === tokenKey)
    const isPlaying = !audioController.audio.paused
    if (
      adminState.unlocked &&
      isAdminPanelVisible() &&
      !adminState.recording &&
      tokenIndex >= 0
    ) {
      event.preventDefault()
      await selectAdminTokenIndex(tokenIndex, highlightController, {
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
      cueNavigationIndex = audioController.session.cues.indexOf(cue)
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
  })

  audioController.on('playback-updated', () => {
    updateFloatingPlayer(audioController)
    refreshInlineAudioButtons(audioController)
    syncAdminPanelState(audioController)
  })
  audioController.on('session-loaded', (session) => {
    cueNavigationIndex = session.cues.length ? 0 : null
    highlightController.setSequence(session.tokenKeys)
    updateFloatingPlayer(audioController)
    refreshInlineAudioButtons(audioController)
    syncAdminPanelState(audioController)
  })
  audioController.on('time-updated', () => {
    updateFloatingPlayerAudioProgress(audioController)
    updateFloatingPlayerMeta(audioController)
    const adminPanel = document.querySelector<HTMLElement>(
      '[data-target-id="admin-panel"]'
    )
    if (adminPanel && !adminPanel.classList.contains('u-hidden')) {
      renderAdminCueList(audioController)
    }
  })
  audioController.on('frame-updated', ({ currentTime }) => {
    if (adminState.recording) return
    const session = audioController.session
    if (!session?.cues.length) return

    const cueIndex = highlightController.getCueIndex(session.cues, currentTime)
    if (cueIndex < 0) return

    cueNavigationIndex = cueIndex
    const cue = session.cues[cueIndex]
    syncAdminCueListCurrentIndex(cueIndex)
    updateFloatingPlayerCueProgress(audioController, cueIndex)
    if (highlightController.getActiveTokenKey() === cueKey(cue)) return

    void highlightController.activateCue(cue, {
      scroll: readerPreferences.autoScrollWithPlayback,
    })
  })
  for (const eventName of ['loadedmetadata', 'durationchange', 'emptied'] as const) {
    audioElement.addEventListener(eventName, () => {
      updateFloatingPlayerAudioProgress(audioController)
      updateFloatingPlayerMeta(audioController)
    })
  }
  audioElement.addEventListener('error', () => {
    if (navigator.onLine || !audioController.session) return
    showOfflinePrompt({ force: true })
    setPendingNetworkRecordingRetry(async () => {
      audioElement.load()
      await playNetworkRecording(audioController)
    })
  })

  document
    .querySelector('[data-target-id="floating-play"]')!
    .addEventListener('click', async () => {
      await toggleCurrentRecordingPlayback(audioController, async () => {
        await playNetworkRecording(audioController)
      })
      saveCurrentLastReading()
      focusReaderSurface()
    })
  document
    .querySelector('[data-target-id="floating-mobile-toggle"]')!
    .addEventListener('click', async () => {
      await toggleCurrentRecordingPlayback(audioController, async () => {
        await playNetworkRecording(audioController)
      })
      saveCurrentLastReading()
      focusReaderSurface()
    })
  document
    .querySelector('[data-target-id="floating-prev"]')!
    .addEventListener('click', () => {
      stepPlayback(-1, audioController, highlightController)
      saveCurrentLastReading()
      focusReaderSurface()
    })
  document
    .querySelector('[data-target-id="floating-next"]')!
    .addEventListener('click', () => {
      stepPlayback(1, audioController, highlightController)
      saveCurrentLastReading()
      focusReaderSurface()
    })
  document
    .querySelector('[data-target-id="floating-replay"]')!
    .addEventListener('click', async () => {
      await replayAliyahFromStart(audioController, highlightController)
      saveCurrentLastReading()
      focusReaderSurface()
    })
  const speedToggle = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-speed-toggle"]'
  )!
  const speedPopover = document.querySelector<HTMLElement>(
    '[data-target-id="floating-speed-popover"]'
  )!
  const speedSlider = document.querySelector<HTMLInputElement>(
    '[data-target-id="floating-speed-slider"]'
  )!
  const closeSpeedPopover = () => {
    speedPopover.classList.add('u-hidden')
    speedToggle.setAttribute('aria-expanded', 'false')
  }
  speedToggle.addEventListener('click', () => {
    const isOpening = speedPopover.classList.contains('u-hidden')
    speedPopover.classList.toggle('u-hidden', !isOpening)
    speedToggle.setAttribute('aria-expanded', `${isOpening}`)
    syncFloatingPlaybackRateControl(audioController)
    if (isOpening) speedSlider.focus({ preventScroll: true })
  })
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement
    if (speedPopover.classList.contains('u-hidden')) return
    if (target.closest('.floating-speed-control')) return
    closeSpeedPopover()
  })
  speedSlider.addEventListener('input', () => {
    applyPlaybackRatePreference(audioController, Number.parseFloat(speedSlider.value), {
      snap: true,
    })
  })
  speedSlider.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    speedSlider.setPointerCapture(event.pointerId)
    applyPlaybackRatePreference(
      audioController,
      playbackRateFromSliderPointer(speedSlider, event.clientX),
      { snap: true }
    )
  })
  speedSlider.addEventListener('pointermove', (event) => {
    if (!speedSlider.hasPointerCapture(event.pointerId)) return
    applyPlaybackRatePreference(
      audioController,
      playbackRateFromSliderPointer(speedSlider, event.clientX),
      { snap: true }
    )
  })
  speedSlider.addEventListener('pointerup', (event) => {
    if (speedSlider.hasPointerCapture(event.pointerId)) {
      speedSlider.releasePointerCapture(event.pointerId)
    }
    applyPlaybackRatePreference(
      audioController,
      playbackRateFromSliderPointer(speedSlider, event.clientX),
      { snap: true }
    )
  })
  speedSlider.addEventListener('pointercancel', (event) => {
    if (speedSlider.hasPointerCapture(event.pointerId)) {
      speedSlider.releasePointerCapture(event.pointerId)
    }
  })
  speedSlider.addEventListener('change', () => {
    applyPlaybackRatePreference(audioController, Number.parseFloat(speedSlider.value), {
      snap: true,
    })
  })
  document
    .querySelector('[data-target-id="toolbar-current-aliyah-audio"]')!
    .addEventListener('click', async () => {
      const button = getToolbarCurrentAliyahButton()
      if (!button) return
      await startPlaybackForToolbarCurrentAliyah(
        button,
        audioController,
        highlightController
      )
      focusReaderSurface()
    })
  document
    .querySelector('[data-target-id="floating-expand-toggle"]')!
    .addEventListener('click', () => {
      if (!audioController.session) return
      if (!floatingPlayerDesktopMediaQuery.matches) return

      setFloatingPlayerExpanded(!floatingPlayerExpanded)
      focusReaderSurface()
    })

  floatingPlayerDesktopMediaQuery.addEventListener('change', () => {
    if (!floatingPlayerDesktopMediaQuery.matches) {
      setFloatingPlayerExpanded(false)
      return
    }

    setFloatingPlayerExpanded(floatingPlayerExpanded)
  })

  toggle.addEventListener('change', () =>
    toggleAnnotations(() => !toggle.checked)
  )

  document.addEventListener(
    'keydown',
    whenKey('Shift', () => {
      if (readerPreferences.disableShiftNekudotHide) return
      toggleAnnotations(() => toggle.checked)
    })
  )
  document.addEventListener(
    'keyup',
    whenKey('Shift', () => {
      if (readerPreferences.disableShiftNekudotHide) return
      toggleAnnotations(() => toggle.checked)
    })
  )

  titleEl.addEventListener('click', toggleParshaPicker)
  document.addEventListener('keydown', whenKey('/', toggleParshaPicker))

  document.addEventListener(
    'keydown',
    whenKey('Escape', (e) => {
      if (isShowingParshaPicker()) {
        e.preventDefault()
        hideParshaPicker()
      }
      document
        .querySelector<HTMLElement>('[data-target-id="settings-pane"]')!
        .classList.add('u-hidden')
      document
        .querySelector<HTMLElement>('[data-target-id="floating-speed-popover"]')
        ?.classList.add('u-hidden')
      document
        .querySelector<HTMLButtonElement>('[data-target-id="floating-speed-toggle"]')
        ?.setAttribute('aria-expanded', 'false')
      hideExportModal()
    })
  )

  document
    .querySelector('[data-target-id="about-link"]')!
    .addEventListener('click', () => {
      toggleAboutRoute(audioController)
    })

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
  })

  document
    .querySelector('[data-target-id="export-close"]')!
    .addEventListener('click', hideExportModal)

  document
    .querySelector('[data-target-id="admin-close"]')!
    .addEventListener('click', () => closeAdminMode(audioController))

  document
    .querySelector('[data-target-id="admin-record"]')!
    .addEventListener('click', async () => {
      if (!adminState.recording && !adminState.cues.length) {
        await resetAdminRecorder(audioController, highlightController)
        return
      }

      adminState.recording = !adminState.recording
      const resumeDraftWrap = document.querySelector<HTMLElement>(
        '[data-target-id="admin-resume-wrap"]'
      )
      if (adminState.recording && adminState.tokenPointer < 0) {
        const activeIndex = Math.max(highlightController.getActiveIndex(), 0)
        adminState.tokenPointer = Math.min(activeIndex, adminState.cues.length)
      } else if (!adminState.recording) {
        audioController.pause()
        updateFloatingPlayer(audioController)
      }
      if (resumeDraftWrap) {
        resumeDraftWrap.hidden = adminState.recording
      }
      syncAdminPanelState(audioController)
    })
  document
    .querySelector('[data-target-id="admin-step-back"]')!
    .addEventListener('click', () => stepAdminBack(highlightController))
  document
    .querySelector('[data-target-id="admin-undo"]')!
    .addEventListener('click', () => undoLastAdminCue(highlightController))
  document
    .querySelector('[data-target-id="admin-reset"]')!
    .addEventListener('click', () =>
      resetAdminRecorder(audioController, highlightController)
    )
  document
    .querySelector('[data-target-id="admin-resume-draft"]')!
    .addEventListener('click', () => void resumeAdminDraft(audioController, highlightController))
  document
    .querySelector('[data-target-id="admin-export"]')!
    .addEventListener('click', () => void exportAdminCues(audioController))
  document
    .querySelector('[data-target-id="admin-prev-saved"]')!
    .addEventListener('click', () => {
      const selectedCueIndex = getEditableAdminCueIndex(highlightController)
      if (selectedCueIndex <= 0) return
      void selectAdminTokenIndex(selectedCueIndex - 1, highlightController)
    })
  document
    .querySelector('[data-target-id="admin-play-current"]')!
    .addEventListener('click', () => {
      const selectedCueIndex = getEditableAdminCueIndex(highlightController)
      if (selectedCueIndex < 0) return
      void selectAdminTokenIndex(selectedCueIndex, highlightController, {
        play: true,
      })
    })
  document
    .querySelector('[data-target-id="admin-next-saved"]')!
    .addEventListener('click', () => {
      const selectedCueIndex = getEditableAdminCueIndex(highlightController)
      if (selectedCueIndex < 0 || selectedCueIndex >= adminState.cues.length - 1)
        return
      void selectAdminTokenIndex(selectedCueIndex + 1, highlightController)
    })
  document
    .querySelector('[data-target-id="admin-trim-here"]')!
    .addEventListener('click', () => trimAdminCuesFromSelection(highlightController))
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-admin-nudge]')) {
    button.addEventListener('click', () =>
      nudgeAdminCue(Number(button.dataset.adminNudge), highlightController)
    )
  }
  document
    .querySelector('[data-target-id="admin-cue-list"]')!
    .addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-admin-cue-index]'
      )
      if (!row) return
      const cueIndex = Number(row.dataset.adminCueIndex)
      if (!Number.isFinite(cueIndex)) return
      void selectAdminTokenIndex(cueIndex, highlightController)
    })

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      if (!adminState.unlocked) {
        const provided = window.prompt('Admin password')
        if (!provided || !verifyAdminPassword(provided)) return
        adminState.unlocked = true
      }
      const isHidden = getAdminPanel()?.classList.contains('u-hidden') ?? true
      setAdminPanelVisible(isHidden, audioController)
      return
    }

    if (isEditableTarget(event.target)) return

    if (adminState.unlocked && audioController.session && adminState.recording) {
      if (event.code === 'Space') {
        event.preventDefault()
        recordNextCue(audioController, highlightController)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        recordNextCue(audioController, highlightController)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        stepAdminBack(highlightController)
        return
      }
    }

    if (parseCurrentRoute()?.view !== 'reader' || !audioController.session) return

    if (event.code === 'Space') {
      event.preventDefault()
      void toggleCurrentRecordingPlayback(audioController, async () => {
        await playNetworkRecording(audioController)
      })
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      stepPlayback(1, audioController, highlightController)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      stepPlayback(-1, audioController, highlightController)
    }
  })

  if (recordingMode.enabled) {
    window.tikkunRecorder = {
      ready: async () => {
        await display?.rendered
        await display?.scrolled
      },
      loadAudio: (audioId: string) =>
        loadRecordingSessionByAudioId(audioId, audioController, highlightController),
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
        await syncCurrentSessionHighlight(audioController, highlightController)
        await waitForAnimationFrame()

        return {
          audioId: session.recording.id,
          currentTime: audioController.audio.currentTime,
          duration: audioController.audio.duration,
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
            await syncCurrentSessionHighlight(audioController, highlightController)
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
          currentTime: audioController.audio.currentTime,
          duration: audioController.audio.duration,
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
          currentTime: audioController.audio.currentTime,
          duration: audioController.audio.duration,
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
        duration: audioController.audio.duration,
        currentTime: audioController.audio.currentTime,
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
  }

  setupSettingsPane(audioController)
  restoreAdminAccessState(audioController)
  syncAdminPanelState(audioController)

  listenForRevealGesture(book)
  setAppHeight()

  let pendingResizeScrollTarget: HTMLElement | null = null
  let resizeRecenterFrame = 0
  const handleReaderViewportResize = () => {
    pendingResizeScrollTarget ??= getReaderFocalPointScrollTarget(book)
    setAppHeight()
    if (resizeRecenterFrame) return

    resizeRecenterFrame = requestAnimationFrame(() => {
      resizeRecenterFrame = 0
      const scrollTarget = pendingResizeScrollTarget
      pendingResizeScrollTarget = null
      recenterReaderFocalPoint(scrollTarget)
    })
  }

  window.addEventListener('resize', handleReaderViewportResize)
  window.visualViewport?.addEventListener('resize', handleReaderViewportResize)

  window.addEventListener('hashchange', () => {
    const route = parseCurrentRoute()
    if (!route) return
    renderRoute(route, audioController)
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
