import InfiniteScroller from './infinite-scroller.ts'
import ParshaPicker from './components/ParshaPicker.ts'
import utils from './components/utils.ts'
import { ScrollViewModel } from './view-model/scroll-view-model.ts'
import { LeiningGenerator } from './calendar-model/generator.ts'
import { ScrollDisplay } from './components/ScrollDisplay.ts'
import { ViewportTracker } from './viewport-tracker.ts'
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
  defaultHighlightPreferences,
  defaultReaderPreferences,
  loadReaderPreferences,
  mergeReaderPreferences,
  ReaderPreferences,
  saveReaderPreferences,
  TOKENIZATION_VERSION,
  ThemeMode,
} from './reader-preferences.ts'
import {
  findRecordingForRun,
  getCuesForRecording,
  getCueSavedAtForRecording,
  listNarrators,
} from './audio/library.ts'
import { cueFileRelativePath, formatCueFileJson } from './audio/cue-file.ts'
import { normalizeFirstCueStart } from './audio/normalize-first-cue.ts'
import { AudioController, ActiveAudioSession } from './reading/audio-controller.ts'
import { HighlightController, cueKey } from './reading/highlight-controller.ts'
import { adjustStartingLineTokens } from './reading/aliyah-token-sequence.ts'
import type { CueExportPayload, WordCue } from './audio/types.ts'
import { verifyAdminPassword } from './admin/access.ts'
import {
  getAdminDraftStorageKey,
  loadAdminDraft,
  type AdminDraftPayload,
} from './admin/draft-storage.ts'
import hebrewNumeral from './hebrew-numeral.ts'

const { whenKey } = utils

const generator = new LeiningGenerator({
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
})

let display: ScrollDisplay
let readerPreferences: ReaderPreferences = { ...defaultReaderPreferences }
let lastReaderHash = '#/next'
let progressFrame = 0
let deferredProgressFrame = 0
let progressAnchorLoadPromise: Promise<void> | null = null
let cueNavigationIndex: number | null = null
let lastAdminRenderedCueCount = 0
let lastAdminFollowedCueIndex = -1
const ADMIN_SESSION_UNLOCKED_KEY = 'tikkun-admin-unlocked'
const ADMIN_SESSION_PANEL_OPEN_KEY = 'tikkun-admin-panel-open'
const adminDraftTimeFormat = Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

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

    display.rendered.then(() => {
      hideParshaPicker()
      refreshReaderChrome()
      if (audioControllerGlobal && highlightControllerGlobal)
        syncCurrentSessionHighlight(audioControllerGlobal, highlightControllerGlobal)
    })
  },
}

const setVisibility = ({
  selector,
  visible,
}: {
  selector: string
  visible: boolean
}) => {
  const node = document.querySelector<HTMLElement>(selector)
  if (!node) return
  node.classList.toggle('u-hidden', !visible)
  node.classList.toggle('mod-animated', !visible)
}

const getAdminPanel = () =>
  document.querySelector<HTMLElement>('[data-target-id="admin-panel"]')

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

const syncReaderProgressVisibility = () => {
  const visible =
    parseCurrentRoute()?.view === 'reader' && !isShowingParshaPicker()

  ;[
    '[data-target-id="reader-progress"]',
    '[data-target-id="reader-progress-mobile"]',
  ].forEach((selector) => setVisibility({ selector, visible }))
}

