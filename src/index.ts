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
  listNarrators,
} from './audio/library.ts'
import { cueFileRelativePath, formatCueFileJson } from './audio/cue-file.ts'
import { normalizeFirstCueStart } from './audio/normalize-first-cue.ts'
import { AudioController, ActiveAudioSession } from './reading/audio-controller.ts'
import { HighlightController, cueKey } from './reading/highlight-controller.ts'
import { adjustStartingLineTokens } from './reading/aliyah-token-sequence.ts'
import type { CueExportPayload, WordCue } from './audio/types.ts'
import { verifyAdminPassword } from './admin/access.ts'
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

const adminState: {
  unlocked: boolean
  recording: boolean
  tokenPointer: number
  cues: WordCue[]
} = {
  unlocked: false,
  recording: false,
  tokenPointer: -1,
  cues: [],
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

const showParshaPicker = () => {
  ;[
    { selector: '[data-test-id="annotations-toggle"]', visible: false },
    { selector: '[data-target-id="settings-toggle"]', visible: false },
    { selector: '[data-target-id="about-link"]', visible: false },
    { selector: '[data-target-id="tikkun-book"]', visible: false },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  const jumper = ParshaPicker(generator)

  document.querySelector('[data-target-id="reader-shell"]')!.appendChild(jumper.node)

  jumper.onMount()
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
    cues: getCuesForRecording(state.recording),
    runId: state.lineInfo.run.id,
    aliyahIndex: state.aliyahIndex,
    tokenKeys,
  }

  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  adminState.cues = []
  adminState.tokenPointer = -1
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

function syncAdminRecordButton() {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-target-id="admin-record"]'
  )!
  button.textContent = adminState.recording ? 'Stop Recording' : 'Record/Edit Cues'
}

function syncAdminPanelState(audioController?: AudioController | null) {
  const session = audioController?.session ?? null
  const tokenCount = session?.tokenKeys.length ?? 0
  const hasSession = Boolean(session && tokenCount)
  const hasCues = adminState.cues.length > 0
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

  if (!hasSession) {
    counter.textContent = '0 cues'
    status.textContent = 'Select an aliyah and press play to start cue authoring.'
  } else if (adminState.recording) {
    const pointer = adminState.tokenPointer >= 0 ? adminState.tokenPointer + 1 : 1
    status.textContent = `${session!.recording.title}: recording live. Use Space or Right Arrow to record cue ${pointer}; Left Arrow steps back.`
    updateAdminCounter(tokenCount)
  } else {
    const pointer = adminState.tokenPointer >= 0 ? adminState.tokenPointer + 1 : 0
    status.textContent = `${session!.recording.title}: ready to author. ${
      hasCues
        ? `Resume from cue ${pointer || 1} or export the current set.`
        : 'Press Record/Edit Cues to begin.'
    }`
    updateAdminCounter(tokenCount)
  }

  recordButton.disabled = !hasSession
  stepBackButton.disabled = !canStepBack
  undoButton.disabled = !hasCues
  resetButton.disabled = !hasCues && !adminState.recording && adminState.tokenPointer < 0
  exportButton.disabled = !hasSession || !hasCues
  syncAdminRecordButton()
}

async function resetAdminRecorder(
  audioController: AudioController,
  highlightController: HighlightController
) {
  adminState.cues = []
  adminState.tokenPointer = -1
  adminState.recording = false
  cueNavigationIndex = audioController.session?.cues.length ? 0 : null
  syncAdminPanelState(audioControllerGlobal)
  await replayAliyahFromStart(audioController, highlightController, {
    restartAudio: false,
  })
}

let audioControllerGlobal: AudioController | null = null
let highlightControllerGlobal: HighlightController | null = null

async function exportAdminCues(audioController: AudioController) {
  const session = audioController.session
  if (!session) return

  const payload: CueExportPayload = {
    audioId: session.recording.id,
    audioFormat: session.recording.format,
    narratorId: session.recording.narratorId,
    parshaSlug: session.recording.parshaSlug,
    aliyah: session.recording.aliyah,
    tokenCount: session.tokenKeys.length,
    cueCount: adminState.cues.length,
    tokenizationVersion: TOKENIZATION_VERSION,
    audioVersion: session.recording.notes,
    cues: normalizeFirstCueStart(adminState.cues),
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

  const currentIndex =
    adminState.tokenPointer >= 0
      ? adminState.tokenPointer
      : Math.max(highlightController.getActiveIndex(), 0)
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
  const nextTokenKey = session.tokenKeys[currentIndex + 1] ?? tokenKey
  adminState.tokenPointer = Math.min(currentIndex + 1, session.tokenKeys.length - 1)
  highlightController.activateTokenKey(nextTokenKey, {
    scroll: readerPreferences.autoScrollWithPlayback,
  })
  syncAdminPanelState(audioController)
}

function stepAdminBack(highlightController: HighlightController) {
  const session = audioControllerGlobal?.session
  if (!session?.tokenKeys.length) return
  if (adminState.tokenPointer <= 0) {
    adminState.tokenPointer = 0
    highlightController.activateTokenKey(session.tokenKeys[0], {
      scroll: readerPreferences.autoScrollWithPlayback,
    })
    syncAdminPanelState(audioControllerGlobal)
    return
  }
  adminState.tokenPointer -= 1
  const tokenKey = session.tokenKeys[adminState.tokenPointer]
  if (!tokenKey) return
  highlightController.activateTokenKey(tokenKey, {
    scroll: readerPreferences.autoScrollWithPlayback,
  })
  syncAdminPanelState(audioControllerGlobal)
}

function undoLastAdminCue(highlightController: HighlightController) {
  adminState.cues.pop()
  adminState.tokenPointer = adminState.cues.length
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
  syncAdminPanelState(audioControllerGlobal)
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

  if (route.view === 'about') {
    audioController.pause()
    readerShell.classList.add('u-hidden')
    aboutView.classList.remove('u-hidden')
    aboutView.innerHTML = AboutPage()
    titleEl.textContent = 'Tikkun'
    return
  }

  readerShell.classList.remove('u-hidden')
  aboutView.classList.add('u-hidden')
  aboutView.innerHTML = ''
  lastReaderHash = location.hash || lastReaderHash
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
      navigateToHash(generateAboutUrl(), audioController)
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
      if (adminState.recording) {
        adminState.tokenPointer = Math.max(highlightController.getActiveIndex(), 0)
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
    .querySelector('[data-target-id="admin-export"]')!
    .addEventListener('click', () => void exportAdminCues(audioController))

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      if (!adminState.unlocked) {
        const provided = window.prompt('Admin password')
        if (!provided || !verifyAdminPassword(provided)) return
        adminState.unlocked = true
      }
      document
        .querySelector<HTMLElement>('[data-target-id="admin-panel"]')!
        .classList.toggle('u-hidden')
      syncAdminPanelState(audioController)
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
