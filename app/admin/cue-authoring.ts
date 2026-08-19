import { cueFileRelativePath, formatCueFileJson } from '../audio/cue-file.ts'
import {
  createCueDraftPayload,
  type CueDraftPayload,
} from '../audio/cue-draft.ts'
import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import {
  getCueDataResolutionForRecording,
  retryCueDataResolutionForRecording,
} from '../audio/library.ts'
import type { CueDataResolution } from '../audio/cue-data.ts'
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
import type {
  AudioRecording,
  CueExportPayload,
  WordCue,
} from '../audio/types.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import {
  writeStorageItem,
} from '../persistence/persisted-state.ts'
import { formatTokenKey, parseTokenKey } from '../reader/token-position.ts'
import type {
  ActiveAudioSession,
  AudioController,
} from '../reading/audio-controller.ts'
import type { HighlightController } from '../reading/highlight-controller.ts'
import { selectCuesForTokenKeys } from '../reading/playback-plan.ts'
import {
  CUE_AUTHORING_PANEL_OPEN_KEY,
  CUE_AUTHORING_UNLOCKED_KEY,
  isCueAuthoringToggleShortcut,
  readCueAuthoringAccessState,
  verifyCueAuthoringUnlockCode,
} from './access.ts'
import {
  createCueAuthoringAccessDialog,
  type CueAuthoringAccessDialog,
} from './cue-authoring-access-dialog.ts'
import {
  createCueAuthoringCueList,
  type CueAuthoringCueList,
  type CueAuthoringCueListAction,
} from './cue-authoring-cue-list.ts'
import {
  isAuthoringSession,
  replaceAuthoringSessionCues,
} from './authoring-session.ts'
import { areCueDraftsEquivalent } from './draft-cue-comparison.ts'
import {
  AdminDraftConflictError,
  AdminDraftStorageError,
  createAdminDraftWriterToken,
  loadAdminDraftResult,
  preserveAdminDraftSnapshot,
  readAdminDraftRecoveries,
  saveAdminDraftPayload,
  type AdminDraftRevision,
} from './draft-storage.ts'
import {
  MicrophoneCapture,
  type CapturedMicrophoneAudio,
} from './microphone-capture.ts'
import {
  createCueAuthoringIssueDialog,
  type CueAuthoringIssueDialog,
  type CueAuthoringIssueInput,
} from './cue-authoring-issue-dialog.ts'
import {
  createCueAuthoringExportSheet,
  type CueAuthoringExportSheet,
  type CueAuthoringExportSheetContent,
} from './cue-authoring-export-sheet.ts'
import {
  createCueAuthoringPanel,
  type CueAuthoringPanel,
  type CueAuthoringPanelAction,
  type CueAuthoringPanelSnapshot,
} from './cue-authoring-panel.ts'
import {
  createCueWaveform,
  type CueWaveform,
} from './cue-waveform.ts'