const showParshaPicker = () => {
  setAdminPanelVisible(false, audioControllerGlobal)
  ;[
    { selector: '[data-test-id="annotations-toggle"]', visible: false },
    { selector: '[data-target-id="settings-toggle"]', visible: false },
    { selector: '[data-target-id="about-link"]', visible: false },
    { selector: '[data-target-id="tikkun-book"]', visible: false },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  const jumper = ParshaPicker(generator)

  document.querySelector('[data-target-id="reader-shell"]')!.appendChild(jumper.node)

  jumper.onMount()
  syncReaderProgressVisibility()
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
}

const isShowingParshaPicker = () =>
  Boolean(document.querySelector('.parsha-picker'))

const toggleParshaPicker = () => {
  if (parseCurrentRoute()?.view !== 'reader') {
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

const scrollState: { lastScrolledPosition: number; pageAtTop: HTMLElement | null } =
  {
    lastScrolledPosition: 0,
    pageAtTop: null,
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

function rememberLastScrolledPosition() {
  const book = document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')
  if (!book) return
  const bookBoundingRect = book.getBoundingClientRect()

  const topOfBookRelativeToViewport = {
    x: bookBoundingRect.left + bookBoundingRect.width / 2,
    y: bookBoundingRect.top,
  }

  const pageAtTop = [
    ...(document.elementsFromPoint(
      topOfBookRelativeToViewport.x,
      topOfBookRelativeToViewport.y
    ) as HTMLElement[]),
  ].find((el) => el.className.includes('tikkun-page'))

  if (!pageAtTop) return

  scrollState.pageAtTop = pageAtTop
  scrollState.lastScrolledPosition =
    (book.scrollTop - pageAtTop.offsetTop) / pageAtTop.clientHeight
}

function resumeLastScrollPosition() {
  if (!scrollState.pageAtTop) return
  const book = document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')
  if (!book) return
  const pageRect = scrollState.pageAtTop.getBoundingClientRect()

  book.scrollTop =
    scrollState.pageAtTop.offsetTop +
    scrollState.lastScrolledPosition * pageRect.height
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
  return parseUrl(generator, location.hash.replace(/^#/, ''))
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

function getAliyahMarkerElements() {
  return [
    ...document.querySelectorAll<HTMLElement>('[data-aliyah-marker="true"]'),
  ]
}

function setControlIcon(element: HTMLElement | null, icon: IconName) {
  if (!element) return
  element.innerHTML = iconMarkup(icon)
}

function getAliyahProgressAnchors() {
  const book = getBook()
  const bookRect = book.getBoundingClientRect()

  return [...book.querySelectorAll<HTMLElement>('[data-line-index][data-aliyah-starts]')]
    .map((line) => {
      const rect = line.getBoundingClientRect()
      const label = line.querySelector('.aliyah-label-text')?.textContent?.trim() ?? '—'
      const aliyahStarts = (line.dataset.aliyahStarts ?? '').split(',')
      const progressLabel = aliyahStarts.includes('1') ? 'ראשון' : label
      return {
        line,
        label: progressLabel,
        center:
          book.scrollTop + (rect.top - bookRect.top) + rect.height / 2,
      }
    })
    .sort((a, b) => a.center - b.center)
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
  const aliyahIndex = Number(button.dataset.aliyahIndex)
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

async function collectAliyahTokenKeys({
  runId,
  aliyahIndex,
}: {
  runId: string
  aliyahIndex: number
}) {
  let marker = document.querySelector<HTMLElement>(
    `[data-aliyah-marker="true"][data-run-id="${runId}"][data-aliyah-index="${aliyahIndex}"]`
  )
  if (!marker) return []

  let markers = getAliyahMarkerElements()
  let markerIndex = markers.indexOf(marker)
  let nextMarker = markers[markerIndex + 1] ?? null

  while (!nextMarker) {
    const renderedPages = display.getRenderedPageNumbers()
    const lastPage = renderedPages[renderedPages.length - 1]
    const loaded = await display.ensurePageRendered(lastPage + 1)
    if (!loaded) break
    markers = getAliyahMarkerElements()
    marker = document.querySelector<HTMLElement>(
      `[data-aliyah-marker="true"][data-run-id="${runId}"][data-aliyah-index="${aliyahIndex}"]`
    )
    if (!marker) break
    markerIndex = markers.indexOf(marker)
    nextMarker = markers[markerIndex + 1] ?? null
  }

  if (!marker) return []

  const lines = [...getBook().querySelectorAll<HTMLElement>('[data-line-index]')]
  const startLine = marker.closest<HTMLElement>('[data-line-index]')
  const endLine = nextMarker?.closest<HTMLElement>('[data-line-index]') ?? null
  const startIndex = startLine ? lines.indexOf(startLine) : -1
  const endIndex = endLine ? lines.indexOf(endLine) : lines.length
  if (startIndex < 0) return []

  return lines
    .slice(startIndex, endIndex)
    .flatMap((line, index) => {
      const currentLineWords = [
        ...line.querySelectorAll<HTMLElement>('.fragment.mod-annotations-on .word'),
      ]
      if (index !== 0) return currentLineWords

      const previousLineWords =
        startIndex > 0
          ? [
              ...lines[startIndex - 1].querySelectorAll<HTMLElement>(
                '.fragment.mod-annotations-on .word'
              ),
            ]
          : []

      return adjustStartingLineTokens({
        currentLineWords,
        previousLineWords,
      })
    })
    .map((word) => word.dataset.tokenKey)
    .filter((key): key is string => Boolean(key))
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
  const nextButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-next"]'
  )!
  const replayButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="floating-replay"]'
  )!
  const downloadLink = document.querySelector<HTMLAnchorElement>(
    '[data-target-id="floating-download"]'
  )!
  const activeSession = audioController.session

  player.classList.toggle('u-hidden', !activeSession)
  cornerControls?.classList.toggle('mod-raised', Boolean(activeSession))
  setControlIcon(playButton, audioController.audio.paused ? 'play' : 'pause')
  for (const button of [prevButton, playButton, nextButton, replayButton]) {
    button.disabled = !activeSession
  }
  downloadLink.setAttribute('aria-disabled', activeSession ? 'false' : 'true')
  downloadLink.tabIndex = activeSession ? 0 : -1

  if (activeSession) {
    downloadLink.href = activeSession.recording.downloadSrc
    downloadLink.download = `${activeSession.recording.id}.${activeSession.recording.format}`
  } else {
    downloadLink.href = '#'
    downloadLink.removeAttribute('download')
  }

  updateFloatingPlayerAudioProgress(audioController)
  updateFloatingPlayerMeta(audioController)
}

function updateFloatingPlayerAudioProgress(audioController: AudioController) {
  const player = document.querySelector<HTMLElement>('[data-target-id="floating-player"]')
  if (!player) return

  const { currentTime, duration } = audioController.audio
  const progress =
    audioController.session && Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(1, currentTime / duration))
      : 0

  player.style.setProperty('--audio-progress-ratio', `${progress}`)
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
  const session = audioController.session

  if (!parsha || !aliyah || !cues || !duration) return

  if (!session) {
    parsha.textContent = '—'
    aliyah.textContent = '—'
    cues.textContent = '0/0'
    duration.textContent = '0:00/0:00'
    return
  }

  const cueIndex = getCurrentCueIndex(session, audioController.audio.currentTime)
  const currentCue = session.cues.length ? Math.max(cueIndex + 1, 1) : 0

  parsha.textContent = session.recording.parshaName
  aliyah.textContent = hebrewNumeral(session.recording.aliyah)
  cues.textContent = `${currentCue}/${session.cues.length}`
  duration.textContent = `${formatDuration(audioController.audio.currentTime)}/${formatDuration(
    audioController.audio.duration
  )}`
}

async function startPlaybackForButton(
  button: HTMLButtonElement,
  audioController: AudioController,
  highlightController: HighlightController
) {
  const state = getSessionButtonState(button)
  if (!state?.recording || !state.lineInfo.run) return

  if (audioController.session?.recording.id === state.recording.id) {
    await audioController.togglePlayback()
    updateFloatingPlayer(audioController)
    return
  }

  const tokenKeys = await collectAliyahTokenKeys({
    runId: state.lineInfo.run.id,
    aliyahIndex: state.aliyahIndex,
  })

  const session: ActiveAudioSession = {
    recording: state.recording,
    cues: cloneCues(getCuesForRecording(state.recording)),
    runId: state.lineInfo.run.id,
    aliyahIndex: state.aliyahIndex,
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

  if (session.cues.length) {
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
  await audioController.play()
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

  if (session.cues.length) {
    cueNavigationIndex = 0
    await highlightController.activateCue(session.cues[0], { scroll: true })
  } else if (session.tokenKeys[0]) {
    await highlightController.activateTokenKey(session.tokenKeys[0], {
      scroll: true,
    })
  }

  if (restartAudio) {
    await audioController.replayFromStart()
  }
}

function updateReaderProgress() {
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
    return
  }

  const viewportCenter = book.scrollTop + book.clientHeight / 2

  let currentIndex = 0
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i].center <= viewportCenter) currentIndex = i
    else break
  }

  const current = anchors[currentIndex]
  const next = anchors[currentIndex + 1]
  label.textContent = current?.label ?? '—'

  if (!current || !next) {
    if (current) {
      void ensureNextProgressAnchorLoaded(currentIndex).then(() =>
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
      (viewportCenter - current.center) / (next.center - current.center)
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
  counter.textContent = `${adminState.cues.length} / ${tokenCount} cues · ${pointer}`
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
        <button type="button" class="toolbar-button" data-admin-nudge="-0.25">-250ms</button>
        <button type="button" class="toolbar-button" data-admin-nudge="-0.05">-50ms</button>
        <button type="button" class="toolbar-button" data-admin-nudge="0.05">+50ms</button>
        <button type="button" class="toolbar-button" data-admin-nudge="0.25">+250ms</button>
      </div>
      <div class="admin-cue-list" data-target-id="admin-cue-list"></div>
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
    seekToCue = true,
  }: { play?: boolean; seekToCue?: boolean } = {}
) {
  const audioController = audioControllerGlobal
  const session = audioController?.session
  if (!audioController || !session?.tokenKeys.length) return

  const clampedIndex = Math.max(0, Math.min(index, session.tokenKeys.length - 1))
  adminState.tokenPointer = clampedIndex

  const cue = adminState.cues[clampedIndex]
  if (seekToCue && cue) {
    audioController.pause()
    audioController.seek(cue.timeStart)
    cueNavigationIndex = clampedIndex
  } else if (!play) {
    audioController.pause()
  }

  await highlightController.activateTokenKey(session.tokenKeys[clampedIndex], {
    scroll: readerPreferences.autoScrollWithPlayback,
  })

  if (play && cue) {
    await audioController.play()
  }

  updateFloatingPlayer(audioController)
  syncAdminPanelState(audioController)
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

  if (!cue) return `Cue ${index + 1}`

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
      return `Published cues loaded for ${session.recording.title}. Last saved at ${adminDraftTimeFormat.format(adminState.draftSavedAt)}.`
    }
    return `Published cues loaded for ${session.recording.title}. Last saved time unavailable in cue JSON. Local edits autosave in this browser.`
  }

  return `${session.recording.title} has no saved cues yet. Local edits autosave in this browser.`
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
    rows[followCueIndex]?.scrollIntoView({
      block: 'nearest',
    })
    lastAdminFollowedCueIndex = followCueIndex
  }

  lastAdminRenderedCueCount = rows.length
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
    emptyState.textContent = 'Select an aliyah to load cues.'
    list.appendChild(emptyState)
    lastAdminRenderedCueCount = 0
    lastAdminFollowedCueIndex = -1
    return
  }

  if (!adminState.cues.length) {
    list.style.maxHeight = ''
    emptyState.textContent = 'No cues saved yet. Start recording, then use the timing controls to refine.'
    list.appendChild(emptyState)
    lastAdminRenderedCueCount = 0
    lastAdminFollowedCueIndex = -1
    return
  }

  const selectedCueIndex = getEditableAdminCueIndex()
  const currentTime = (audioController ?? audioControllerGlobal)?.audio.currentTime ?? 0
  const playingCueIndex =
    session.cues.length && highlightControllerGlobal
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
  button.textContent = adminState.recording ? 'Stop Recording' : 'Record/Edit Cues'
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
    counter.textContent = '0 cues'
    status.textContent = 'Select an aliyah and press play to start cue authoring.'
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
    status.textContent = `${session!.recording.title}: recording live on token ${pointer}. Space or Right Arrow stamps the current cue; Left Arrow steps back.`
    updateAdminCounter(tokenCount)
  } else if (adminState.cues.length === tokenCount && tokenCount > 0) {
    status.textContent = `${session!.recording.title}: all ${tokenCount} tokens have cues. Select a saved cue to audition or nudge, or export when ready.`
    updateAdminCounter(tokenCount)
  } else {
    const pointer =
      adminState.cues.length < tokenCount
        ? Math.min(adminState.cues.length + 1, tokenCount)
        : tokenCount
    status.textContent = hasCues
      ? `${session!.recording.title}: ${adminState.cues.length}/${tokenCount} cues saved. Resume from token ${pointer}, or select a saved cue to refine it.`
      : `${session!.recording.title}: ready to author. Press Record/Edit Cues to begin.`
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
      ? `Resume Draft from cue ${adminState.cues.length}`
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
  await audioController.play()
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
  const exportPath = cueFileRelativePath(session.recording)
  const serialized = formatCueFileJson(payload)
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
  const targetIndex =
    adminState.tokenPointer <= 0 ? 0 : Math.max(0, adminState.tokenPointer - 1)
  void selectAdminTokenIndex(targetIndex, highlightController)
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
    playbackRate.value = `${Number(readerPreferences.playbackRate.toFixed(2))}`
    highlightFill.value = readerPreferences.highlightFill
    highlightOpacity.value = `${readerPreferences.highlightOpacity}`
    highlightOpacityValue.value = `${readerPreferences.highlightOpacity}`
    outlineColor.value = readerPreferences.outlineColor
    outlineWidth.value = `${readerPreferences.outlineWidth}`
    outlineWidthValue.value = `${readerPreferences.outlineWidth}`
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
    audioController.audio.playbackRate = readerPreferences.playbackRate
  }

  const applyUpdates = (updates: Partial<ReaderPreferences>) => {
    readerPreferences = mergeReaderPreferences(readerPreferences, updates)
    saveReaderPreferences(readerPreferences)
    applyReaderPreferences(readerPreferences)
    syncForm()
    refreshReaderChrome(audioController)
  }

  syncForm()

  const applyPlaybackRate = () => {
    const nextRate = Number.parseFloat(playbackRate.value)
    if (!Number.isFinite(nextRate)) return
    applyUpdates({ playbackRate: nextRate })
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
      const themeMode = button.dataset.themeMode as ThemeMode | undefined
      if (!themeMode) return
      applyUpdates({ themeMode })
    })
  }
  resetHighlightButton.addEventListener('click', () =>
    applyUpdates({ ...defaultHighlightPreferences })
  )

  document
    .querySelector('[data-target-id="settings-toggle"]')!
    .addEventListener('click', () => pane.classList.toggle('u-hidden'))
  document
    .querySelector('[data-target-id="settings-close"]')!
    .addEventListener('click', () => pane.classList.add('u-hidden'))
}

