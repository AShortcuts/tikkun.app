import '/css/master.css'
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
import {
  applyReaderPreferences,
  defaultReaderPreferences,
  loadReaderPreferences,
  mergeReaderPreferences,
  ReaderPreferences,
  saveReaderPreferences,
  TOKENIZATION_VERSION,
} from './reader-preferences.ts'
import {
  findRecordingForRun,
  getCuesForRecording,
  listNarrators,
} from './audio/library.ts'
import { AudioController, ActiveAudioSession } from './reading/audio-controller.ts'
import { HighlightController, cueKey } from './reading/highlight-controller.ts'
import { adjustStartingLineTokens } from './reading/aliyah-token-sequence.ts'
import type { CueExportPayload, WordCue } from './audio/types.ts'

declare function gtag(
  name: 'event',
  label: string,
  payload: Record<string, unknown>
): void

const { whenKey } = utils
const ADMIN_PASSWORD = 'admin'

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

  gtag('event', 'view', {
    event_category: 'navigation',
  })

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

function getTitleEl() {
  return document.querySelector<HTMLElement>('[data-target-id="parsha-title"]')!
}

function formatTopBarTitle(title: string | undefined) {
  return title?.replace(/^פרשת /, '') ?? 'About this Project'
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

function getAliyahProgressAnchors() {
  const book = getBook()
  const bookRect = book.getBoundingClientRect()

  return [...book.querySelectorAll<HTMLElement>('[data-line-index][data-aliyah-starts]')]
    .map((line) => {
      const rect = line.getBoundingClientRect()
      const label =
        line.querySelector('.aliyah-label-text')?.textContent?.trim() ?? '—'
      return {
        line,
        label,
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
    button.disabled = !available
    button.title = available
      ? `Play ${state!.lineInfo.labels[0] ?? 'aliyah'}`
      : 'Recording unavailable'
    button.classList.toggle('is-active', Boolean(
      available &&
        audioController.session?.recording.id === state?.recording?.id
    ))
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
  const playButton = document.querySelector<HTMLElement>('[data-target-id="floating-play"]')!
  const downloadLink = document.querySelector<HTMLAnchorElement>(
    '[data-target-id="floating-download"]'
  )!
  const activeSession = audioController.session

  player.classList.toggle('u-hidden', !activeSession)
  playButton.textContent = audioController.audio.paused ? '▶' : '❚❚'

  if (activeSession) {
    downloadLink.href = activeSession.recording.downloadSrc
    downloadLink.download = `${activeSession.recording.id}.${activeSession.recording.format}`
  } else {
    downloadLink.href = '#'
    downloadLink.removeAttribute('download')
  }
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
  updateAdminCounter(tokenKeys.length)

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
    const currentCueIndex = highlightController.getCueIndex(
      session.cues,
      audioController.audio.currentTime
    )
    const targetCue = session.cues[Math.max(0, currentCueIndex + delta)]
    if (!targetCue) return
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
  highlightController: HighlightController
) {
  const session = audioController.session
  if (!session) return

  if (session.cues.length) {
    await highlightController.activateCue(session.cues[0], { scroll: true })
  } else if (session.tokenKeys[0]) {
    await highlightController.activateTokenKey(session.tokenKeys[0], {
      scroll: true,
    })
  }

  await audioController.replayFromStart()
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
  const book = getBook()
  const anchors = getAliyahProgressAnchors()

  if (!anchors.length) {
    label.textContent = 'Loading'
    fill.style.height = '0%'
    percent.textContent = '0%'
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
  counter.textContent = `${adminState.cues.length} / ${tokenCount} cues`
}

function syncAdminRecordButton() {
  const button = document.querySelector<HTMLElement>('[data-target-id="admin-record"]')!
  button.textContent = adminState.recording ? 'Stop Recording' : 'Record/Edit Cues'
}

function resetAdminRecorder(highlightController: HighlightController) {
  adminState.cues = []
  adminState.tokenPointer = -1
  adminState.recording = false
  updateAdminCounter(audioControllerGlobal?.session?.tokenKeys.length ?? 0)
  syncAdminRecordButton()
  highlightController.clear()
}

let audioControllerGlobal: AudioController | null = null
let highlightControllerGlobal: HighlightController | null = null

function exportAdminCues(audioController: AudioController) {
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
    cues: adminState.cues,
  }

  const modal = document.querySelector<HTMLElement>('[data-target-id="export-modal"]')!
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '[data-target-id="export-text"]'
  )!
  textarea.value = JSON.stringify(payload, null, 2)
  modal.classList.remove('u-hidden')
  setTimeout(() => textarea.select(), 0)
}

function recordNextCue(
  audioController: AudioController,
  highlightController: HighlightController
) {
  const session = audioController.session
  if (!session) return

  const nextIndex = adminState.tokenPointer + 1
  const tokenKey = session.tokenKeys[nextIndex]
  if (!tokenKey) return

  adminState.tokenPointer = nextIndex
  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = tokenKey
    .split(':')
    .map(Number)
  adminState.cues[nextIndex] = {
    timeStart: Number(audioController.audio.currentTime.toFixed(3)),
    pageNumber,
    lineIndex,
    fragmentIndex,
    wordIndex,
  }
  highlightController.activateTokenKey(tokenKey, {
    scroll: readerPreferences.autoScrollWithPlayback,
  })
  updateAdminCounter(session.tokenKeys.length)
}

function stepAdminBack(highlightController: HighlightController) {
  if (adminState.tokenPointer <= 0) {
    adminState.tokenPointer = -1
    highlightController.clear()
    return
  }
  adminState.tokenPointer -= 1
  const tokenKey = audioControllerGlobal?.session?.tokenKeys[adminState.tokenPointer]
  if (!tokenKey) return
  highlightController.activateTokenKey(tokenKey, {
    scroll: readerPreferences.autoScrollWithPlayback,
  })
}

function undoLastAdminCue(highlightController: HighlightController) {
  adminState.cues.pop()
  adminState.tokenPointer = adminState.cues.length - 1
  const tokenKey =
    audioControllerGlobal?.session?.tokenKeys[adminState.tokenPointer] ?? null
  if (tokenKey) {
    highlightController.activateTokenKey(tokenKey, {
      scroll: readerPreferences.autoScrollWithPlayback,
    })
  } else {
    highlightController.clear()
  }
  updateAdminCounter(audioControllerGlobal?.session?.tokenKeys.length ?? 0)
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

  narratorSelect.innerHTML = listNarrators()
    .map(
      (narrator) =>
        `<option value="${narrator.id}">${narrator.displayName}</option>`
    )
    .join('')

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
    titleEl.textContent = 'About this Project'
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

  book.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const playButton = target.closest<HTMLButtonElement>('[data-audio-button="true"]')
    if (playButton) {
      event.preventDefault()
      startPlaybackForButton(playButton, audioController, highlightController)
      return
    }

    const word = target.closest<HTMLElement>('.word')
    if (!word || !audioController.session) return
    const tokenKey = highlightController.getTokenKeyFromElement(word)
    if (!tokenKey) return
    const cue = audioController.session.cues.find((candidate) => cueKey(candidate) === tokenKey)
    if (cue) {
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
  })
  audioController.on('session-loaded', (session) => {
    highlightController.setSequence(session.tokenKeys)
    updateFloatingPlayer(audioController)
  })
  audioController.on('time-updated', async ({ currentTime }) => {
    if (adminState.recording) return
    const session = audioController.session
    if (!session?.cues.length) return
    const cueIndex = highlightController.getCueIndex(session.cues, currentTime)
    if (cueIndex < 0) return
    await highlightController.activateCue(session.cues[cueIndex], {
      scroll: readerPreferences.autoScrollWithPlayback,
    })
  })

  document
    .querySelector('[data-target-id="floating-play"]')!
    .addEventListener('click', () => audioController.togglePlayback())
  document
    .querySelector('[data-target-id="floating-prev"]')!
    .addEventListener('click', () =>
      stepPlayback(-1, audioController, highlightController)
    )
  document
    .querySelector('[data-target-id="floating-next"]')!
    .addEventListener('click', () =>
      stepPlayback(1, audioController, highlightController)
    )
  document
    .querySelector('[data-target-id="floating-replay"]')!
    .addEventListener('click', () =>
      replayAliyahFromStart(audioController, highlightController)
    )

  toggle.addEventListener('change', () =>
    toggleAnnotations(() => !toggle.checked)
  )

  document.addEventListener(
    'keydown',
    whenKey('Shift', () => toggleAnnotations(() => toggle.checked))
  )
  document.addEventListener(
    'keyup',
    whenKey('Shift', () => toggleAnnotations(() => toggle.checked))
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
      syncAdminRecordButton()
    })
  document
    .querySelector('[data-target-id="admin-step-back"]')!
    .addEventListener('click', () => stepAdminBack(highlightController))
  document
    .querySelector('[data-target-id="admin-undo"]')!
    .addEventListener('click', () => undoLastAdminCue(highlightController))
  document
    .querySelector('[data-target-id="admin-reset"]')!
    .addEventListener('click', () => resetAdminRecorder(highlightController))
  document
    .querySelector('[data-target-id="admin-export"]')!
    .addEventListener('click', () => exportAdminCues(audioController))

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      if (!adminState.unlocked) {
        const provided = window.prompt('Admin password')
        if (provided !== ADMIN_PASSWORD) return
        adminState.unlocked = true
      }
      document
        .querySelector<HTMLElement>('[data-target-id="admin-panel"]')!
        .classList.toggle('u-hidden')
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
  syncAdminRecordButton()

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