export type CueAuthoringChange =
  | 'access'
  | 'cue-data'
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
  playNetworkRecording: (retry?: () => Promise<void>) => Promise<boolean>
  getAutoScroll: () => boolean
  getActiveTokenKey: () => string | null
  getDisplayTime: () => number
  getRecordingIssues: () => readonly RecordingIssue[]
  cueData?: {
    resolve(recording: AudioRecording): Promise<CueDataResolution>
    retry(recording: AudioRecording): Promise<CueDataResolution>
  }
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
  visible: boolean
  recording: boolean
  captureAudioRequested: boolean
  tokenPointer: number
  cues: WordCue[]
  sourceCues: WordCue[]
  draftOrigin: 'none' | 'published' | 'local'
  draftSavedAt: number | null
  draftRecoveryCount: number
  draftRecoveryFailure: { rawValue: string; reason: string } | null
  volatileDraftRecovery: { rawValue: string; reason: string } | null
  draftSaveError: string | null
  recordingIssueSaveError: string | null
  cueDataResolution: CueDataResolution | null
  cueDataLoading: boolean
  cueDataRetrying: boolean
}

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
    visible: false,
    recording: false,
    captureAudioRequested: false,
    tokenPointer: -1,
    cues: [],
    sourceCues: [],
    draftOrigin: 'none',
    draftSavedAt: null,
    draftRecoveryCount: 0,
    draftRecoveryFailure: null,
    volatileDraftRecovery: null,
    draftSaveError: null,
    recordingIssueSaveError: null,
    cueDataResolution: null,
    cueDataLoading: false,
    cueDataRetrying: false,
  }
  const microphoneCapture = new MicrophoneCapture()
  const draftTimeFormat = Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const cueData = options.cueData ?? {
    resolve: getCueDataResolutionForRecording,
    retry: retryCueDataResolutionForRecording,
  }
  const draftWriterToken = createAdminDraftWriterToken()
  const volatileDraftRecoveries = new Map<
    string,
    { rawValue: string; reason: string }
  >()
  const forgetVolatileDraftRecovery = (audioId: string, rawValue: string) => {
    if (volatileDraftRecoveries.get(audioId)?.rawValue === rawValue) {
      volatileDraftRecoveries.delete(audioId)
    }
  }
  let exportDownloadUrl: string | null = null
  let exportAudioDownloadUrl: string | null = null
  let draftRecoveryDownloadUrl: string | null = null
  let exportPresentationRevision = 0
  let microphoneAudioId: string | null = null
  let capturedAudio: {
    audioId: string
    capture: CapturedMicrophoneAudio
  } | null = null
  let microphoneCaptureError: string | null = null
  let microphoneReplacementAudioId: string | null = null
  let sessionBindingGeneration = 0
  let pendingIssueTokenKey: string | null = null
  let pendingIssueTimeStart: number | undefined
  let accessDialog: CueAuthoringAccessDialog | null = null
  let panel: CueAuthoringPanel | null = null
  let cueList: CueAuthoringCueList | null = null
  let issueDialog: CueAuthoringIssueDialog | null = null
  let exportSheet: CueAuthoringExportSheet | null = null
  let waveform: CueWaveform | null = null

  const query = <ElementType extends Element>(selector: string) =>
    document.querySelector<ElementType>(selector)

  const isVisible = () => state.visible

  const getSession = () => {
    const session = audioController.session
    return isAuthoringSession(session) ? session : null
  }

  const requiresMicrophoneCapture = (
    session: ActiveAudioSession | null = getSession()
  ) => session?.recording.status === 'missing'

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
    waveform?.contentChanged()
    const session = audioController.session
    if (session) replaceAuthoringSessionCues(session, cues)
  }

  const getResumeTokenPointer = (tokenCount: number) => {
    if (!tokenCount) return -1
    return state.cues.length < tokenCount
      ? state.cues.length
      : tokenCount - 1
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
        state.visible ? '1' : '0'
      )
    } catch (error) {
      console.error('Failed to save the admin session state', error)
      options.showPersistenceNotice(
        'Admin access will not persist after this page is closed.'
      )
    }
  }

  const resetExportDownloadLinks = () => {
    exportPresentationRevision += 1
    if (exportDownloadUrl) {
      URL.revokeObjectURL(exportDownloadUrl)
      exportDownloadUrl = null
    }
    if (exportAudioDownloadUrl) {
      URL.revokeObjectURL(exportAudioDownloadUrl)
      exportAudioDownloadUrl = null
    }
    exportSheet?.clearDownloads()
  }

  const resetDraftRecoveryDownloadLink = () => {
    if (!draftRecoveryDownloadUrl) return
    URL.revokeObjectURL(draftRecoveryDownloadUrl)
    draftRecoveryDownloadUrl = null
  }

  const hideExport = () => {
    exportSheet?.close()
    resetExportDownloadLinks()
  }

  let draftTimestampFloor = 0
  let draftRevision: AdminDraftRevision = null
  const saveDraft = async () => {
    const session = getSession()
    if (!session) return false
    const bindingGeneration = sessionBindingGeneration

    const updatedAt = Math.max(Date.now(), draftTimestampFloor + 1)
    draftTimestampFloor = updatedAt
    let payload: CueDraftPayload | null = null
    try {
      payload = createCueDraftPayload({
        recording: session.recording,
        tokenCount: session.tokenKeys.length,
        tokenKeys: session.tokenKeys,
        tokenPointer: state.tokenPointer,
        updatedAt,
        cues: cloneCues(state.cues),
      })
      const savedDraft = await saveAdminDraftPayload(
        payload,
        session.recording,
        session.tokenKeys,
        {
          writerToken: draftWriterToken,
          expectedRevision: draftRevision,
        }
      )
      const serializedPayload = JSON.stringify(payload)
      forgetVolatileDraftRecovery(session.recording.id, serializedPayload)
      if (
        bindingGeneration !== sessionBindingGeneration ||
        getSession() !== session
      ) {
        return true
      }
      draftRevision = savedDraft.revision
      state.draftRecoveryCount = readAdminDraftRecoveries(
        session.recording.id
      ).length
      state.draftRecoveryFailure = null
      state.volatileDraftRecovery =
        volatileDraftRecoveries.get(session.recording.id) ?? null
    } catch (error) {
      console.error(
        `Failed to save admin draft for ${session.recording.id}`,
        error
      )

      const sessionChanged =
        bindingGeneration !== sessionBindingGeneration ||
        getSession() !== session
      const snapshotPayload = payload
      const shouldPreserveSnapshot =
        snapshotPayload !== null &&
        (sessionChanged || error instanceof AdminDraftConflictError)
      const snapshotPreserved = shouldPreserveSnapshot
        ? await preserveAdminDraftSnapshot(
            snapshotPayload,
            error instanceof AdminDraftConflictError
              ? 'conflicting local cue draft rejected during save'
              : 'local cue draft failed after the active recording changed'
          )
        : false
      if (snapshotPayload && shouldPreserveSnapshot) {
        const serializedPayload = JSON.stringify(snapshotPayload)
        if (snapshotPreserved) {
          forgetVolatileDraftRecovery(
            session.recording.id,
            serializedPayload
          )
        } else {
          volatileDraftRecoveries.set(session.recording.id, {
            rawValue: serializedPayload,
            reason:
              error instanceof AdminDraftConflictError
                ? 'conflicting local cue draft could not be stored'
                : 'late local cue draft failure could not be stored',
          })
        }
      }

      if (
        bindingGeneration !== sessionBindingGeneration ||
        getSession() !== session
      ) {
        options.showPersistenceNotice(
          snapshotPreserved
            ? `${session.recording.title} could not be saved after the recording changed. Its cues were preserved in local draft recoveries.`
            : `${session.recording.title} could not be saved after the recording changed. Its cues remain only in this open Reader; return to that recording and download the unsaved snapshot before navigating away or closing this tab.`
        )
        return false
      }

      state.volatileDraftRecovery =
        volatileDraftRecoveries.get(session.recording.id) ?? null
      state.draftRecoveryCount = readAdminDraftRecoveries(
        session.recording.id
      ).length
      state.draftSaveError =
        error instanceof AdminDraftConflictError
          ? snapshotPreserved
            ? 'This local draft changed in another tab. Your current cues were preserved in Recoveries. Download or export them, then reload this recording.'
            : 'This local draft changed in another tab. Export your current cues before reloading this recording.'
          : error instanceof AdminDraftStorageError
            ? 'This draft could not be saved in browser storage. Export it before leaving this recording.'
            : 'This draft could not be saved. Export it before leaving this recording.'
      syncPanel()
      return false
    }

    state.draftSaveError = null
    state.draftOrigin = 'local'
    state.draftSavedAt = updatedAt
    syncPanel()
    options.onChange('draft')
    return true
  }

  const clearSession = () => {
    sessionBindingGeneration += 1
    state.sourceCues = []
    state.cues = []
    state.tokenPointer = -1
    state.recording = false
    state.draftOrigin = 'none'
    state.draftSavedAt = null
    draftTimestampFloor = 0
    draftRevision = null
    state.draftRecoveryCount = 0
    state.draftRecoveryFailure = null
    state.volatileDraftRecovery = null
    state.draftSaveError = null
    state.recordingIssueSaveError = null
    state.cueDataResolution = null
    state.cueDataLoading = false
    state.cueDataRetrying = false
    waveform?.contentChanged()
    syncPanel()
  }

  const bindSession = async (session: ActiveAudioSession) => {
    const generation = ++sessionBindingGeneration
    if (audioController.session !== session || !isAuthoringSession(session)) {
      clearSession()
      return
    }

    const initialSourceCues = cloneCues(session.cues)
    const storedDraftResult = loadAdminDraftResult(
      session.recording,
      session.tokenKeys
    )
    const storedDraft = storedDraftResult.status === 'ready'
      ? storedDraftResult.draft
      : null
    const draftRecoveryFailure = storedDraftResult.status === 'recovery-failed'
      ? {
          rawValue: storedDraftResult.rawValue,
          reason: storedDraftResult.reason,
        }
      : null
    const volatileDraftRecovery =
      volatileDraftRecoveries.get(session.recording.id) ?? null
    const draftRecoveryCount = readAdminDraftRecoveries(
      session.recording.id
    ).length
    state.sourceCues = []
    state.cues = []
    state.tokenPointer = -1
    state.recording = false
    state.draftOrigin = 'none'
    state.draftSavedAt = null
    draftTimestampFloor = storedDraft?.updatedAt ?? 0
    draftRevision = storedDraftResult.revision
    state.draftRecoveryCount = draftRecoveryCount
    state.draftRecoveryFailure = draftRecoveryFailure
    state.volatileDraftRecovery = volatileDraftRecovery
    state.draftSaveError = null
    state.recordingIssueSaveError = null
    state.cueDataResolution = null
    state.cueDataLoading = true
    state.cueDataRetrying = false
    waveform?.contentChanged()
    syncPanel()

    const cueDataResolution = await cueData.resolve(session.recording)
    const sourceCues =
      cueDataResolution.status === 'ready'
        ? normalizeFirstCueStart(
            cloneCues(
              selectCuesForTokenKeys(
                cueDataResolution.payload.cues,
                session.tokenKeys
              )
            )
          )
        : initialSourceCues
    const draft = storedDraft?.cues.length ? storedDraft : null
    const savedAtValue =
      cueDataResolution.status === 'ready'
        ? cueDataResolution.payload.savedAt
        : null
    const parsedSavedAt = savedAtValue ? Date.parse(savedAtValue) : NaN
    const publishedSavedAt = Number.isFinite(parsedSavedAt)
      ? parsedSavedAt
      : null
    const savedAt = draft?.updatedAt ?? publishedSavedAt
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
    state.cueDataResolution = cueDataResolution
    state.cueDataLoading = false
    state.cueDataRetrying = false
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
    state.captureAudioRequested || requiresMicrophoneCapture()

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
    cueList?.focus(index)
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
        ? options.playNetworkRecording(async () => {
            await selectToken(index, {
              play,
              preservePlayback,
              seekToCue,
              focusRow,
              syncMode,
            })
          })
        : null

    if (syncMode === 'step-back') {
      syncProgress()
      syncStepBackState()
      options.onChange('playback-progress')
    }

    const [, playbackStarted] = await Promise.all([activation, playback])
    if (syncMode === 'full') {
      options.onChange('playback')
      syncPanel()
    }
    if (focusRow) focusCueRow(getEditableCueIndex())
    return playbackStarted ?? !play
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
    if (state.cueDataLoading) {
      return 'Checking published timing and locally saved work.'
    }
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

  const syncCueList = ({ follow = true } = {}) => {
    const session = getSession()
    const items = session && !state.cueDataLoading
      ? state.cues.map((cue, index) => ({
          key: `${formatTokenKey(cue)}:${index}`,
          tokenLabel: getTokenLabel(index),
          timeStart: cue.timeStart,
        }))
      : []
    const selectedCueIndex = session ? getEditableCueIndex() : -1
    const playingCueIndex =
      session && !state.recording && session.cues.length
        ? highlightController.getCueIndex(
            session.cues,
            audioController.currentTime
          )
        : -1
    const followCueIndex = state.recording
      ? items.length - 1
      : playingCueIndex >= 0
        ? playingCueIndex
        : selectedCueIndex
    cueList?.sync({
      emptyMessage: !session
        ? 'Select an aliyah to load timing.'
        : state.cueDataLoading
          ? 'Loading timing...'
        : items.length
          ? null
          : 'No timing saved yet. Start recording, then refine it.',
      items,
      selectedIndex: selectedCueIndex,
      currentIndex: playingCueIndex,
      followIndex: follow ? followCueIndex : null,
    })
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
    panel?.syncProgress({
      wordLabel: wordProgress.label,
      durationLabel: session
        ? `${options.formatDuration(currentTime)} / ${options.formatDuration(
            duration
          )}`
        : '0:00 / 0:00',
      audioRatio: progress,
      cueRatio: wordProgress.ratio,
    })
  }

  const hasLocalCueChanges = () =>
    state.cues.length > 0 &&
    !areCueDraftsEquivalent(state.cues, state.sourceCues)

  const getPanelProblems = (): CueAuthoringPanelSnapshot['problems'] => {
    const problems: CueAuthoringPanelSnapshot['problems'] = []
    if (state.draftRecoveryFailure) {
      problems.push({
        id: 'local-draft-recovery-failed',
        tone: 'error',
        title: 'Local draft needs immediate backup',
        message:
          'Browser storage could not preserve this incompatible draft. The original remains in place and was not loaded.',
        details: [
          'Download the raw draft now before clearing browser data or retrying authoring changes.',
          `Reason: ${state.draftRecoveryFailure.reason}`,
        ],
        action: {
          type: 'export-draft-recovery',
          label: 'Download Raw Draft',
          pendingLabel: 'Preparing Draft...',
          pending: false,
        },
      })
    }
    if (state.volatileDraftRecovery) {
      problems.push({
        id: 'volatile-draft-recovery',
        tone: 'error',
        title: 'Unsaved cue snapshot needs download',
        message:
          'Browser recovery storage was unavailable. This exact cue snapshot exists only in this open Reader and was not loaded over the current draft.',
        details: [
          'Download it now before navigating away, closing this tab, clearing browser data, or retrying the recording.',
          `Reason: ${state.volatileDraftRecovery.reason}`,
        ],
        action: {
          type: 'export-draft-recovery',
          label: 'Download Unsaved Snapshot',
          pendingLabel: 'Preparing Snapshot...',
          pending: false,
        },
      })
    }
    if (state.draftRecoveryCount > 0) {
      const count = state.draftRecoveryCount
      problems.push({
        id: 'local-draft-recovery',
        tone: 'warning',
        title:
          count === 1
            ? 'Local draft recovery preserved'
            : `${count} local draft recoveries preserved`,
        message:
          `${count === 1 ? 'This draft was' : 'These drafts were'} kept separate ` +
          'because loading or replacing the current browser draft was not safe.',
        details: [
          'Recovery data stays in this browser and never becomes published cue data automatically.',
          'Download it before clearing browser storage or attempting manual repair.',
        ],
        action: {
          type: 'export-draft-recovery',
          label: count === 1 ? 'Download Recovery' : 'Download Recoveries',
          pendingLabel: 'Preparing Recovery...',
          pending: false,
        },
      })
    }

    const resolution = state.cueDataResolution
    if (
      !resolution ||
      resolution.status === 'ready' ||
      resolution.status === 'missing'
    ) {
      return problems
    }

    const filePath = resolution.path.replace(/^\.\.\/\.\.\//, '')
    problems.push({
      id: 'published-cue-data',
      tone: resolution.status === 'invalid' ? 'warning' : 'error',
      title:
        resolution.status === 'invalid'
          ? 'Published cue file needs repair'
          : 'Published cue file is unavailable',
      message:
        `${resolution.problem.message} Published timing was skipped so ` +
        'playback and authoring can continue. Fix the file, then retry here.',
      details: [
        `File: ${filePath}`,
        ...resolution.problem.details,
      ],
      action: {
        type: 'retry-cue-data',
        label: 'Retry Cue File',
        pendingLabel: 'Checking Cue File...',
        pending: state.cueDataRetrying,
      },
    })
    return problems
  }

  const getPanelSnapshot = (): CueAuthoringPanelSnapshot => {
    const session = getSession()
    const tokenCount = session?.tokenKeys.length ?? 0
    const hasSession = Boolean(session && tokenCount)
    const sessionReady = hasSession && !state.cueDataLoading
    const hasCues = state.cues.length > 0
    const hasIncompleteDraft =
      sessionReady && hasCues && state.cues.length < tokenCount
    const canResumeDraft = hasIncompleteDraft && !state.recording
    const microphoneTransitioning =
      microphoneCapture.state === 'starting' ||
      microphoneCapture.state === 'stopping'
    const microphoneSupported = microphoneCapture.isSupported()
    const microphoneBusy = isMicrophoneCaptureActive()
    const recordingMicrophone = isMicrophoneRecordingForSession(session)
    const readyAudio =
      session && capturedAudio?.audioId === session.recording.id
        ? capturedAudio.capture
        : null
    const confirmingFreshPass = Boolean(
      session && microphoneReplacementAudioId === session.recording.id
    )

    let cueCountText = '0 Words'
    let statusText =
      'Select an aliyah and press play to start timing words.'
    if (hasSession && session && state.cueDataLoading) {
      cueCountText = `${tokenCount} Words - Loading timing...`
      statusText = `${session.recording.title}: loading published timing...`
    } else if (hasSession && session) {
      const counterPointer =
        state.tokenPointer >= 0 ? state.tokenPointer + 1 : 0
      cueCountText =
        `${state.cues.length} / ${tokenCount} Words - ${counterPointer}`
    }
    if (!state.cueDataLoading && hasSession && session && state.recording) {
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
      statusText =
        `${session.recording.title}: recording ` +
        `${recordingMicrophone ? 'audio + ' : ''}Word ${pointer}. ` +
        'Space or Right Arrow saves the current time; Left Arrow steps back.'
    } else if (
      !state.cueDataLoading &&
      hasSession &&
      session &&
      state.cues.length === tokenCount &&
      tokenCount > 0
    ) {
      statusText =
        `${session.recording.title}: all ${tokenCount} Words are timed. ` +
        'Select one to play, adjust, or export.'
    } else if (!state.cueDataLoading && hasSession && session) {
      const pointer =
        state.cues.length < tokenCount
          ? Math.min(state.cues.length + 1, tokenCount)
          : tokenCount
      statusText = hasCues
        ? `${session.recording.title}: ${state.cues.length}/${tokenCount} ` +
          `Words saved. Resume from Word ${pointer}, or select one to refine.`
        : requiresMicrophoneCapture(session)
          ? `${session.recording.title}: no published audio. ` +
            'Record a fresh synchronized audio and cue pass.'
          : `${session.recording.title}: ready to time. ` +
            'Press Record/Edit Timing to begin.'
    }

    let captureStatusText =
      'Optional: capture your microphone into a downloadable audio file while you mark cues.'
    const captureTone: CueAuthoringPanelSnapshot['captureAudio']['tone'] =
      microphoneCaptureError
        ? 'error'
        : recordingMicrophone
          ? 'recording'
          : confirmingFreshPass
            ? 'confirm'
            : 'normal'
    if (microphoneCaptureError) {
      captureStatusText = microphoneCaptureError
    } else if (!microphoneSupported) {
      captureStatusText =
        'Microphone recording is not supported in this browser.'
    } else if (microphoneCapture.state === 'starting') {
      captureStatusText = 'Waiting for microphone access...'
    } else if (microphoneCapture.state === 'stopping') {
      captureStatusText = 'Finishing the audio file...'
    } else if (recordingMicrophone) {
      captureStatusText =
        'Microphone audio is recording with the cue clock. Stop or Export to finish both files.'
    } else if (readyAudio) {
      captureStatusText =
        `Audio ready (${options.formatDuration(readyAudio.durationSeconds)}, ` +
        `${readyAudio.fileExtension.toUpperCase()}). Export to download it with the cues.`
    } else if (confirmingFreshPass) {
      captureStatusText =
        'Press Record once more to replace this cue draft with a fresh synchronized audio + timing pass.'
    } else if (requiresMicrophoneCapture(session)) {
      captureStatusText =
        'This aliyah has no published recording. Microphone audio and synchronized cue recording are required.'
    } else if (state.captureAudioRequested && hasCues) {
      captureStatusText =
        'Starting microphone audio creates a fresh synchronized timing pass and replaces the current cue draft.'
    }

    return {
      visible: state.visible,
      cueCountText,
      statusText,
      problems: getPanelProblems(),
      draftStatusText: getDraftStatusText(),
      syncNoteVisible: state.recording,
      captureAudio: {
        requested: isMicrophoneCaptureRequested(),
        disabled:
          !session ||
          state.cueDataLoading ||
          !microphoneSupported ||
          microphoneBusy ||
          requiresMicrophoneCapture(session),
        statusText: captureStatusText,
        tone: captureTone,
      },
      record: {
        disabled: !sessionReady || microphoneTransitioning,
        mode: confirmingFreshPass
          ? 'confirm'
          : state.recording
            ? recordingMicrophone
              ? 'audio'
              : 'timing'
            : 'idle',
      },
      canStepBack: sessionReady && state.tokenPointer >= 0,
      canUndo: sessionReady && hasCues,
      canMarkIssue: sessionReady,
      canReset:
        sessionReady && (hasCues || state.recording || state.tokenPointer >= 0),
      canExport: sessionReady && hasCues,
      exportChanged: hasLocalCueChanges(),
      resumeWord: canResumeDraft ? state.cues.length + 1 : null,
    }
  }

  function syncPanel() {
    panel?.sync(getPanelSnapshot())
    syncCueList()
    syncProgress()
    waveform?.schedule()
    options.onChange('mode')
  }

  const syncStepBackState = () => {
    const session = getSession()
    if (!session?.tokenKeys.length) return
    panel?.sync(getPanelSnapshot())
    syncCueList({ follow: false })
  }

  const startTimingRecording = (
    session: ActiveAudioSession,
    tokenPointer: number | null = null
  ) => {
    clearCapturedAudio()
    state.recording = true
    if (tokenPointer !== null) {
      state.tokenPointer = Math.max(
        0,
        Math.min(tokenPointer, session.tokenKeys.length - 1)
      )
    } else if (state.tokenPointer < 0) {
      const activeIndex = Math.max(highlightController.getActiveIndex(), 0)
      state.tokenPointer = Math.min(activeIndex, state.cues.length)
    }
    syncPanel()
    options.focusReader()
  }

  const resumeDraft = async () => {
    const session = audioController.session
    if (!session?.tokenKeys.length || !state.cues.length) return
    state.recording = false
    const lastSavedCueIndex = Math.max(
      0,
      Math.min(state.cues.length - 1, session.tokenKeys.length - 1)
    )
    const playbackStarted = await selectToken(lastSavedCueIndex, { play: true })
    if (!playbackStarted || audioController.session !== session) return
    startTimingRecording(session, state.cues.length)
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
    void saveDraft()
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

    const sheet = exportSheet
    if (!sheet) {
      throw new Error('Cue Authoring Export Sheet is not mounted')
    }
    const exportPath = cueFileRelativePath(session.recording)
    const exportFileName =
      exportPath.split('/').pop() ?? 'audio-cues.json'
    const serialized = formatCueFileJson(payload)
    resetExportDownloadLinks()
    const cueDownloadUrl = URL.createObjectURL(
      new Blob([serialized], { type: 'application/json' })
    )
    exportDownloadUrl = cueDownloadUrl
    const exportRevision = exportPresentationRevision

    let capturedAudioFileName: string | null = null
    let audioDownload: CueAuthoringExportSheetContent['audioDownload'] = null
    if (readyAudio) {
      capturedAudioFileName =
        `${session.recording.id.replace(/[^a-z0-9._-]+/gi, '-')}` +
        `-recorded.${readyAudio.fileExtension}`
      const audioUrl = URL.createObjectURL(readyAudio.blob)
      exportAudioDownloadUrl = audioUrl
      const conversionNote =
        readyAudio.fileExtension === session.recording.format
          ? ''
          : ` Convert it to ${session.recording.format.toUpperCase()} before publishing this recording.`
      audioDownload = {
        href: audioUrl,
        fileName: capturedAudioFileName,
        statusText:
          `Recorded audio: ${capturedAudioFileName} ` +
          `(${options.formatDuration(readyAudio.durationSeconds)}).` +
          conversionNote,
      }
    }
    sheet.open({
      cueDownload: {
        href: cueDownloadUrl,
        fileName: exportFileName,
      },
      audioDownload,
      targetPath: exportPath,
      serialized,
    })
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
      if (
        scope.signal.aborted ||
        exportSheet !== sheet ||
        exportPresentationRevision !== exportRevision
      ) {
        return
      }
      sheet.setCopyStatus(copiedMessage)
    } catch {
      if (
        scope.signal.aborted ||
        exportSheet !== sheet ||
        exportPresentationRevision !== exportRevision
      ) {
        return
      }
      sheet.setCopyStatus(blockedMessage)
    }
  }

  const exportDraftRecoveries = () => {
    const session = getSession()
    if (!session) return
    const recoveries = readAdminDraftRecoveries(session.recording.id)
    state.draftRecoveryCount = recoveries.length
    const unresolvedDraft = state.draftRecoveryFailure
      ? {
          sourceKey: `tikkun-admin-draft:${session.recording.id}`,
          reason: state.draftRecoveryFailure.reason,
          rawValue: state.draftRecoveryFailure.rawValue,
        }
      : null
    const volatileDraft = state.volatileDraftRecovery
      ? {
          sourceKey: `tikkun-admin-draft:volatile:${session.recording.id}`,
          reason: state.volatileDraftRecovery.reason,
          rawValue: state.volatileDraftRecovery.rawValue,
        }
      : null
    if (!recoveries.length && !unresolvedDraft && !volatileDraft) {
      syncPanel()
      options.showPersistenceNotice(
        'No local draft recovery is available for this recording.'
      )
      return
    }

    try {
      const serialized = `${JSON.stringify({
        version: 1,
        kind: 'tikkun-admin-draft-recovery-export',
        audioId: session.recording.id,
        exportedAt: new Date().toISOString(),
        recoveries,
        unresolvedDraft,
        volatileDraft,
      }, null, 2)}\n`
      resetDraftRecoveryDownloadLink()
      draftRecoveryDownloadUrl = URL.createObjectURL(
        new Blob([serialized], { type: 'application/json' })
      )
      const download = document.createElement('a')
      const safeAudioId = session.recording.id.replace(/[^a-z0-9._-]+/gi, '-')
      download.href = draftRecoveryDownloadUrl
      download.download = `${safeAudioId}-draft-recoveries.json`
      download.hidden = true
      document.body.append(download)
      download.click()
      download.remove()
    } catch (error) {
      console.error(
        `Failed to export admin draft recoveries for ${session.recording.id}`,
        error
      )
      options.showPersistenceNotice(
        volatileDraft
          ? 'The unsaved snapshot download could not be prepared. It remains only in this open Reader; retry before navigating away or closing this tab.'
          : 'Recovery download could not be prepared. Recovery data remains in browser storage.'
      )
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
    waveform?.contentChanged()
    state.tokenPointer = Math.min(
      currentIndex + 1,
      session.tokenKeys.length - 1
    )
    void activateCueToken(tokenKey)
    void saveDraft()
    options.onChange('playback')
    syncPanel()
  }

  const stepBack = () => {
    const session = audioController.session
    if (!session?.tokenKeys.length) return
    const recordingMicrophone = isMicrophoneRecordingForSession(session)
    const selectedCueIndex = getEditableCueIndex()
    const activeIndex = highlightController.getActiveIndex()
    const originIndex =
      state.recording && activeIndex >= 0
        ? activeIndex
        : selectedCueIndex
    const targetIndex =
      originIndex > 0
        ? originIndex - 1
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
    waveform?.contentChanged()
    state.tokenPointer = state.cues.length
      ? Math.min(
          state.cues.length,
          (session?.tokenKeys.length ?? 1) - 1
        )
      : -1
    void saveDraft()
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
    void saveDraft()
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
    waveform?.contentChanged()
    audioController.pause()
    audioController.seek(cue.timeStart)
    options.onCueNavigationChange(selectedCueIndex)
    void saveDraft()
    void highlightController.activateCue(cue, {
      scroll: options.getAutoScroll(),
    })
    options.onChange('playback')
    syncPanel()
  }

  const handleCueListAction = (action: CueAuthoringCueListAction) => {
    const selectedCueIndex = getEditableCueIndex()
    switch (action.type) {
      case 'select':
        void selectToken(action.index)
        break
      case 'move': {
        const nextIndex = selectedCueIndex + action.delta
        if (
          selectedCueIndex >= 0 &&
          nextIndex >= 0 &&
          nextIndex < state.cues.length
        ) {
          void selectToken(nextIndex)
        }
        break
      }
      case 'play':
        if (selectedCueIndex >= 0) {
          void selectToken(selectedCueIndex, { play: true })
        }
        break
      case 'trim':
        trimCuesFromSelection()
        break
      case 'nudge':
        nudgeCue(action.seconds)
        break
    }
  }

  const issueKindLabel = (kind: RecordingIssueKind) =>
    recordingIssueReaderLabel({ kind }).replace(/\bhere$/, '').trim()

  const clearPendingIssue = () => {
    pendingIssueTokenKey = null
    pendingIssueTimeStart = undefined
  }

  const closeIssueModal = () => issueDialog?.close()

  const saveIssue = ({
    kind,
    note,
    readerVisible,
  }: CueAuthoringIssueInput) => {
    const session = audioController.session
    if (!session || !pendingIssueTokenKey) return false
    const issue = createRecordingIssue({
      audioId: session.recording.id,
      tokenKey: pendingIssueTokenKey,
      timeStart: pendingIssueTimeStart,
      kind,
      visibility: readerVisible ? 'readerVisible' : 'authoringOnly',
      severity: kind === 'other' ? 'low' : 'medium',
      note,
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
      return false
    }
    state.recordingIssueSaveError = null
    waveform?.contentChanged()
    options.onRecordingIssuesChanged(nextIssues)
    syncCueList()
    return true
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
    if (!issueDialog) {
      throw new Error('Cue Authoring Issue Dialog is not mounted')
    }
    issueDialog.open()
  }

  const setVisible = (visible: boolean) => {
    state.visible = visible
    waveform?.setVisible(visible)
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
      void options.restoreReaderSession().catch((error) => {
        console.error(
          'Failed to restore the reader playback session',
          error
        )
      })
      return
    }

    void options.prepareAuthoringSession().catch((error) => {
      console.error(
        'Failed to prepare the audio session for cue authoring',
        error
      )
      syncPanel()
    })
  }

  const closeAccess = () => {
    accessDialog?.close()
    state.unlocked = false
    options.onChange('access')
    setVisible(false)
  }

  const unlockAccess = (candidate: string) => {
    if (!verifyCueAuthoringUnlockCode(candidate)) return false
    state.unlocked = true
    options.onChange('access')
    setVisible(true)
    return true
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
        if (!accessDialog) {
          throw new Error('Cue Authoring Access Dialog is not mounted')
        }
        accessDialog.open()
        return true
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

  const toggleRecording = async () => {
    if (state.recording || isMicrophoneCaptureActive()) {
      try {
        await stopRecording()
      } catch (error) {
        console.error('The recording could not be stopped cleanly', error)
      }
      options.focusReader()
      return
    }
    const session = getSession()
    if (!session?.tokenKeys.length) return
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
    startTimingRecording(session)
  }

  const resetTiming = async () => {
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
  }

  const retryPublishedCueData = async () => {
    const session = getSession()
    if (!session || state.cueDataRetrying) return

    const generation = sessionBindingGeneration
    const preserveLocalCues =
      state.draftOrigin === 'local' || hasLocalCueChanges()
    state.cueDataRetrying = true
    syncPanel()

    const resolution = await cueData.retry(session.recording)
    if (
      generation !== sessionBindingGeneration ||
      getSession() !== session
    ) {
      return
    }

    state.cueDataResolution = resolution
    if (resolution.status === 'ready') {
      const publishedCues = normalizeFirstCueStart(
        cloneCues(
          selectCuesForTokenKeys(
            resolution.payload.cues,
            session.tokenKeys
          )
        )
      )
      state.sourceCues = cloneCues(publishedCues)
      if (!preserveLocalCues) {
        assignCues(cloneCues(publishedCues))
        state.draftOrigin = publishedCues.length ? 'published' : 'none'
        const savedAt = resolution.payload.savedAt
          ? Date.parse(resolution.payload.savedAt)
          : NaN
        state.draftSavedAt = Number.isFinite(savedAt) ? savedAt : null
      }
    } else {
      state.sourceCues = []
      if (!preserveLocalCues) {
        assignCues([])
        state.draftOrigin = 'none'
        state.draftSavedAt = null
      }
    }
    state.cueDataRetrying = false
    options.onChange('cue-data')
    syncPanel()
  }

  const handlePanelAction = (action: CueAuthoringPanelAction) => {
    switch (action.type) {
      case 'close':
        closeAccess()
        break
      case 'retry-cue-data':
        void retryPublishedCueData()
        break
      case 'export-draft-recovery':
        exportDraftRecoveries()
        break
      case 'capture-audio':
        state.captureAudioRequested = action.requested
        microphoneCaptureError = null
        microphoneReplacementAudioId = null
        syncPanel()
        break
      case 'record':
        void toggleRecording()
        break
      case 'step-back':
        stepBack()
        break
      case 'undo':
        undoLastCue()
        break
      case 'mark-issue':
        openIssueModal()
        break
      case 'reset':
        void resetTiming()
        break
      case 'resume':
        void resumeDraft()
        break
      case 'export':
        void exportCues()
        break
    }
  }

  accessDialog = createCueAuthoringAccessDialog(scope, {
    document,
    submit: unlockAccess,
  })
  scope.own(() => {
    accessDialog = null
  })
  panel = createCueAuthoringPanel(scope, {
    document,
    action: handlePanelAction,
  })
  scope.own(() => {
    panel = null
  })
  cueList = createCueAuthoringCueList(scope, {
    document,
    view,
    formatTimestamp: formatCueTimestamp,
    action: handleCueListAction,
  })
  scope.own(() => {
    cueList = null
  })
  issueDialog = createCueAuthoringIssueDialog(scope, {
    document,
    issueKinds: recordingIssueKinds.map((kind) => ({
      kind,
      label: issueKindLabel(kind),
    })),
    save: saveIssue,
    closed: clearPendingIssue,
  })
  scope.own(() => {
    issueDialog = null
  })
  exportSheet = createCueAuthoringExportSheet(scope, {
    document,
    view,
    closeRequested: hideExport,
  })
  scope.own(() => {
    exportSheet = null
  })
  waveform = createCueWaveform(scope, {
    document,
    view,
    getSnapshot: () => {
      const session = getSession()
      return {
        session,
        currentTime: audioController.currentTime,
        duration: audioController.duration,
        paused: audioController.audio.paused,
        ended: audioController.audio.ended,
        cues: state.cues,
        issues: options.getRecordingIssues(),
        microphoneState: session
          ? isMicrophoneRecordingForSession(session)
            ? 'recording'
            : capturedAudio?.audioId === session.recording.id
              ? 'ready'
              : null
          : null,
      }
    },
    formatDuration: options.formatDuration,
    seek: (time) => audioController.seek(time),
  })
  scope.own(() => {
    waveform = null
  })
  scope.own(
    audioController.on('playback-updated', () => {
      syncPanel()
    })
  )
  scope.own(
    audioController.on('session-loaded', () => {
      syncPanel()
      waveform?.schedule()
    })
  )
  scope.own(
    audioController.on('time-updated', () => {
      syncProgress()
      waveform?.schedule()
    })
  )
  scope.own(
    audioController.on('duration-updated', () => {
      syncProgress()
      waveform?.schedule()
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
      waveform?.schedule()
      if (state.recording) return
      const session = audioController.session
      if (!session?.cues.length) return
      const cueIndex = highlightController.getCueIndex(
        session.cues,
        currentTime
      )
      if (cueIndex >= 0 && isVisible()) cueList?.setCurrent(cueIndex)
    })
  )

  scope.own(() => {
    resetExportDownloadLinks()
    resetDraftRecoveryDownloadLink()
    accessDialog?.close()
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
    selectReaderToken: async (index, selectOptions) => {
      await selectToken(index, selectOptions)
    },
    handleKeydown,
    closeOverlays: () => {
      accessDialog?.close()
      hideExport()
      closeIssueModal()
    },
    recordingIssuesChanged: (saveError = null) => {
      state.recordingIssueSaveError = saveError
      waveform?.contentChanged()
      syncPanel()
    },
  }
}
