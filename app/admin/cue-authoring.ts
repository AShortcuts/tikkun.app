import { cueFileRelativePath, formatCueFileJson } from '../audio/cue-file.ts'
import { getCueSavedAtForRecording } from '../audio/library.ts'
import { normalizeFirstCueStart } from '../audio/normalize-first-cue.ts'
import { getWordProgress } from '../audio/progress.ts'
import {
  createRecordingIssue,
  recordingIssueKinds,
  recordingIssueReaderLabel,
  saveRecordingIssues,
  type RecordingIssue,
  type RecordingIssueKind,
} from '../audio/recording-issues.ts'
import type { WaveformSummary } from '../audio/waveform-summary.ts'
import {
  decodeWaveformSummary,
  WaveformSummaryLoader,
} from '../audio/waveform-summary-loader.ts'
import type { CueExportPayload, WordCue } from '../audio/types.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import {
  writeStorageItem,
} from '../persistence/persisted-state.ts'
import { TOKENIZATION_VERSION } from '../reader-preferences.ts'
import { formatTokenKey, parseTokenKey } from '../reader/token-position.ts'
import type {
  ActiveAudioSession,
  AudioController,
} from '../reading/audio-controller.ts'
import type { HighlightController } from '../reading/highlight-controller.ts'
import {
  CUE_AUTHORING_PANEL_OPEN_KEY,
  CUE_AUTHORING_UNLOCKED_KEY,
  isCueAuthoringToggleShortcut,
  readCueAuthoringAccessState,
  verifyAdminPassword,
} from './access.ts'
import {
  isAuthoringSession,
  replaceAuthoringSessionCues,
} from './authoring-session.ts'
import { areCueDraftsEquivalent } from './draft-cue-comparison.ts'
import {
  AdminDraftConflictError,
  AdminDraftStorageError,
  loadAdminDraft,
  saveAdminDraftPayload,
  type AdminDraftPayload,
} from './draft-storage.ts'
import {
  MicrophoneCapture,
  type CapturedMicrophoneAudio,
} from './microphone-capture.ts'

export type CueAuthoringChange =
  | 'access'
  | 'draft'
  | 'mode'
  | 'playback'
  | 'playback-progress'

export interface CueAuthoringOptions {
  document: Document
  view: Window
  audioController: AudioController
  highlightController: HighlightController
  localStorage: Storage | null
  sessionStorage: Storage | null
  prepareAuthoringSession: () => Promise<void>
  restoreReaderSession: () => Promise<void>
  playNetworkRecording: (retry?: () => Promise<void>) => Promise<void>
  getAutoScroll: () => boolean
  getActiveTokenKey: () => string | null
  getDisplayTime: () => number
  getRecordingIssues: () => readonly RecordingIssue[]
  focusReader: () => void
  formatDuration: (seconds: number) => string
  onChange: (change: CueAuthoringChange) => void
  onCueNavigationChange: (index: number | null) => void
  onRecordingIssuesChanged: (issues: RecordingIssue[]) => void
  showPersistenceNotice: (message: string) => void
}

export interface CueAuthoring {
  isUnlocked(): boolean
  isVisible(): boolean
  isActive(): boolean
  isRecording(): boolean
  getSession(): ActiveAudioSession | null
  setVisible(visible: boolean): void
  closeAccess(): void
  openIssue(): void
  restoreAccessState(): void
  bindSession(session: ActiveAudioSession): Promise<void>
  clearSession(): void
  selectReaderToken(
    index: number,
    options?: {
      play?: boolean
      preservePlayback?: boolean
      seekToCue?: boolean
      focusRow?: boolean
    }
  ): Promise<void>
  handleKeydown(event: KeyboardEvent): boolean
  closeOverlays(): void
  recordingIssuesChanged(saveError?: string | null): void
}

type CueAuthoringState = {
  unlocked: boolean
  recording: boolean
  tokenPointer: number
  cues: WordCue[]
  sourceCues: WordCue[]
  draftOrigin: 'none' | 'published' | 'local'
  draftSavedAt: number | null
  draftSaveError: string | null
  recordingIssueSaveError: string | null
}

type WaveformWindow = {
  start: number
  end: number
  zoomed: boolean
}

const WAVEFORM_SUMMARY_BUCKETS = 800
const MAX_WAVEFORM_SUMMARY_CACHE_ENTRIES = 6
const WAVEFORM_VISIBLE_BARS = 160
const WAVEFORM_AUTO_WINDOW_SECONDS = 24
const WAVEFORM_FULL_VIEW_MAX_SECONDS = 30
const WAVEFORM_WINDOW_STEP_SECONDS = 1
const WAVEFORM_FOLLOW_LEFT_RATIO = 0.38
const WAVEFORM_FOLLOW_RIGHT_RATIO = 0.68
const WAVEFORM_FOLLOW_BACKWARD_TARGET_RATIO = 0.48
const WAVEFORM_FOLLOW_FORWARD_TARGET_RATIO = 0.58

const adminRecordIconMarkup = `
  <span class="admin-record-icon-stack" aria-hidden="true">
    <svg class="admin-record-icon mod-record" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="5.41" fill="currentColor" stroke="none"/>
    </svg>
    <svg class="admin-record-icon mod-stop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
      <circle class="admin-record-stop-outer" cx="12" cy="12" r="10"/>
      <rect class="admin-record-stop-inner" x="7.84" y="7.84" width="8.32" height="8.32" rx="2.08" fill="currentColor" stroke="none"/>
    </svg>
  </span>
`

const adminResumeIconMarkup = `
  <svg class="admin-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>
  </svg>
`

const cloneCue = (cue: WordCue): WordCue => ({ ...cue })
const cloneCues = (cues: readonly WordCue[]) => cues.map(cloneCue)
const roundCueTime = (value: number) => Number(value.toFixed(3))