function renderRoute(route: AppRoute, audioController: AudioController) {
  const readerShell = document.querySelector<HTMLElement>('[data-target-id="reader-shell"]')!
  const aboutView = document.querySelector<HTMLElement>('[data-target-id="about-view"]')!
  const titleEl = getTitleEl()

  if (route.view === 'about' || route.view === 'cue-analytics') {
    audioController.pause()
    setAdminPanelVisible(false, audioController)
    readerShell.classList.add('u-hidden')
    aboutView.classList.remove('u-hidden')
    aboutView.innerHTML = route.view === 'about' ? AboutPage() : CueAnalyticsPage()
    if (route.view === 'cue-analytics') mountCueAnalyticsPage(aboutView)
    titleEl.textContent = 'תיקון קוראים'
    syncReaderProgressVisibility()
    return
  }

  readerShell.classList.remove('u-hidden')
  aboutView.classList.add('u-hidden')
  aboutView.innerHTML = ''
  lastReaderHash = location.hash || lastReaderHash
  syncReaderProgressVisibility()
  app.jumpTo(route.model)
}

function navigateToHash(hash: string, audioController: AudioController) {
  if (location.hash === hash) {
    const route = parseUrl(generator, hash.replace(/^#/, ''))
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
  const book = getBook()
  const toggle = document.querySelector<HTMLInputElement>(
    '[data-target-id="annotations-toggle"]'
  )!
  const audioElement = document.querySelector<HTMLAudioElement>(
    '[data-target-id="reader-audio"]'
  )!

  readerPreferences = loadReaderPreferences()
  applyReaderPreferences(readerPreferences)

  const audioController = new AudioController(audioElement)
  audioControllerGlobal = audioController
  const highlightController = new HighlightController(book)
  highlightControllerGlobal = highlightController
  mountAdminEditorUi()

  const viewportTracker = new ViewportTracker(book)
  const topBarModel = new TopBarTracker()
  const titleEl = getTitleEl()

  setControlIcon(document.querySelector('[data-target-id="floating-prev"]'), 'previous')
  setControlIcon(document.querySelector('[data-target-id="floating-play"]'), 'play')
  setControlIcon(document.querySelector('[data-target-id="floating-next"]'), 'next')
  setControlIcon(document.querySelector('[data-target-id="floating-replay"]'), 'replay')
  setControlIcon(document.querySelector('[data-target-id="floating-download"]'), 'download')
  updateFloatingPlayer(audioController)

  viewportTracker.on('viewport-updated', (range) => {
    if (!display?.viewModel) return
    topBarModel.setLine(display.viewModel, range)
    const run = topBarModel.info.currentRun
    titleEl.textContent = formatTopBarTitle(run?.leining.date.title.he)
    updateReaderProgress()
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

  const rememberLastScrollPositionDebounced = debounce(
    () => rememberLastScrolledPosition(),
    1000
  )

  book.addEventListener('scroll', () => {
    if (!progressFrame) {
      progressFrame = requestAnimationFrame(() => {
        progressFrame = 0
        updateReaderProgress()
      })
    }
    rememberLastScrollPositionDebounced()
  })

  book.addEventListener('page-rendered', () => {
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
      focusReaderSurface()
      return
    }

    const word = target.closest<HTMLElement>('.word')
    if (!word || !audioController.session) return
    const tokenKey = highlightController.getTokenKeyFromElement(word)
    if (!tokenKey) return
    const cue = audioController.session.cues.find((candidate) => cueKey(candidate) === tokenKey)
    if (cue) {
      cueNavigationIndex = audioController.session.cues.indexOf(cue)
      audioController.seek(cue.timeStart)
      audioController.play()
      highlightController.activateCue(cue, {
        scroll: readerPreferences.autoScrollWithPlayback,
      })
    } else {
      highlightController.activateTokenKey(tokenKey, {
        scroll: readerPreferences.autoScrollWithPlayback,
      })
    }
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
  audioController.on('time-updated', async ({ currentTime }) => {
    updateFloatingPlayerAudioProgress(audioController)
    updateFloatingPlayerMeta(audioController)
    const adminPanel = document.querySelector<HTMLElement>(
      '[data-target-id="admin-panel"]'
    )
    if (adminPanel && !adminPanel.classList.contains('u-hidden')) {
      renderAdminCueList(audioController)
    }
    if (adminState.recording) return
    const session = audioController.session
    if (!session?.cues.length) return
    const cueIndex = highlightController.getCueIndex(session.cues, currentTime)
    if (cueIndex < 0) return
    cueNavigationIndex = cueIndex
    await highlightController.activateCue(session.cues[cueIndex], {
      scroll: readerPreferences.autoScrollWithPlayback,
    })
  })
  for (const eventName of ['loadedmetadata', 'durationchange', 'emptied'] as const) {
    audioElement.addEventListener(eventName, () => {
      updateFloatingPlayerAudioProgress(audioController)
      updateFloatingPlayerMeta(audioController)
    })
  }

  document
    .querySelector('[data-target-id="floating-play"]')!
    .addEventListener('click', async () => {
      await audioController.togglePlayback()
      focusReaderSurface()
    })
  document
    .querySelector('[data-target-id="floating-prev"]')!
    .addEventListener('click', () => {
      stepPlayback(-1, audioController, highlightController)
      focusReaderSurface()
    })
  document
    .querySelector('[data-target-id="floating-next"]')!
    .addEventListener('click', () => {
      stepPlayback(1, audioController, highlightController)
      focusReaderSurface()
    })
  document
    .querySelector('[data-target-id="floating-replay"]')!
    .addEventListener('click', async () => {
      await replayAliyahFromStart(audioController, highlightController)
      focusReaderSurface()
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
        .querySelector<HTMLElement>('[data-target-id="export-modal"]')!
        .classList.add('u-hidden')
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
    .addEventListener('click', () =>
      document
        .querySelector<HTMLElement>('[data-target-id="export-modal"]')!
        .classList.add('u-hidden')
    )

  document
    .querySelector('[data-target-id="admin-record"]')!
    .addEventListener('click', () => {
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
      void audioController.togglePlayback()
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

  setupSettingsPane(audioController)
  restoreAdminAccessState(audioController)
  syncAdminPanelState(audioController)

  listenForRevealGesture(book)
  setAppHeight()

  window.addEventListener('resize', () => {
    setAppHeight()
    resumeLastScrollPosition()
    updateReaderProgress()
  })

  window.addEventListener('hashchange', () => {
    const route = parseCurrentRoute()
    if (!route) return
    renderRoute(route, audioController)
  })

  const initialRoute =
    parseCurrentRoute() ?? {
      view: 'reader' as const,
      model: ScrollViewModel.forDate(generator, new Date()),
    }
  renderRoute(initialRoute, audioController)
})