export function createCueAuthoring(
  scope: MountScope,
  options: CueAuthoringOptions
): CueAuthoring {
  const {
    document,
    view,
    audioController,
    highlightController,
  } = options
  const state: CueAuthoringState = {
    unlocked: false,
    recording: false,
    tokenPointer: -1,
    cues: [],
    sourceCues: [],
    draftOrigin: 'none',
    draftSavedAt: null,
    draftSaveError: null,
    recordingIssueSaveError: null,
  }
  const microphoneCapture = new MicrophoneCapture()
  const waveformSummaryCache = new Map<string, WaveformSummary>()
  const waveformSummaryLoaders = new Map<string, WaveformSummaryLoader>()
  const waveformWindowCache = new Map<string, WaveformWindow>()
  const draftTimeFormat = Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  let lastRenderedCueCount = 0
  let lastFollowedCueIndex = -1
  let exportDownloadUrl: string | null = null
  let exportAudioDownloadUrl: string | null = null
  let microphoneAudioId: string | null = null
  let capturedAudio: {
    audioId: string
    capture: CapturedMicrophoneAudio
  } | null = null
  let microphoneCaptureError: string | null = null
  let microphoneReplacementAudioId: string | null = null
  let waveformRenderFrame = 0
  let waveformContentRevision = 0
  let sessionBindingGeneration = 0
  let pendingIssueTokenKey: string | null = null
  let pendingIssueTimeStart: number | undefined

  const query = <ElementType extends Element>(selector: string) =>
    document.querySelector<ElementType>(selector)

  const required = <ElementType extends Element>(selector: string) => {
    const element = query<ElementType>(selector)
    if (!element) throw new Error(`Missing Cue Authoring target: ${selector}`)
    return element
  }

  const getPanel = () =>
    query<HTMLElement>('[data-target-id="admin-panel"]')

  const isVisible = () => {
    const panel = getPanel()
    return Boolean(panel && !panel.classList.contains('u-hidden'))
  }

  const getSession = () => {
    const session = audioController.session
    return isAuthoringSession(session) ? session : null
  }

  const formatCueTimestamp = (seconds: number) => {
    const milliseconds = Math.max(0, Math.round(seconds * 1000))
    const wholeSeconds = Math.floor(milliseconds / 1000)
    return `${options.formatDuration(wholeSeconds)}.${String(
      milliseconds % 1000
    ).padStart(3, '0')}`
  }

  const cueFromTokenKey = (tokenKey: string, timeStart: number): WordCue => {
    const position = parseTokenKey(tokenKey)
    if (!position) throw new TypeError(`Invalid token key: ${tokenKey}`)
    return {
      timeStart: roundCueTime(timeStart),
      ...position,
    }
  }

  const assignCues = (cues: WordCue[]) => {
    state.cues = cues
    waveformContentRevision += 1
    const session = audioController.session
    if (session) replaceAuthoringSessionCues(session, cues)
  }

  const getResumeTokenPointer = (tokenCount: number) => {
    if (!tokenCount) return -1
    return state.cues.length < tokenCount
      ? state.cues.length
      : tokenCount - 1
  }

  const updateCounter = (tokenCount: number) => {
    const counter = required<HTMLElement>(
      '[data-target-id="admin-cue-count"]'
    )
    const pointer = state.tokenPointer >= 0 ? state.tokenPointer + 1 : 0
    counter.textContent = `${state.cues.length} / ${tokenCount} Words - ${pointer}`
  }

  const persistAccessState = () => {
    try {
      writeStorageItem(
        options.sessionStorage,
        CUE_AUTHORING_UNLOCKED_KEY,
        state.unlocked ? '1' : '0'
      )
      writeStorageItem(
        options.sessionStorage,
        CUE_AUTHORING_PANEL_OPEN_KEY,
        getPanel()?.classList.contains('u-hidden') ? '0' : '1'
      )
    } catch (error) {
      console.error('Failed to save the admin session state', error)
      options.showPersistenceNotice(
        'Admin access will not persist after this page is closed.'
      )
    }
  }

  const resetExportDownloadLinks = () => {
    if (exportDownloadUrl) {
      URL.revokeObjectURL(exportDownloadUrl)
      exportDownloadUrl = null
    }
    if (exportAudioDownloadUrl) {
      URL.revokeObjectURL(exportAudioDownloadUrl)
      exportAudioDownloadUrl = null
    }

    const downloadLink = query<HTMLAnchorElement>(
      '[data-target-id="export-download"]'
    )
    downloadLink?.removeAttribute('href')
    downloadLink?.removeAttribute('download')

    const audioDownloadLink = query<HTMLAnchorElement>(
      '[data-target-id="export-audio-download"]'
    )
    audioDownloadLink?.removeAttribute('href')
    audioDownloadLink?.removeAttribute('download')
    audioDownloadLink?.classList.add('u-hidden')
    const audioStatus = query<HTMLElement>(
      '[data-target-id="export-audio-status"]'
    )
    if (audioStatus) {
      audioStatus.hidden = true
      audioStatus.textContent = ''
    }
  }

  const hideExport = () => {
    query<HTMLElement>('[data-target-id="export-modal"]')?.classList.add(
      'u-hidden'
    )
    resetExportDownloadLinks()
  }

  const saveDraft = () => {
    const session = getSession()
    if (!session) return false

    const updatedAt = Date.now()
    const payload: AdminDraftPayload = {
      audioId: session.recording.id,
      tokenCount: session.tokenKeys.length,
      tokenPointer: state.tokenPointer,
      tokenizationVersion: TOKENIZATION_VERSION,
      updatedAt,
      cues: cloneCues(state.cues),
    }

    try {
      saveAdminDraftPayload(payload)
    } catch (error) {
      state.draftSaveError =
        error instanceof AdminDraftConflictError
          ? 'A newer local draft exists in another tab. Reload this recording before saving more changes.'
          : error instanceof AdminDraftStorageError
            ? 'This draft could not be saved in browser storage. Export it before leaving this recording.'
            : 'This draft could not be saved. Export it before leaving this recording.'
      console.error(
        `Failed to save admin draft for ${session.recording.id}`,
        error
      )
      syncPanel()
      return false
    }

    state.draftSaveError = null
    state.draftOrigin = 'local'
    state.draftSavedAt = updatedAt
    options.onChange('draft')
    return true
  }

  const mountEditorMarkup = () => {
    const panel = getPanel()
    if (!panel || panel.querySelector('[data-target-id="admin-draft-status"]')) {
      return
    }

    panel.insertAdjacentHTML(
      'beforeend',
      `
        <div class="admin-panel-draft" data-target-id="admin-draft-status">
          Drafts autosave locally per recording.
        </div>
        <div class="admin-panel-actions mod-secondary" data-target-id="admin-resume-wrap" hidden>
          <span class="admin-icon-control">
            <button type="button" class="toolbar-button admin-icon-button" data-target-id="admin-resume-draft" aria-label="Resume the incomplete timing draft from the next unsaved word" title="Resume the incomplete timing draft from the next unsaved word">${adminResumeIconMarkup}</button>
            <span class="admin-icon-caption" aria-hidden="true">Resume Draft</span>
          </span>
        </div>
        <div class="admin-panel-draft" data-target-id="admin-sync-note" hidden>
          To visualize synced autoplay highlighting, press 'Stop Recording'.
        </div>
        <div class="admin-panel-actions mod-secondary">
          <button type="button" class="toolbar-button" data-target-id="admin-prev-saved" aria-label="Select the previous saved word timing" title="Select the previous saved word timing">Prev Saved</button>
          <button type="button" class="toolbar-button" data-target-id="admin-play-current" aria-label="Play audio from the selected word timing" title="Play audio from the selected word timing">Play Current</button>
          <button type="button" class="toolbar-button" data-target-id="admin-next-saved" aria-label="Select the next saved word timing" title="Select the next saved word timing">Next Saved</button>
          <button type="button" class="toolbar-button" data-target-id="admin-trim-here" aria-label="Delete saved timings after the selected word" title="Delete saved timings after the selected word">Trim From Here</button>
        </div>
        <div class="admin-panel-actions mod-secondary mod-timing">
          <button type="button" class="toolbar-button" data-admin-nudge="-0.25" title="Move the selected word timing 250 milliseconds earlier" aria-label="Move the selected word timing 250 milliseconds earlier">-250</button>
          <button type="button" class="toolbar-button" data-admin-nudge="-0.05" title="Move the selected word timing 50 milliseconds earlier" aria-label="Move the selected word timing 50 milliseconds earlier">-50</button>
          <button type="button" class="toolbar-button" data-admin-nudge="0.05" title="Move the selected word timing 50 milliseconds later" aria-label="Move the selected word timing 50 milliseconds later">+50</button>
          <button type="button" class="toolbar-button" data-admin-nudge="0.25" title="Move the selected word timing 250 milliseconds later" aria-label="Move the selected word timing 250 milliseconds later">+250</button>
        </div>
        <div class="admin-cue-list" data-target-id="admin-cue-list"></div>
        <div class="admin-progress-list" data-target-id="admin-progress">
          <div class="floating-player-progress-item">
            <div class="floating-player-progress-head">
              <span class="floating-player-progress-label">Word Progress</span>
              <span class="floating-player-progress-value" data-target-id="admin-meta-cues">0 / 0</span>
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
        <div class="admin-waveform" data-target-id="admin-waveform">
          <div class="admin-waveform-head">
            <span data-target-id="admin-waveform-status">Load a recording to show the waveform.</span>
            <span>cues - issues - playhead</span>
          </div>
          <div class="admin-waveform-lane" data-target-id="admin-waveform-lane">
            <div class="admin-waveform-bars" data-target-id="admin-waveform-bars"></div>
          </div>
        </div>
      `
    )
  }

  const clearSession = () => {
    sessionBindingGeneration += 1
    state.sourceCues = []
    state.cues = []
    state.tokenPointer = -1
    state.recording = false
    state.draftOrigin = 'none'
    state.draftSavedAt = null
    state.draftSaveError = null
    state.recordingIssueSaveError = null
    waveformContentRevision += 1
    syncPanel()
  }

  const bindSession = async (session: ActiveAudioSession) => {
    const generation = ++sessionBindingGeneration
    if (audioController.session !== session || !isAuthoringSession(session)) {
      clearSession()
      return
    }

    const sourceCues = cloneCues(session.cues)
    const draft = loadAdminDraft(session.recording.id, session.tokenKeys)
    const savedAt =
      draft?.updatedAt ??
      (await getCueSavedAtForRecording(session.recording)) ??
      null
    if (
      generation !== sessionBindingGeneration ||
      audioController.session !== session ||
      !isAuthoringSession(session)
    ) {
      return
    }

    state.sourceCues = sourceCues
    assignCues(draft?.cues ?? cloneCues(sourceCues))
    state.tokenPointer =
      draft?.tokenPointer ?? getResumeTokenPointer(session.tokenKeys.length)
    state.draftOrigin = draft
      ? 'local'
      : sourceCues.length
        ? 'published'
        : 'none'
    state.draftSavedAt = savedAt
    state.draftSaveError = null
    state.recordingIssueSaveError = null
    state.recording = false
    syncPanel()
  }

  const isMicrophoneCaptureActive = () =>
    microphoneCapture.state === 'starting' ||
    microphoneCapture.state === 'recording' ||
    microphoneCapture.state === 'stopping'

  const isMicrophoneRecordingForSession = (
    session: ActiveAudioSession | null
  ) =>
    microphoneCapture.state === 'recording' &&
    Boolean(session && microphoneAudioId === session.recording.id)

  const isMicrophoneCaptureRequested = () =>
    Boolean(
      query<HTMLInputElement>(
        '[data-target-id="admin-capture-audio"]'
      )?.checked
    )

  const clearCapturedAudio = () => {
    capturedAudio = null
    microphoneReplacementAudioId = null
    if (microphoneCapture.state === 'ready') microphoneCapture.clear()
    resetExportDownloadLinks()
  }

  const getMicrophoneCaptureErrorMessage = (error: unknown) => {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        return 'Microphone access was blocked. Allow microphone access, then try again.'
      }
      if (error.name === 'NotFoundError') {
        return 'No microphone was found. Connect one, then try again.'
      }
      if (error.name === 'NotReadableError') {
        return 'The microphone is busy in another app or could not be opened.'
      }
    }
    return error instanceof Error
      ? `Microphone recording failed: ${error.message}`
      : 'Microphone recording failed.'
  }

  const syncMicrophoneCaptureUi = (session: ActiveAudioSession | null) => {
    const input = query<HTMLInputElement>(
      '[data-target-id="admin-capture-audio"]'
    )
    const status = query<HTMLElement>(
      '[data-target-id="admin-audio-capture-status"]'
    )
    if (!input || !status) return

    const supported = microphoneCapture.isSupported()
    const busy = isMicrophoneCaptureActive()
    const readyAudio =
      session && capturedAudio?.audioId === session.recording.id
        ? capturedAudio.capture
        : null
    input.disabled = !session || !supported || busy
    status.classList.toggle('mod-error', Boolean(microphoneCaptureError))
    status.classList.toggle(
      'mod-confirm',
      Boolean(
        !microphoneCaptureError &&
          session &&
          microphoneReplacementAudioId === session.recording.id
      )
    )
    status.classList.toggle(
      'mod-recording',
      isMicrophoneRecordingForSession(session)
    )

    if (microphoneCaptureError) {
      status.textContent = microphoneCaptureError
    } else if (!supported) {
      status.textContent =
        'Microphone recording is not supported in this browser.'
    } else if (microphoneCapture.state === 'starting') {
      status.textContent = 'Waiting for microphone access...'
    } else if (microphoneCapture.state === 'stopping') {
      status.textContent = 'Finishing the audio file...'
    } else if (isMicrophoneRecordingForSession(session)) {
      status.textContent =
        'Microphone audio is recording with the cue clock. Stop or Export to finish both files.'
    } else if (readyAudio) {
      status.textContent =
        `Audio ready (${options.formatDuration(readyAudio.durationSeconds)}, ` +
        `${readyAudio.fileExtension.toUpperCase()}). Export to download it with the cues.`
    } else if (
      session &&
      microphoneReplacementAudioId === session.recording.id
    ) {
      status.textContent =
        'Press Record once more to replace this cue draft with a fresh synchronized audio + timing pass.'
    } else if (input.checked && state.cues.length) {
      status.textContent =
        'Starting microphone audio creates a fresh synchronized timing pass and replaces the current cue draft.'
    } else {
      status.textContent =
        'Optional: capture your microphone into a downloadable audio file while you mark cues.'
    }
  }

  const setRecordButtonState = (
    button: HTMLButtonElement,
    recording: boolean,
    recordingAudio = false,
    confirmingFreshPass = false
  ) => {
    const label = confirmingFreshPass
      ? 'Confirm a fresh synchronized microphone audio and timing pass'
      : recording
        ? recordingAudio
          ? 'Stop microphone audio and word timing recording'
          : 'Stop recording word timings and switch to playback review'
        : 'Record or edit word timing for the loaded aliyah'
    button.classList.add('admin-icon-button', 'admin-record-button')
    if (!button.querySelector('.admin-record-icon-stack')) {
      button.innerHTML = adminRecordIconMarkup
    }
    const caption = button
      .closest<HTMLElement>('.admin-icon-control')
      ?.querySelector<HTMLElement>('.admin-icon-caption')
    if (caption) {
      caption.textContent = confirmingFreshPass
        ? 'Confirm Fresh Pass'
        : recording
          ? recordingAudio
            ? 'Stop Audio + Timing'
            : 'Stop Recording'
          : 'Record/Edit Timing'
    }
    button.setAttribute('aria-label', label)
    button.title = label
    button.classList.toggle('is-recording', recording)
    button.classList.toggle('is-confirming', confirmingFreshPass)
  }

  const getSelectedTokenIndex = () => {
    const session = getSession()
    if (!session?.tokenKeys.length) return -1
    if (state.tokenPointer >= 0) {
      return Math.min(state.tokenPointer, session.tokenKeys.length - 1)
    }

    const activeIndex = highlightController.getActiveIndex()
    if (activeIndex < 0) return -1
    return Math.min(activeIndex, session.tokenKeys.length - 1)
  }

  const getEditableCueIndex = () => {
    if (!state.cues.length) return -1
    const selectedTokenIndex = getSelectedTokenIndex()
    if (
      selectedTokenIndex >= 0 &&
      selectedTokenIndex < state.cues.length
    ) {
      return selectedTokenIndex
    }
    return state.cues.length - 1
  }

  const isSeededFirstCuePreview = (
    session: ActiveAudioSession,
    activeIndex: number
  ) => {
    if (
      activeIndex !== 0 ||
      state.tokenPointer !== 1 ||
      state.cues.length !== 1
    ) {
      return false
    }

    const firstCue = state.cues[0]
    return Boolean(
      firstCue &&
        firstCue.timeStart === 0 &&
        session.tokenKeys[0] &&
        formatTokenKey(firstCue) === session.tokenKeys[0]
    )
  }

  const activateCueToken = (tokenKey: string) =>
    highlightController.activateTokenKey(tokenKey, {
      scroll: options.getAutoScroll(),
      scrollBehavior: 'smooth',
    })

  const focusCueRow = (index: number) => {
    if (index < 0) return
    query<HTMLElement>(
      `[data-target-id="admin-cue-list"] [data-admin-cue-index="${index}"]`
    )?.focus({ preventScroll: true })
  }

  const selectToken = async (
    index: number,
    {
      play = false,
      preservePlayback = false,
      seekToCue = true,
      focusRow = false,
      syncMode = 'full',
    }: {
      play?: boolean
      preservePlayback?: boolean
      seekToCue?: boolean
      focusRow?: boolean
      syncMode?: 'full' | 'step-back'
    } = {}
  ) => {
    const session = audioController.session
    if (!session?.tokenKeys.length) return

    const clampedIndex = Math.max(
      0,
      Math.min(index, session.tokenKeys.length - 1)
    )
    state.tokenPointer = clampedIndex
    const cue = state.cues[clampedIndex]
    if (seekToCue && cue) {
      if (!preservePlayback) audioController.pause()
      audioController.seek(cue.timeStart)
      options.onCueNavigationChange(clampedIndex)
    } else if (!play && !preservePlayback) {
      audioController.pause()
    }

    const activation = activateCueToken(session.tokenKeys[clampedIndex])
    const playback =
      play && cue && audioController.audio.paused
        ? options.playNetworkRecording(() =>
            selectToken(index, {
              play,
              preservePlayback,
              seekToCue,
              focusRow,
              syncMode,
            })
          )
        : null

    if (syncMode === 'step-back') {
      syncProgress()
      syncStepBackState()
      options.onChange('playback-progress')
    }

    await Promise.all([activation, playback])
    if (syncMode === 'full') {
      options.onChange('playback')
      syncPanel()
    }
    if (focusRow) focusCueRow(getEditableCueIndex())
  }

  const getTokenLabel = (index: number) => {
    const session = getSession()
    const cue = state.cues[index]
    const tokenKey = session?.tokenKeys[index]
    if (tokenKey) {
      const token = query<HTMLElement>(`[data-token-key="${tokenKey}"]`)
      const tokenText = token?.textContent?.trim().replace(/\s+/g, ' ')
      if (tokenText) return tokenText
    }
    if (!cue) return `Word ${index + 1}`
    return (
      `Page ${cue.pageNumber} - Line ${cue.lineIndex + 1} - ` +
      `Word ${cue.wordIndex + 1}`
    )
  }

  const getDraftStatusText = () => {
    const session = getSession()
    if (!session) return 'Drafts autosave locally per recording.'
    if (state.recordingIssueSaveError) {
      return state.recordingIssueSaveError
    }
    if (state.draftSaveError) return state.draftSaveError
    if (state.draftOrigin === 'local' && state.draftSavedAt) {
      return (
        `Local draft active for ${session.recording.title}. ` +
        `Last saved at ${draftTimeFormat.format(state.draftSavedAt)}.`
      )
    }
    if (state.sourceCues.length) {
      if (state.draftSavedAt) {
        return (
          `Published timing loaded for ${session.recording.title}. ` +
          `Last saved at ${draftTimeFormat.format(state.draftSavedAt)}.`
        )
      }
      return (
        `Published timing loaded for ${session.recording.title}. ` +
        'Last saved time unavailable. Local edits autosave in this browser.'
      )
    }
    return (
      `${session.recording.title} has no saved timing yet. ` +
      'Local edits autosave in this browser.'
    )
  }

  const syncCueListViewport = (
    list: HTMLElement,
    followCueIndex: number
  ) => {
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('.admin-cue-row')
    )
    if (!rows.length) {
      list.style.maxHeight = ''
      lastRenderedCueCount = 0
      lastFollowedCueIndex = -1
      return
    }

    const visibleRows = rows.slice(0, 5)
    const listStyles = view.getComputedStyle(list)
    const rowGap =
      Number.parseFloat(listStyles.rowGap || listStyles.gap || '0') || 0
    const viewportHeight =
      visibleRows.reduce((height, row) => height + row.offsetHeight, 0) +
      rowGap * Math.max(visibleRows.length - 1, 0)
    list.style.maxHeight = `${Math.ceil(viewportHeight)}px`

    const shouldFollow =
      followCueIndex >= 0 &&
      followCueIndex < rows.length &&
      (followCueIndex !== lastFollowedCueIndex ||
        rows.length !== lastRenderedCueCount)
    if (shouldFollow) {
      const row = rows[followCueIndex]
      const rowRect = row?.getBoundingClientRect()
      const listRect = list.getBoundingClientRect()
      if (rowRect && rowRect.top < listRect.top) {
        list.scrollTop -= listRect.top - rowRect.top
      } else if (rowRect && rowRect.bottom > listRect.bottom) {
        list.scrollTop += rowRect.bottom - listRect.bottom
      }

      view.requestAnimationFrame(() => {
        const panel = getPanel()
        if (!panel || panel.classList.contains('u-hidden')) return
        panel.scrollTop = panel.scrollHeight - panel.clientHeight
      })
      lastFollowedCueIndex = followCueIndex
    }
    lastRenderedCueCount = rows.length
  }

  const syncCueListCurrentIndex = (index: number) => {
    const panel = getPanel()
    if (!panel || panel.classList.contains('u-hidden')) return
    const list = query<HTMLElement>('[data-target-id="admin-cue-list"]')
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
      lastFollowedCueIndex === index
    ) {
      return
    }
    for (const row of currentRows) {
      if (row !== currentRow) row.classList.remove('is-current')
    }
    currentRow?.classList.add('is-current')
    syncCueListViewport(list, index)
  }

  const syncCueListSelection = (index: number) => {
    const list = query<HTMLElement>('[data-target-id="admin-cue-list"]')
    if (!list) return
    const selectedRow = list.querySelector<HTMLElement>(
      `[data-admin-cue-index="${index}"]`
    )
    for (const row of list.querySelectorAll<HTMLElement>(
      '.admin-cue-row.is-selected'
    )) {
      if (row !== selectedRow) row.classList.remove('is-selected')
    }
    selectedRow?.classList.add('is-selected')
  }

  const renderCueList = () => {
    const list = query<HTMLElement>('[data-target-id="admin-cue-list"]')
    if (!list) return
    const session = getSession()
    list.replaceChildren()

    const emptyState = document.createElement('div')
    emptyState.className = 'admin-cue-empty'
    if (!session) {
      list.style.maxHeight = ''
      emptyState.textContent = 'Select an aliyah to load timing.'
      list.appendChild(emptyState)
      lastRenderedCueCount = 0
      lastFollowedCueIndex = -1
      return
    }
    if (!state.cues.length) {
      list.style.maxHeight = ''
      emptyState.textContent =
        'No timing saved yet. Start recording, then refine it.'
      list.appendChild(emptyState)
      lastRenderedCueCount = 0
      lastFollowedCueIndex = -1
      return
    }

    const selectedCueIndex = getEditableCueIndex()
    const playingCueIndex =
      !state.recording && session.cues.length
        ? highlightController.getCueIndex(
            session.cues,
            audioController.currentTime
          )
        : -1
    let previousCue: WordCue | null = null
    state.cues.forEach((cue, index) => {
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

      const indexElement = document.createElement('span')
      indexElement.className = 'admin-cue-index'
      indexElement.textContent = `${index + 1}`
      const tokenElement = document.createElement('span')
      tokenElement.className = 'admin-cue-token'
      tokenElement.textContent = getTokenLabel(index)
      const timeElement = document.createElement('span')
      timeElement.className = 'admin-cue-time'
      timeElement.textContent = formatCueTimestamp(cue.timeStart)
      const deltaElement = document.createElement('span')
      deltaElement.className = 'admin-cue-delta'
      deltaElement.textContent = deltaText
      row.append(indexElement, tokenElement, timeElement, deltaElement)
      if (noteText) {
        const noteElement = document.createElement('span')
        noteElement.className = 'admin-cue-note'
        noteElement.textContent = noteText
        row.append(noteElement)
      }
      const rowLabel =
        `Select saved timing for ${getTokenLabel(index)} at ` +
        `${formatCueTimestamp(cue.timeStart)}` +
        (noteText ? `. ${noteText}` : '')
      row.title = rowLabel
      row.setAttribute('aria-label', rowLabel)
      list.appendChild(row)
      previousCue = cue
    })

    const followCueIndex = state.recording
      ? state.cues.length - 1
      : playingCueIndex >= 0
        ? playingCueIndex
        : selectedCueIndex
    syncCueListViewport(list, followCueIndex)
  }

  const getCurrentCueIndex = (
    session: ActiveAudioSession,
    currentTime: number
  ) => {
    let cueIndex = -1
    for (let index = 0; index < session.cues.length; index += 1) {
      if (session.cues[index].timeStart <= currentTime) cueIndex = index
      else break
    }
    return cueIndex
  }

  const syncProgress = () => {
    const session = audioController.session
    const currentTime = options.getDisplayTime()
    const duration = audioController.duration
    const progress =
      session && Number.isFinite(duration) && duration > 0
        ? Math.max(0, Math.min(1, currentTime / duration))
        : 0
    const cueIndex = session
      ? getCurrentCueIndex(session, currentTime)
      : -1
    const wordProgress = getWordProgress({
      cueIndex,
      cueCount: session?.cues.length ?? 0,
      tokenCount: session?.tokenKeys.length ?? 0,
    })
    query<HTMLElement>('[data-target-id="admin-progress"]')?.style.setProperty(
      '--audio-progress-ratio',
      `${progress}`
    )
    query<HTMLElement>('[data-target-id="admin-progress"]')?.style.setProperty(
      '--cue-progress-ratio',
      `${wordProgress.ratio}`
    )
    const wordLabel = query<HTMLElement>(
      '[data-target-id="admin-meta-cues"]'
    )
    const durationLabel = query<HTMLElement>(
      '[data-target-id="admin-meta-duration"]'
    )
    if (wordLabel) {
      wordLabel.textContent = wordProgress.label
    }
    if (durationLabel) {
      durationLabel.textContent = session
        ? `${options.formatDuration(currentTime)} / ${options.formatDuration(
            duration
          )}`
        : '0:00 / 0:00'
    }
  }

  const hasLocalCueChanges = () =>
    state.cues.length > 0 &&
    !areCueDraftsEquivalent(state.cues, state.sourceCues)

  function syncPanel() {
    const session = getSession()
    const tokenCount = session?.tokenKeys.length ?? 0
    const hasSession = Boolean(session && tokenCount)
    const hasCues = state.cues.length > 0
    const hasIncompleteDraft =
      hasSession && hasCues && state.cues.length < tokenCount
    const canResumeDraft = hasIncompleteDraft && !state.recording
    const canStepBack = hasSession && state.tokenPointer >= 0
    const microphoneTransitioning =
      microphoneCapture.state === 'starting' ||
      microphoneCapture.state === 'stopping'
    const recordingMicrophone = isMicrophoneRecordingForSession(session)
    const counter = required<HTMLElement>(
      '[data-target-id="admin-cue-count"]'
    )
    const status = required<HTMLElement>('[data-target-id="admin-status"]')
    const recordButton = required<HTMLButtonElement>(
      '[data-target-id="admin-record"]'
    )
    const stepBackButton = required<HTMLButtonElement>(
      '[data-target-id="admin-step-back"]'
    )
    const undoButton = required<HTMLButtonElement>(
      '[data-target-id="admin-undo"]'
    )
    const resetButton = required<HTMLButtonElement>(
      '[data-target-id="admin-reset"]'
    )
    const exportButton = required<HTMLButtonElement>(
      '[data-target-id="admin-export"]'
    )
    const prevSavedButton = query<HTMLButtonElement>(
      '[data-target-id="admin-prev-saved"]'
    )
    const playCurrentButton = query<HTMLButtonElement>(
      '[data-target-id="admin-play-current"]'
    )
    const nextSavedButton = query<HTMLButtonElement>(
      '[data-target-id="admin-next-saved"]'
    )
    const trimHereButton = query<HTMLButtonElement>(
      '[data-target-id="admin-trim-here"]'
    )
    const markIssueButton = query<HTMLButtonElement>(
      '[data-target-id="admin-mark-issue"]'
    )
    const draftStatus = query<HTMLElement>(
      '[data-target-id="admin-draft-status"]'
    )
    const resumeDraftWrap = query<HTMLElement>(
      '[data-target-id="admin-resume-wrap"]'
    )
    const resumeDraftButton = query<HTMLButtonElement>(
      '[data-target-id="admin-resume-draft"]'
    )
    const syncNote = query<HTMLElement>(
      '[data-target-id="admin-sync-note"]'
    )
    const selectedCueIndex = getEditableCueIndex()
    const hasSelectedCue = selectedCueIndex >= 0
    const hasNextSavedCue =
      hasSelectedCue && selectedCueIndex < state.cues.length - 1
    const hasPreviousSavedCue = hasSelectedCue && selectedCueIndex > 0

    if (!hasSession) {
      counter.textContent = '0 Words'
      status.textContent =
        'Select an aliyah and press play to start timing words.'
    } else if (state.recording) {
      const pointer =
        Math.max(
          1,
          Math.min(
            (state.tokenPointer >= 0
              ? state.tokenPointer
              : state.cues.length) + 1,
            tokenCount
          )
        ) || 1
      status.textContent =
        `${session!.recording.title}: recording ` +
        `${recordingMicrophone ? 'audio + ' : ''}Word ${pointer}. ` +
        'Space or Right Arrow saves the current time; Left Arrow steps back.'
      updateCounter(tokenCount)
    } else if (state.cues.length === tokenCount && tokenCount > 0) {
      status.textContent =
        `${session!.recording.title}: all ${tokenCount} Words are timed. ` +
        'Select one to play, adjust, or export.'
      updateCounter(tokenCount)
    } else {
      const pointer =
        state.cues.length < tokenCount
          ? Math.min(state.cues.length + 1, tokenCount)
          : tokenCount
      status.textContent = hasCues
        ? `${session!.recording.title}: ${state.cues.length}/${tokenCount} ` +
          `Words saved. Resume from Word ${pointer}, or select one to refine.`
        : `${session!.recording.title}: ready to time. ` +
          'Press Record/Edit Timing to begin.'
      updateCounter(tokenCount)
    }

    recordButton.disabled = !hasSession || microphoneTransitioning
    stepBackButton.disabled = !canStepBack
    undoButton.disabled = !hasCues
    resetButton.disabled =
      !hasCues && !state.recording && state.tokenPointer < 0
    exportButton.disabled = !hasSession || !hasCues
    const localCueChanges = hasLocalCueChanges()
    exportButton.classList.add('admin-export-button')
    exportButton.classList.toggle(
      'has-local-cue-diff',
      localCueChanges
    )
    const exportLabel = localCueChanges
      ? 'Export local cue changes that differ from published cue data'
      : 'Export the current timing draft as cue data'
    exportButton.setAttribute('aria-label', exportLabel)
    exportButton.title = exportLabel
    if (resumeDraftWrap) resumeDraftWrap.hidden = !canResumeDraft
    if (resumeDraftButton) {
      resumeDraftButton.disabled = !canResumeDraft
      if (!resumeDraftButton.querySelector('.admin-action-icon')) {
        resumeDraftButton.innerHTML = adminResumeIconMarkup
      }
      const resumeDraftLabel = canResumeDraft
        ? `Resume timing draft from Word ${state.cues.length + 1}`
        : 'Resume the incomplete timing draft from the next unsaved word'
      resumeDraftButton.setAttribute('aria-label', resumeDraftLabel)
      resumeDraftButton.title = resumeDraftLabel
    }
    if (prevSavedButton) {
      prevSavedButton.disabled = !hasPreviousSavedCue
    }
    if (playCurrentButton) {
      playCurrentButton.disabled = !hasSelectedCue
    }
    if (nextSavedButton) nextSavedButton.disabled = !hasNextSavedCue
    if (trimHereButton) trimHereButton.disabled = !hasSelectedCue
    if (markIssueButton) markIssueButton.disabled = !hasSession
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-admin-nudge]'
    )) {
      button.disabled = !hasSelectedCue
    }
    if (draftStatus) draftStatus.textContent = getDraftStatusText()
    if (syncNote) syncNote.hidden = !state.recording
    syncMicrophoneCaptureUi(session)
    renderCueList()
    syncProgress()
    if (isVisible()) scheduleWaveformRender()
    setRecordButtonState(
      recordButton,
      state.recording,
      isMicrophoneRecordingForSession(session),
      microphoneReplacementAudioId === session?.recording.id
    )
    options.onChange('mode')
  }

  const syncStepBackState = () => {
    const session = getSession()
    if (!session?.tokenKeys.length) return
    const tokenCount = session.tokenKeys.length
    const pointer = Math.max(
      1,
      Math.min(state.tokenPointer + 1, tokenCount)
    )
    const selectedCueIndex = getEditableCueIndex()
    const hasSelectedCue = selectedCueIndex >= 0
    const status = query<HTMLElement>('[data-target-id="admin-status"]')
    const stepBackButton = query<HTMLButtonElement>(
      '[data-target-id="admin-step-back"]'
    )
    const prevSavedButton = query<HTMLButtonElement>(
      '[data-target-id="admin-prev-saved"]'
    )
    const playCurrentButton = query<HTMLButtonElement>(
      '[data-target-id="admin-play-current"]'
    )
    const nextSavedButton = query<HTMLButtonElement>(
      '[data-target-id="admin-next-saved"]'
    )
    const trimHereButton = query<HTMLButtonElement>(
      '[data-target-id="admin-trim-here"]'
    )
    if (status) {
      status.textContent =
        `${session.recording.title}: recording ` +
        `${isMicrophoneRecordingForSession(session) ? 'audio + ' : ''}` +
        `Word ${pointer}. Space or Right Arrow saves the current time; ` +
        'Left Arrow steps back.'
    }
    updateCounter(tokenCount)
    if (stepBackButton) stepBackButton.disabled = state.tokenPointer < 0
    if (prevSavedButton) prevSavedButton.disabled = selectedCueIndex <= 0
    if (playCurrentButton) {
      playCurrentButton.disabled = !hasSelectedCue
    }
    if (nextSavedButton) {
      nextSavedButton.disabled =
        !hasSelectedCue || selectedCueIndex >= state.cues.length - 1
    }
    if (trimHereButton) trimHereButton.disabled = !hasSelectedCue
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-admin-nudge]'
    )) {
      button.disabled = !hasSelectedCue
    }
    syncCueListSelection(selectedCueIndex)
  }

  const resumeDraft = async () => {
    const session = audioController.session
    if (!session?.tokenKeys.length || !state.cues.length) return
    state.recording = false
    const lastSavedCueIndex = Math.max(
      0,
      Math.min(state.cues.length - 1, session.tokenKeys.length - 1)
    )
    await selectToken(lastSavedCueIndex, { play: true })
    options.focusReader()
  }

  const resetRecorder = async ({
    playSource = true,
    scrollBehavior = 'smooth',
  }: {
    playSource?: boolean
    scrollBehavior?: ScrollBehavior
  } = {}) => {
    const session = audioController.session
    if (!session) return

    const startingCues = session.tokenKeys[0]
      ? [cueFromTokenKey(session.tokenKeys[0], 0)]
      : []
    assignCues(startingCues)
    state.tokenPointer =
      session.tokenKeys.length > 1
        ? 1
        : session.tokenKeys.length
          ? 0
          : -1
    state.recording = session.tokenKeys.length > 1
    options.onCueNavigationChange(startingCues.length ? 0 : null)
    audioController.pause()
    audioController.seek(0)

    const activeTokenKey = session.tokenKeys[0] ?? null
    if (activeTokenKey) {
      await highlightController.activateTokenKey(activeTokenKey, {
        scroll: true,
        scrollBehavior,
      })
    } else {
      highlightController.clear()
    }
    options.focusReader()
    saveDraft()
    if (playSource) {
      await options.playNetworkRecording(() =>
        resetRecorder({ playSource, scrollBehavior })
      )
    }
    options.onChange('playback')
    syncPanel()
  }

  const startMicrophoneTimingPass = async ({
    confirmReplacement = true,
  }: {
    confirmReplacement?: boolean
  } = {}) => {
    const session = getSession()
    if (!session?.tokenKeys.length) return false

    if (
      confirmReplacement &&
      state.cues.length &&
      microphoneReplacementAudioId !== session.recording.id
    ) {
      microphoneReplacementAudioId = session.recording.id
      syncPanel()
      return false
    }
    if (!confirmReplacement) microphoneReplacementAudioId = null

    microphoneCaptureError = null
    const startTask = microphoneCapture.start()
    syncPanel()
    try {
      await startTask
    } catch (error) {
      microphoneCaptureError = getMicrophoneCaptureErrorMessage(error)
      console.error('Failed to start microphone audio capture', error)
      syncPanel()
      return false
    }
    if (microphoneCapture.state !== 'recording') {
      syncPanel()
      return false
    }

    microphoneReplacementAudioId = null
    microphoneAudioId = session.recording.id
    capturedAudio = null
    resetExportDownloadLinks()
    try {
      await resetRecorder({
        playSource: false,
        scrollBehavior: 'auto',
      })
      return true
    } catch (error) {
      state.recording = false
      try {
        await microphoneCapture.stop()
        microphoneCapture.clear()
      } catch (stopError) {
        console.error(
          'Failed to stop microphone capture after setup failed',
          stopError
        )
      }
      microphoneAudioId = null
      microphoneCaptureError = getMicrophoneCaptureErrorMessage(error)
      console.error('Failed to prepare the synchronized timing pass', error)
      syncPanel()
      return false
    }
  }

  const stopRecording = async () => {
    if (!state.recording && !isMicrophoneCaptureActive()) return false
    state.recording = false
    audioController.pause()
    options.onChange('playback')
    syncPanel()
    if (!isMicrophoneCaptureActive()) return true

    const audioId = microphoneAudioId
    try {
      const capture = await microphoneCapture.stop()
      if (capture && audioId) capturedAudio = { audioId, capture }
      microphoneCaptureError = null
    } catch (error) {
      microphoneCaptureError = getMicrophoneCaptureErrorMessage(error)
      console.error('Failed to finalize microphone audio capture', error)
      throw error
    } finally {
      microphoneAudioId = null
      syncPanel()
    }
    return true
  }

  const exportCues = async () => {
    const session = audioController.session
    if (!session) return

    let audioFinalizationFailed = false
    try {
      await stopRecording()
    } catch {
      audioFinalizationFailed = true
    }
    const readyAudio =
      capturedAudio?.audioId === session.recording.id
        ? capturedAudio.capture
        : null
    const exportCues = normalizeFirstCueStart(state.cues).map(
      (cue, index) => ({
        cueNumber: index + 1,
        timeStart: cue.timeStart,
        ...(cue.timeEnd === undefined ? {} : { timeEnd: cue.timeEnd }),
        pageNumber: cue.pageNumber,
        lineIndex: cue.lineIndex,
        fragmentIndex: cue.fragmentIndex,
        wordIndex: cue.wordIndex,
      })
    )
    const payload: CueExportPayload = {
      audioId: session.recording.id,
      audioFormat:
        readyAudio?.fileExtension === 'm4a'
          ? 'm4a'
          : session.recording.format,
      narratorId: session.recording.narratorId,
      readingId: session.recording.reading.id,
      aliyah: session.recording.aliyah,
      tokenCount: session.tokenKeys.length,
      cueCount: exportCues.length,
      tokenizationVersion: TOKENIZATION_VERSION,
      ...(!readyAudio && session.recording.mediaIdentity
        ? { mediaIdentity: session.recording.mediaIdentity }
        : {}),
      ...(!readyAudio && session.recording.notes
        ? { audioVersion: session.recording.notes }
        : {}),
      savedAt: new Date().toISOString(),
      issues: [...options.getRecordingIssues()],
      cues: exportCues,
    }

    const modal = required<HTMLElement>('[data-target-id="export-modal"]')
    const status = required<HTMLElement>(
      '[data-target-id="export-copy-status"]'
    )
    const targetPath = required<HTMLElement>(
      '[data-target-id="export-target-path"]'
    )
    const textarea = required<HTMLTextAreaElement>(
      '[data-target-id="export-text"]'
    )
    const downloadLink = required<HTMLAnchorElement>(
      '[data-target-id="export-download"]'
    )
    const audioDownloadLink = required<HTMLAnchorElement>(
      '[data-target-id="export-audio-download"]'
    )
    const audioStatus = required<HTMLElement>(
      '[data-target-id="export-audio-status"]'
    )
    const exportPath = cueFileRelativePath(session.recording)
    const exportFileName =
      exportPath.split('/').pop() ?? 'audio-cues.json'
    const serialized = formatCueFileJson(payload)
    resetExportDownloadLinks()
    const cueDownloadUrl = URL.createObjectURL(
      new Blob([serialized], { type: 'application/json' })
    )
    exportDownloadUrl = cueDownloadUrl
    downloadLink.href = cueDownloadUrl
    downloadLink.download = exportFileName

    let capturedAudioFileName: string | null = null
    if (readyAudio) {
      capturedAudioFileName =
        `${session.recording.id.replace(/[^a-z0-9._-]+/gi, '-')}` +
        `-recorded.${readyAudio.fileExtension}`
      const audioUrl = URL.createObjectURL(readyAudio.blob)
      exportAudioDownloadUrl = audioUrl
      audioDownloadLink.href = audioUrl
      audioDownloadLink.download = capturedAudioFileName
      audioDownloadLink.classList.remove('u-hidden')
      const conversionNote =
        readyAudio.fileExtension === session.recording.format
          ? ''
          : ` Convert it to ${session.recording.format.toUpperCase()} before publishing this recording.`
      audioStatus.textContent =
        `Recorded audio: ${capturedAudioFileName} ` +
        `(${options.formatDuration(readyAudio.durationSeconds)}).` +
        conversionNote
      audioStatus.hidden = false
    }
    targetPath.textContent = exportPath
    textarea.value = serialized
    modal.classList.remove('u-hidden')
    view.setTimeout(() => textarea.select(), 0)
    const copiedMessage =
      `Copied to clipboard. Paste into ${exportPath}.` +
      (capturedAudioFileName
        ? ' The synchronized audio file is ready to download.'
        : '') +
      (audioFinalizationFailed
        ? ' The microphone audio could not be finalized.'
        : '')
    const blockedMessage =
      `Automatic clipboard copy was blocked. Paste the JSON below into ${exportPath}.` +
      (capturedAudioFileName
        ? ' The synchronized audio file is ready to download.'
        : '') +
      (audioFinalizationFailed
        ? ' The microphone audio could not be finalized.'
        : '')
    try {
      await view.navigator.clipboard.writeText(serialized)
      status.textContent = copiedMessage
    } catch {
      status.textContent = blockedMessage
    }
  }

  const getCueClockSeconds = (session: ActiveAudioSession) =>
    isMicrophoneRecordingForSession(session)
      ? microphoneCapture.elapsedSeconds
      : audioController.currentTime

  const recordNextCue = () => {
    const session = audioController.session
    if (!session) return
    const activeIndex = highlightController.getActiveIndex()
    const currentIndex = isSeededFirstCuePreview(session, activeIndex)
      ? state.tokenPointer
      : activeIndex >= 0
        ? Math.min(activeIndex + 1, session.tokenKeys.length - 1)
        : state.tokenPointer >= 0
          ? state.tokenPointer
          : 0
    const tokenKey = session.tokenKeys[currentIndex]
    if (!tokenKey) return
    const position = parseTokenKey(tokenKey)
    if (!position) throw new TypeError(`Invalid token key: ${tokenKey}`)
    state.cues[currentIndex] = {
      timeStart: roundCueTime(getCueClockSeconds(session)),
      ...position,
    }
    waveformContentRevision += 1
    state.tokenPointer = Math.min(
      currentIndex + 1,
      session.tokenKeys.length - 1
    )
    void activateCueToken(tokenKey)
    saveDraft()
    options.onChange('playback')
    syncPanel()
  }

  const stepBack = () => {
    const session = audioController.session
    if (!session?.tokenKeys.length) return
    const recordingMicrophone = isMicrophoneRecordingForSession(session)
    const selectedCueIndex = getEditableCueIndex()
    const targetIndex =
      selectedCueIndex > 0
        ? selectedCueIndex - 1
        : state.tokenPointer <= 0
          ? 0
          : Math.max(0, state.tokenPointer - 1)
    void selectToken(targetIndex, {
      play: !recordingMicrophone,
      preservePlayback: true,
      seekToCue: !recordingMicrophone,
      syncMode: state.recording ? 'step-back' : 'full',
    })
  }

  const undoLastCue = () => {
    const session = audioController.session
    state.cues.pop()
    waveformContentRevision += 1
    state.tokenPointer = state.cues.length
      ? Math.min(
          state.cues.length,
          (session?.tokenKeys.length ?? 1) - 1
        )
      : -1
    saveDraft()
    const tokenKey =
      session?.tokenKeys[state.tokenPointer] ??
      session?.tokenKeys[0] ??
      null
    if (tokenKey) void activateCueToken(tokenKey)
    else highlightController.clear()
    options.onChange('playback')
    syncPanel()
  }

  const trimCuesFromSelection = () => {
    const session = audioController.session
    if (!session) return
    const selectedCueIndex = getEditableCueIndex()
    if (selectedCueIndex < 0) return
    assignCues(state.cues.slice(0, selectedCueIndex))
    state.tokenPointer = Math.min(
      selectedCueIndex,
      session.tokenKeys.length - 1
    )
    state.recording = false
    saveDraft()
    void selectToken(state.tokenPointer, { seekToCue: false })
  }

  const nudgeCue = (deltaSeconds: number) => {
    const session = audioController.session
    if (!session) return
    const selectedCueIndex = getEditableCueIndex()
    const cue =
      selectedCueIndex >= 0 ? state.cues[selectedCueIndex] : null
    if (!cue) return
    const previousTime =
      selectedCueIndex > 0
        ? state.cues[selectedCueIndex - 1].timeStart + 0.01
        : 0
    const nextTime =
      selectedCueIndex < state.cues.length - 1
        ? state.cues[selectedCueIndex + 1].timeStart - 0.01
        : Number.isFinite(audioController.duration) &&
            audioController.duration > 0
          ? audioController.duration
          : Number.POSITIVE_INFINITY
    const proposedTime = cue.timeStart + deltaSeconds
    const boundedTime =
      nextTime >= previousTime
        ? Math.max(previousTime, Math.min(nextTime, proposedTime))
        : proposedTime
    cue.timeStart = roundCueTime(boundedTime)
    waveformContentRevision += 1
    audioController.pause()
    audioController.seek(cue.timeStart)
    options.onCueNavigationChange(selectedCueIndex)
    saveDraft()
    void highlightController.activateCue(cue, {
      scroll: options.getAutoScroll(),
    })
    options.onChange('playback')
    syncPanel()
  }

  const issueKindLabel = (kind: RecordingIssueKind) =>
    recordingIssueReaderLabel({ kind }).replace(/\bhere$/, '').trim()

  const closeIssueModal = () => {
    query<HTMLElement>(
      '[data-target-id="recording-issue-modal"]'
    )?.classList.add('u-hidden')
    pendingIssueTokenKey = null
    pendingIssueTimeStart = undefined
  }

  const saveIssue = (kind: RecordingIssueKind) => {
    const session = audioController.session
    if (!session || !pendingIssueTokenKey) return
    const note = query<HTMLInputElement>(
      '[data-target-id="recording-issue-note"]'
    )
    const readerVisible = query<HTMLInputElement>(
      '[data-target-id="recording-issue-reader-visible"]'
    )
    const issue = createRecordingIssue({
      audioId: session.recording.id,
      tokenKey: pendingIssueTokenKey,
      timeStart: pendingIssueTimeStart,
      kind,
      visibility: readerVisible?.checked
        ? 'readerVisible'
        : 'authoringOnly',
      severity: kind === 'other' ? 'low' : 'medium',
      note: note?.value.trim() || undefined,
      createdAt: Date.now(),
      tokenizationVersion: TOKENIZATION_VERSION,
    })
    const nextIssues = [
      ...options
        .getRecordingIssues()
        .filter(
          (candidate) =>
            !(
              candidate.tokenKey === issue.tokenKey &&
              candidate.kind === issue.kind
            )
        ),
      issue,
    ]
    try {
      saveRecordingIssues(
        options.localStorage,
        session.recording.id,
        nextIssues
      )
    } catch (error) {
      state.recordingIssueSaveError =
        'This recording note could not be saved locally. Keep this dialog open and retry.'
      console.error(
        `Failed to save recording issues for ${session.recording.id}`,
        error
      )
      syncPanel()
      return
    }
    state.recordingIssueSaveError = null
    waveformContentRevision += 1
    options.onRecordingIssuesChanged(nextIssues)
    renderCueList()
    renderWaveform()
    closeIssueModal()
  }

  const openIssueModal = () => {
    const session = audioController.session
    if (!session) return
    const tokenKey = options.getActiveTokenKey()
    if (!tokenKey) return
    const cue = session.cues.find(
      (candidate) => formatTokenKey(candidate) === tokenKey
    )
    pendingIssueTokenKey = tokenKey
    pendingIssueTimeStart = cue?.timeStart ?? audioController.currentTime
    const modal = query<HTMLElement>(
      '[data-target-id="recording-issue-modal"]'
    )
    const issueOptions = query<HTMLElement>(
      '[data-target-id="recording-issue-options"]'
    )
    const note = query<HTMLInputElement>(
      '[data-target-id="recording-issue-note"]'
    )
    if (!modal || !issueOptions || !note) return

    note.value = ''
    issueOptions.replaceChildren()
    for (const kind of recordingIssueKinds) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'recording-issue-option'
      button.dataset.issueKind = kind
      button.textContent = issueKindLabel(kind)
      button.addEventListener('click', () => saveIssue(kind), {
        signal: scope.signal,
      })
      issueOptions.appendChild(button)
    }
    modal.classList.remove('u-hidden')
    issueOptions
      .querySelector<HTMLButtonElement>('button')
      ?.focus({ preventScroll: true })
  }

  const waveformSummaryKey = (session: ActiveAudioSession) => {
    const mediaIdentity = session.recording.mediaIdentity
    const mediaVersion = mediaIdentity
      ? `${mediaIdentity.algorithm}:${mediaIdentity.digest}:${mediaIdentity.byteLength}`
      : session.recording.playSrc
    return `${session.recording.id}:${mediaVersion}`
  }

  const getWaveformSummaryLoader = (session: ActiveAudioSession) => {
    const key = waveformSummaryKey(session)
    const existing = waveformSummaryLoaders.get(key)
    if (existing) return existing
    const loader = new WaveformSummaryLoader((signal) =>
      decodeWaveformSummary({
        audioId: session.recording.id,
        src: session.recording.playSrc,
        bucketCount: WAVEFORM_SUMMARY_BUCKETS,
        signal,
      })
    )
    waveformSummaryLoaders.set(key, loader)
    return loader
  }

  const rememberWaveformSummary = (
    key: string,
    summary: WaveformSummary
  ) => {
    waveformSummaryCache.delete(key)
    waveformSummaryCache.set(key, summary)
    while (
      waveformSummaryCache.size > MAX_WAVEFORM_SUMMARY_CACHE_ENTRIES
    ) {
      const oldestKey = waveformSummaryCache.keys().next().value
      if (!oldestKey) break
      const oldestSummary = waveformSummaryCache.get(oldestKey)
      waveformSummaryCache.delete(oldestKey)
      if (oldestSummary) {
        waveformWindowCache.delete(oldestSummary.audioId)
      }
    }
  }

  const cancelObsoleteWaveformLoads = (activeKey: string | null) => {
    for (const [key, loader] of waveformSummaryLoaders) {
      if (key === activeKey) continue
      loader.cancel(key)
      waveformSummaryLoaders.delete(key)
    }
  }

  const requestWaveformSummaryRender = (
    session: ActiveAudioSession,
    { retry = false }: { retry?: boolean } = {}
  ) => {
    const key = waveformSummaryKey(session)
    cancelObsoleteWaveformLoads(key)
    const loader = getWaveformSummaryLoader(session)
    const request = retry ? loader.retry(key) : loader.load(key)
    void request.then((summary) => {
      if (scope.signal.aborted) return
      if (summary) rememberWaveformSummary(key, summary)
      if (
        audioController.session === session &&
        waveformSummaryKey(session) === key
      ) {
        renderWaveform()
      }
    })
  }

  const clampWaveformTime = (value: number, duration: number) => {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(duration, value))
  }

  const getCenteredWaveformWindow = (
    focusTime: number,
    duration: number
  ): WaveformWindow => {
    const windowDuration = Math.min(duration, WAVEFORM_AUTO_WINDOW_SECONDS)
    const unclampedStart = focusTime - windowDuration / 2
    const steppedStart =
      Math.floor(unclampedStart / WAVEFORM_WINDOW_STEP_SECONDS) *
      WAVEFORM_WINDOW_STEP_SECONDS
    const start = Math.max(
      0,
      Math.min(duration - windowDuration, steppedStart)
    )
    return {
      start,
      end: start + windowDuration,
      zoomed: true,
    }
  }

  const getFollowedWaveformWindow = ({
    previousWindow,
    focusTime,
    duration,
  }: {
    previousWindow: WaveformWindow
    focusTime: number
    duration: number
  }) => {
    const windowDuration = previousWindow.end - previousWindow.start
    if (
      windowDuration <= 0 ||
      focusTime < previousWindow.start ||
      focusTime > previousWindow.end
    ) {
      return getCenteredWaveformWindow(focusTime, duration)
    }
    const focusRatio =
      (focusTime - previousWindow.start) / windowDuration
    const targetRatio =
      focusRatio < WAVEFORM_FOLLOW_LEFT_RATIO
        ? WAVEFORM_FOLLOW_BACKWARD_TARGET_RATIO
        : focusRatio > WAVEFORM_FOLLOW_RIGHT_RATIO
          ? WAVEFORM_FOLLOW_FORWARD_TARGET_RATIO
          : null
    if (targetRatio === null) return previousWindow
    const unclampedStart = focusTime - windowDuration * targetRatio
    const steppedStart =
      Math.floor(unclampedStart / WAVEFORM_WINDOW_STEP_SECONDS) *
      WAVEFORM_WINDOW_STEP_SECONDS
    const start = Math.max(
      0,
      Math.min(duration - windowDuration, steppedStart)
    )
    return {
      start,
      end: start + windowDuration,
      zoomed: true,
    }
  }

  const getWaveformWindow = (duration: number): WaveformWindow => {
    const audioId = audioController.session?.recording.id ?? null
    if (duration <= WAVEFORM_FULL_VIEW_MAX_SECONDS) {
      if (audioId) waveformWindowCache.delete(audioId)
      return { start: 0, end: duration, zoomed: false }
    }
    const focusTime = clampWaveformTime(
      audioController.currentTime,
      duration
    )
    if (
      !audioId ||
      audioController.audio.paused ||
      audioController.audio.ended
    ) {
      const centeredWindow = getCenteredWaveformWindow(
        focusTime,
        duration
      )
      if (audioId) waveformWindowCache.set(audioId, centeredWindow)
      return centeredWindow
    }
    const previousWindow = waveformWindowCache.get(audioId)
    const nextWindow = previousWindow
      ? getFollowedWaveformWindow({
          previousWindow,
          focusTime,
          duration,
        })
      : getCenteredWaveformWindow(focusTime, duration)
    waveformWindowCache.set(audioId, nextWindow)
    return nextWindow
  }

  const timeToWaveformWindowRatio = (
    time: number,
    window: WaveformWindow
  ) => {
    if (time < window.start || time > window.end) return null
    return (time - window.start) / Math.max(window.end - window.start, 1)
  }

  const getWaveformWindowBars = (
    summary: WaveformSummary,
    window: WaveformWindow,
    timelineDuration: number
  ) => {
    if (
      !summary.buckets.length ||
      summary.duration <= 0 ||
      timelineDuration <= 0
    ) {
      return []
    }
    const count = Math.max(2, WAVEFORM_VISIBLE_BARS)
    const windowDuration = Math.max(window.end - window.start, 0.001)
    const peaks = Array.from({ length: count }, (_, index) => {
      const ratio = index / (count - 1)
      const timelineTime = window.start + ratio * windowDuration
      const summaryTime =
        (timelineTime / timelineDuration) * summary.duration
      const summaryRatio = summaryTime / summary.duration
      const rawIndex = Math.max(
        0,
        Math.min(
          summary.buckets.length - 1,
          summaryRatio * (summary.buckets.length - 1)
        )
      )
      const lowerIndex = Math.floor(rawIndex)
      const upperIndex = Math.min(
        summary.buckets.length - 1,
        lowerIndex + 1
      )
      const mix = rawIndex - lowerIndex
      const lowerPeak = summary.buckets[lowerIndex] ?? 0
      const upperPeak = summary.buckets[upperIndex] ?? lowerPeak
      return lowerPeak + (upperPeak - lowerPeak) * mix
    })
    return peaks.map((peak, index) => {
      const previous = peaks[index - 1] ?? peak
      const next = peaks[index + 1] ?? peak
      return Number(((previous + peak * 2 + next) / 4).toFixed(3))
    })
  }

  const createWaveformBars = (peaks: number[]) =>
    peaks.map((peak) => {
      const bar = document.createElement('span')
      bar.className = 'admin-waveform-bar'
      bar.style.setProperty('--waveform-peak', `${peak}`)
      return bar
    })

  function renderWaveform() {
    const session = getSession()
    const lane = query<HTMLElement>(
      '[data-target-id="admin-waveform-lane"]'
    )
    const bars = query<HTMLElement>(
      '[data-target-id="admin-waveform-bars"]'
    )
    const status = query<HTMLElement>(
      '[data-target-id="admin-waveform-status"]'
    )
    if (!lane || !bars || !status) return

    const clearWaveform = () => {
      bars.replaceChildren()
      delete bars.dataset.audioId
      delete bars.dataset.windowStart
      delete bars.dataset.windowEnd
      delete lane.dataset.windowStart
      delete lane.dataset.windowEnd
      delete bars.dataset.contentRevision
      delete bars.dataset.summaryAudioId
      delete bars.dataset.summaryKey
      status.onclick = null
      status.onkeydown = null
      status.removeAttribute('role')
      status.removeAttribute('tabindex')
    }

    if (!session) {
      cancelObsoleteWaveformLoads(null)
      clearWaveform()
      status.textContent = 'Load a recording to show the waveform.'
      return
    }

    const hasMicrophoneAudio =
      isMicrophoneRecordingForSession(session) ||
      capturedAudio?.audioId === session.recording.id
    if (hasMicrophoneAudio) {
      cancelObsoleteWaveformLoads(null)
      clearWaveform()
      status.textContent = isMicrophoneRecordingForSession(session)
        ? 'Recording live microphone audio. Stop or Export to finish the new audio file.'
        : 'The new microphone audio is ready to export; the catalog waveform is hidden for this pass.'
      return
    }

    const summaryKey = waveformSummaryKey(session)
    cancelObsoleteWaveformLoads(summaryKey)
    const summaryLoader = getWaveformSummaryLoader(session)
    const summaryState = summaryLoader.state(summaryKey)
    const summary = waveformSummaryCache.get(summaryKey)
    const duration =
      Number.isFinite(audioController.duration) &&
      audioController.duration > 0
        ? audioController.duration
        : summary?.duration
    const safeDuration = duration && duration > 0 ? duration : 1
    const visibleWindow = getWaveformWindow(safeDuration)
    lane.dataset.windowStart = `${visibleWindow.start}`
    lane.dataset.windowEnd = `${visibleWindow.end}`
    const windowChanged =
      bars.dataset.audioId !== session.recording.id ||
      bars.dataset.windowStart !== lane.dataset.windowStart ||
      bars.dataset.windowEnd !== lane.dataset.windowEnd
    const summaryChanged =
      bars.dataset.summaryKey !== (summary ? summaryKey : '')
    if (summary && (windowChanged || summaryChanged)) {
      const visiblePeaks = getWaveformWindowBars(
        summary,
        visibleWindow,
        safeDuration
      )
      bars.replaceChildren(...createWaveformBars(visiblePeaks))
      bars.dataset.audioId = summary.audioId
      bars.dataset.windowStart = lane.dataset.windowStart
      bars.dataset.windowEnd = lane.dataset.windowEnd
      bars.dataset.summaryAudioId = summary.audioId
      bars.dataset.summaryKey = summaryKey
      delete bars.dataset.contentRevision
    } else if (!summary && (windowChanged || summaryChanged)) {
      bars.replaceChildren()
      bars.dataset.audioId = session.recording.id
      bars.dataset.windowStart = lane.dataset.windowStart
      bars.dataset.windowEnd = lane.dataset.windowEnd
      bars.dataset.summaryAudioId = ''
      bars.dataset.summaryKey = ''
      delete bars.dataset.contentRevision
    }

    const nextStatus = summary
      ? visibleWindow.zoomed
        ? `Waveform lane - ${options.formatDuration(
            visibleWindow.start
          )}-${options.formatDuration(visibleWindow.end)}`
        : 'Waveform lane - full recording'
      : summaryState.status === 'failed'
        ? 'Waveform unavailable - activate to retry'
        : 'Preparing waveform...'
    if (status.textContent !== nextStatus) status.textContent = nextStatus
    if (summaryState.status === 'failed') {
      const retry = () =>
        requestWaveformSummaryRender(session, { retry: true })
      status.setAttribute('role', 'button')
      status.tabIndex = 0
      status.onclick = retry
      status.onkeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        retry()
      }
    } else {
      status.onclick = null
      status.onkeydown = null
      status.removeAttribute('role')
      status.removeAttribute('tabindex')
    }
    if (!summary && summaryState.status === 'idle') {
      requestWaveformSummaryRender(session)
    }

    if (
      bars.dataset.contentRevision !== `${waveformContentRevision}`
    ) {
      bars
        .querySelectorAll(
          '.admin-waveform-cue, .admin-waveform-issue'
        )
        .forEach((node) => node.remove())
      for (const cue of state.cues) {
        const ratio = timeToWaveformWindowRatio(
          cue.timeStart,
          visibleWindow
        )
        if (ratio === null) continue
        const marker = document.createElement('span')
        marker.className = 'admin-waveform-cue'
        marker.style.setProperty(
          '--timeline-ratio',
          `${Math.max(0, Math.min(1, ratio))}`
        )
        bars.appendChild(marker)
      }
      for (const issue of options.getRecordingIssues()) {
        if (issue.timeStart === undefined) continue
        const ratio = timeToWaveformWindowRatio(
          issue.timeStart,
          visibleWindow
        )
        if (ratio === null) continue
        const marker = document.createElement('span')
        marker.className = 'admin-waveform-issue'
        marker.title = recordingIssueReaderLabel(issue)
        marker.style.setProperty(
          '--timeline-ratio',
          `${Math.max(0, Math.min(1, ratio))}`
        )
        bars.appendChild(marker)
      }
      bars.dataset.contentRevision = `${waveformContentRevision}`
    }

    const playheadRatio = timeToWaveformWindowRatio(
      audioController.currentTime,
      visibleWindow
    )
    const existingPlayhead = bars.querySelector<HTMLElement>(
      '.admin-waveform-playhead'
    )
    if (playheadRatio === null) {
      existingPlayhead?.remove()
    } else {
      const playhead =
        existingPlayhead ?? document.createElement('span')
      playhead.className = 'admin-waveform-playhead'
      playhead.style.setProperty(
        '--timeline-ratio',
        `${Math.max(0, Math.min(1, playheadRatio))}`
      )
      if (!existingPlayhead) bars.appendChild(playhead)
    }
  }

  function scheduleWaveformRender() {
    if (waveformRenderFrame) return
    waveformRenderFrame = view.requestAnimationFrame(() => {
      waveformRenderFrame = 0
      renderWaveform()
    })
  }

  const setVisible = (visible: boolean) => {
    const panel = getPanel()
    if (!panel) return
    panel.classList.toggle('u-hidden', !visible)
    persistAccessState()

    if (!visible) {
      microphoneReplacementAudioId = null
      void stopRecording().catch((error) => {
        console.error(
          'Failed to stop admin recording while closing timing mode',
          error
        )
      })
    }
    syncPanel()
    options.onChange('mode')

    if (!visible) {
      if (waveformRenderFrame) {
        view.cancelAnimationFrame(waveformRenderFrame)
        waveformRenderFrame = 0
      }
      cancelObsoleteWaveformLoads(null)
      void options.restoreReaderSession().catch((error) => {
        console.error(
          'Failed to restore the reader playback session',
          error
        )
      })
      return
    }

    renderWaveform()
    void options.prepareAuthoringSession().catch((error) => {
      console.error(
        'Failed to prepare the audio session for cue authoring',
        error
      )
      syncPanel()
    })
  }

  const closeAccess = () => {
    state.unlocked = false
    options.onChange('access')
    setVisible(false)
  }

  const restoreAccessState = () => {
    let unlocked = false
    let shouldShowPanel = false
    try {
      const access = readCueAuthoringAccessState(options.sessionStorage)
      unlocked = access.unlocked
      shouldShowPanel = access.panelOpen
    } catch (error) {
      console.error('Failed to restore the admin session state', error)
    }
    state.unlocked = unlocked
    options.onChange('access')
    setVisible(shouldShowPanel)
  }

  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    return (
      target.isContentEditable ||
      Boolean(target.closest('input, textarea, select, button'))
    )
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (isCueAuthoringToggleShortcut(event)) {
      event.preventDefault()
      if (!state.unlocked) {
        const provided = view.prompt('Admin password')
        if (!provided || !verifyAdminPassword(provided)) return true
        state.unlocked = true
        options.onChange('access')
      }
      setVisible(!isVisible())
      return true
    }

    if (isEditableTarget(event.target)) return false
    if (!state.unlocked || !audioController.session || !state.recording) {
      return false
    }
    if (event.code === 'Space' || event.key === 'ArrowRight') {
      event.preventDefault()
      recordNextCue()
      return true
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      stepBack()
      return true
    }
    return false
  }

  const listen = <
    ElementType extends Element,
    EventName extends keyof HTMLElementEventMap,
  >(
    element: ElementType | null,
    eventName: EventName,
    listener: (event: HTMLElementEventMap[EventName]) => void
  ) => {
    element?.addEventListener(eventName, listener as EventListener, {
      signal: scope.signal,
    })
  }

  mountEditorMarkup()

  listen(
    query<HTMLButtonElement>('[data-target-id="export-close"]'),
    'click',
    hideExport
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-close"]'),
    'click',
    closeAccess
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-record"]'),
    'click',
    () => {
      void (async () => {
        if (state.recording || isMicrophoneCaptureActive()) {
          try {
            await stopRecording()
          } catch (error) {
            console.error(
              'The recording could not be stopped cleanly',
              error
            )
          }
          options.focusReader()
          return
        }
        if (isMicrophoneCaptureRequested()) {
          const started = await startMicrophoneTimingPass()
          if (started) options.focusReader()
          return
        }
        if (!state.cues.length) {
          clearCapturedAudio()
          await resetRecorder()
          return
        }
        clearCapturedAudio()
        state.recording = true
        if (state.tokenPointer < 0) {
          const activeIndex = Math.max(
            highlightController.getActiveIndex(),
            0
          )
          state.tokenPointer = Math.min(activeIndex, state.cues.length)
        }
        syncPanel()
        options.focusReader()
      })()
    }
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-step-back"]'),
    'click',
    stepBack
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-undo"]'),
    'click',
    undoLastCue
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-reset"]'),
    'click',
    () => {
      void (async () => {
        if (state.recording || isMicrophoneCaptureActive()) {
          try {
            await stopRecording()
          } catch (error) {
            console.error(
              'The current recording could not be stopped before restarting',
              error
            )
            return
          }
        }
        if (isMicrophoneCaptureRequested()) {
          await startMicrophoneTimingPass({ confirmReplacement: false })
          return
        }
        clearCapturedAudio()
        await resetRecorder()
      })()
    }
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-resume-draft"]'),
    'click',
    () => void resumeDraft()
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-export"]'),
    'click',
    () => void exportCues()
  )
  listen(
    query<HTMLInputElement>('[data-target-id="admin-capture-audio"]'),
    'change',
    () => {
      microphoneCaptureError = null
      microphoneReplacementAudioId = null
      syncPanel()
    }
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-prev-saved"]'),
    'click',
    () => {
      const selectedCueIndex = getEditableCueIndex()
      if (selectedCueIndex > 0) {
        void selectToken(selectedCueIndex - 1)
      }
    }
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-play-current"]'),
    'click',
    () => {
      const selectedCueIndex = getEditableCueIndex()
      if (selectedCueIndex >= 0) {
        void selectToken(selectedCueIndex, { play: true })
      }
    }
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-next-saved"]'),
    'click',
    () => {
      const selectedCueIndex = getEditableCueIndex()
      if (
        selectedCueIndex >= 0 &&
        selectedCueIndex < state.cues.length - 1
      ) {
        void selectToken(selectedCueIndex + 1)
      }
    }
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-trim-here"]'),
    'click',
    trimCuesFromSelection
  )
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-admin-nudge]'
  )) {
    listen(button, 'click', () =>
      nudgeCue(Number(button.dataset.adminNudge))
    )
  }
  listen(
    query<HTMLElement>('[data-target-id="admin-cue-list"]'),
    'click',
    (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-admin-cue-index]'
      )
      if (!row) return
      const cueIndex = Number(row.dataset.adminCueIndex)
      if (Number.isFinite(cueIndex)) void selectToken(cueIndex)
    }
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="admin-mark-issue"]'),
    'click',
    openIssueModal
  )
  listen(
    query<HTMLButtonElement>('[data-target-id="recording-issue-close"]'),
    'click',
    closeIssueModal
  )
  listen(
    query<HTMLElement>('[data-target-id="recording-issue-modal"]'),
    'pointerdown',
    (event) => {
      if (event.target === event.currentTarget) closeIssueModal()
    }
  )
  listen(
    query<HTMLElement>('[data-target-id="admin-waveform-lane"]'),
    'click',
    (event) => {
      if (
        !audioController.session ||
        !Number.isFinite(audioController.duration)
      ) {
        return
      }
      const lane = event.currentTarget as HTMLElement
      const bars = lane.querySelector<HTMLElement>(
        '[data-target-id="admin-waveform-bars"]'
      )
      const rect = (bars ?? lane).getBoundingClientRect()
      const ratio = Math.max(
        0,
        Math.min(
          1,
          (event.clientX - rect.left) / Math.max(rect.width, 1)
        )
      )
      const windowStart = Number(lane.dataset.windowStart)
      const windowEnd = Number(lane.dataset.windowEnd)
      const duration =
        Number.isFinite(windowStart) &&
        Number.isFinite(windowEnd) &&
        windowEnd > windowStart
          ? windowEnd - windowStart
          : audioController.duration
      const start = Number.isFinite(windowStart) ? windowStart : 0
      audioController.seek(
        Math.max(
          0,
          Math.min(
            audioController.duration,
            start + ratio * duration
          )
        )
      )
      scheduleWaveformRender()
    }
  )

  const renderAfterResize = () => scheduleWaveformRender()
  view.addEventListener('resize', renderAfterResize, {
    signal: scope.signal,
  })
  view.visualViewport?.addEventListener('resize', renderAfterResize, {
    signal: scope.signal,
  })

  scope.own(
    audioController.on('playback-updated', () => {
      syncPanel()
    })
  )
  scope.own(
    audioController.on('session-loaded', () => {
      syncPanel()
      if (isVisible()) renderWaveform()
    })
  )
  scope.own(
    audioController.on('time-updated', () => {
      syncProgress()
      if (isVisible()) scheduleWaveformRender()
    })
  )
  scope.own(
    audioController.on('duration-updated', () => {
      syncProgress()
      if (isVisible()) scheduleWaveformRender()
    })
  )
  scope.own(
    audioController.on('playback-error', () => {
      syncPanel()
    })
  )
  scope.own(
    audioController.on('frame-updated', ({ currentTime }) => {
      syncProgress()
      if (isVisible()) scheduleWaveformRender()
      if (state.recording) return
      const session = audioController.session
      if (!session?.cues.length) return
      const cueIndex = highlightController.getCueIndex(
        session.cues,
        currentTime
      )
      if (cueIndex >= 0) syncCueListCurrentIndex(cueIndex)
    })
  )

  scope.own(() => {
    if (waveformRenderFrame) {
      view.cancelAnimationFrame(waveformRenderFrame)
      waveformRenderFrame = 0
    }
    cancelObsoleteWaveformLoads(null)
    resetExportDownloadLinks()
    closeIssueModal()
    if (isMicrophoneCaptureActive()) {
      void microphoneCapture.stop().catch((error) => {
        console.error(
          'Failed to stop microphone capture while unmounting Cue Authoring',
          error
        )
      })
    }
  })

  syncPanel()

  return {
    isUnlocked: () => state.unlocked,
    isVisible,
    isActive: () => state.unlocked && isVisible(),
    isRecording: () => state.recording,
    getSession,
    setVisible,
    closeAccess,
    openIssue: openIssueModal,
    restoreAccessState,
    bindSession,
    clearSession,
    selectReaderToken: (index, selectOptions) =>
      selectToken(index, selectOptions),
    handleKeydown,
    closeOverlays: () => {
      hideExport()
      closeIssueModal()
    },
    recordingIssuesChanged: (saveError = null) => {
      state.recordingIssueSaveError = saveError
      waveformContentRevision += 1
      syncPanel()
      renderWaveform()
    },
  }
}
