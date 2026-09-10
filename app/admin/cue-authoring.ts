import '../../css/cue-authoring.css'

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
import { pendingCueFlags, nextFlaggedCueIndex, markCueReviewed } from '../audio/cue-review.ts'
import { parseCueImport } from './cue-import.ts'
import { getWordProgress } from '../audio/progress.ts'
import {
  createRecordingIssue,
  RecordingIssueConflictError,
  recordingIssueKinds,
  recordingIssueReaderLabel,
  saveLocalRecordingIssues,
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
  type PersistedJsonRevision,
} from '../persistence/persisted-state.ts'
import { formatTokenKey } from '../reader/token-position.ts'
import type {
  ReaderPlaybackCueAuthoringAdapter,
  ReaderPlaybackCueAuthoringSessionSnapshot,
} from '../reading/reader-playback.ts'
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
  createCueDraftEditor,
  type CueDraftEditorSnapshot,
  type CueDraftSaveProblem,
} from './cue-draft-editor.ts'
import {
  AdminDraftConflictError,
  AdminDraftStorageError,
  createAdminDraftWriterToken,
  loadAdminDraftResult,
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
  playback: ReaderPlaybackCueAuthoringAdapter
  localStorage: Storage | null
  sessionStorage: Storage | null
  getAutoScroll: () => boolean
  getActiveTokenKey: () => string | null
  getMergedRecordingIssues: () => readonly RecordingIssue[]
  getLocalRecordingIssues: () => readonly RecordingIssue[]
  getLocalRecordingIssueRevision: () => PersistedJsonRevision | null
  cueData?: {
    resolve(recording: AudioRecording): Promise<CueDataResolution>
    retry(recording: AudioRecording): Promise<CueDataResolution>
  }
  focusReader: () => void
  formatDuration: (seconds: number) => string
  onChange: (change: CueAuthoringChange) => void
  onCueNavigationChange: (index: number | null) => void
  onLocalRecordingIssuesChanged: (
    issues: RecordingIssue[],
    revision: PersistedJsonRevision
  ) => void
  showPersistenceNotice: (message: string) => void
}

export interface CueAuthoring {
  isUnlocked(): boolean
  isVisible(): boolean
  isActive(): boolean
  isRecording(): boolean
  getSession(): ReaderPlaybackCueAuthoringSessionSnapshot | null
  setVisible(visible: boolean): void
  closeAccess(): void
  openIssue(): void
  restoreAccessState(): void
  bindSession(): Promise<void>
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
  captureAudioRequested: boolean
  volatileDraftRecovery: { rawValue: string; reason: string } | null
  recordingIssueSaveError: string | null
  cueDataResolution: CueDataResolution | null
  cueDataLoading: boolean
  cueDataRetrying: boolean
}

const cloneCue = (cue: Readonly<WordCue>): WordCue => ({ ...cue })
const cloneCues = (cues: readonly Readonly<WordCue>[]) => cues.map(cloneCue)

export function createCueAuthoring(
  scope: MountScope,
  options: CueAuthoringOptions
): CueAuthoring {
  const {
    document,
    view,
    playback,
  } = options
  const state: CueAuthoringState = {
    unlocked: false,
    visible: false,
    captureAudioRequested: false,
    volatileDraftRecovery: null,
    recordingIssueSaveError: null,
    cueDataResolution: null,
    cueDataLoading: false,
    cueDataRetrying: false,
  }
  const draftEditor = createCueDraftEditor()
  const draftSnapshot = () => draftEditor.snapshot()
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
  let unsavedDraftDownloadUrl: string | null = null
  let exportPresentationRevision = 0
  let microphoneAudioId: string | null = null
  let capturedAudio: {
    audioId: string
    capture: CapturedMicrophoneAudio
  } | null = null
  let microphoneCaptureError: string | null = null
  let microphoneReplacementAudioId: string | null = null
  let sessionBindingGeneration = 0
  let boundSession: ReaderPlaybackCueAuthoringSessionSnapshot | null = null
  let pendingIssueAudioId: string | null = null
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
    if (!boundSession) return null
    const snapshot = playback.snapshot()
    return snapshot.hasSession &&
      snapshot.sessionRevision === boundSession.sessionRevision
      ? boundSession
      : null
  }

  const requiresMicrophoneCapture = (
    session: ReaderPlaybackCueAuthoringSessionSnapshot | null = getSession()
  ) => session?.recording.status === 'missing'

  const formatCueTimestamp = (seconds: number) => {
    const milliseconds = Math.max(0, Math.round(seconds * 1000))
    const wholeSeconds = Math.floor(milliseconds / 1000)
    return `${options.formatDuration(wholeSeconds)}.${String(
      milliseconds % 1000
    ).padStart(3, '0')}`
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

  const resetUnsavedDraftDownloadLink = () => {
    if (!unsavedDraftDownloadUrl) return
    URL.revokeObjectURL(unsavedDraftDownloadUrl)
    unsavedDraftDownloadUrl = null
  }

  const hideExport = () => {
    exportSheet?.close()
    resetExportDownloadLinks()
  }

  let draftTimestampFloor = 0
  let draftRevision: AdminDraftRevision = null
  const draftSaveProblemMessage = (
    problem: CueDraftSaveProblem | null
  ) => {
    switch (problem) {
      case 'conflict':
        return 'This local draft changed in another tab. Download or export your unsaved cues, then reload this recording.'
      case 'storage':
        return 'This draft could not be saved in browser storage. Export it before leaving this recording.'
      case 'unknown':
        return 'This draft could not be saved. Export it before leaving this recording.'
      case null:
        return null
    }
  }

  const saveDraft = async () => {
    const session = getSession()
    if (!session) return false
    const bindingGeneration = sessionBindingGeneration
    const editorSnapshot = draftSnapshot()

    const updatedAt = Math.max(Date.now(), draftTimestampFloor + 1)
    draftTimestampFloor = updatedAt
    let payload: CueDraftPayload | null = null
    try {
      payload = createCueDraftPayload({
        recording: session.recording,
        tokenCount: session.tokenKeys.length,
        tokenKeys: session.tokenKeys,
        tokenPointer: editorSnapshot.tokenPointer,
        updatedAt,
        cues: cloneCues(editorSnapshot.cues),
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
      if (snapshotPayload && shouldPreserveSnapshot) {
        const serializedPayload = JSON.stringify(snapshotPayload)
        volatileDraftRecoveries.set(session.recording.id, {
          rawValue: serializedPayload,
          reason:
            error instanceof AdminDraftConflictError
              ? 'conflicting local cue draft was rejected'
              : 'local cue draft failed after the active recording changed',
        })
      }

      if (
        bindingGeneration !== sessionBindingGeneration ||
        getSession() !== session
      ) {
        options.showPersistenceNotice(
          `${session.recording.title} could not be saved after the recording changed. Its cues remain only in this open Reader; return to that recording and download the unsaved snapshot before navigating away or closing this tab.`
        )
        return false
      }

      state.volatileDraftRecovery =
        volatileDraftRecoveries.get(session.recording.id) ?? null
      draftEditor.markSaveProblem(
        error instanceof AdminDraftConflictError
          ? 'conflict'
          : error instanceof AdminDraftStorageError
            ? 'storage'
            : 'unknown'
      )
      syncPanel()
      return false
    }

    draftEditor.markSaved(updatedAt)
    syncPanel()
    options.onChange('draft')
    return true
  }

  const reportRejectedDraftCommit = () => {
    options.showPersistenceNotice(
      'Timing edit was not applied because the active authoring session changed. Reload timing and try again.'
    )
  }

  const applyDraftMutation = <Result>(
    mutate: () => Result | null
  ): { result: Result; snapshot: CueDraftEditorSnapshot } | null => {
    const checkpoint = draftSnapshot()
    const result = mutate()
    if (result === null) return null
    const snapshot = draftSnapshot()
    try {
      if (!playback.replaceCues(snapshot.cues)) {
        draftEditor.restore(checkpoint)
        reportRejectedDraftCommit()
        return null
      }
    } catch (error) {
      draftEditor.restore(checkpoint)
      throw error
    }
    waveform?.contentChanged()
    return { result, snapshot }
  }

  const commitDraftEdit = <Result>(
    mutate: () => Result | null,
    afterCommit?: (result: Result, snapshot: CueDraftEditorSnapshot) => void
  ) => {
    const committed = applyDraftMutation(mutate)
    if (!committed) return null
    afterCommit?.(committed.result, committed.snapshot)
    void saveDraft()
    options.onChange('playback')
    syncPanel()
    return committed.result
  }

  const clearSession = () => {
    issueDialog?.close()
    sessionBindingGeneration += 1
    boundSession = null
    draftEditor.clear()
    draftTimestampFloor = 0
    draftRevision = null
    state.volatileDraftRecovery = null
    state.recordingIssueSaveError = null
    state.cueDataResolution = null
    state.cueDataLoading = false
    state.cueDataRetrying = false
    waveform?.contentChanged()
    syncPanel()
  }

  const bindSession = async () => {
    issueDialog?.close()
    const generation = ++sessionBindingGeneration
    const session = playback.session()
    if (!session) {
      clearSession()
      return
    }
    boundSession = session

    const initialSourceCues = cloneCues(playback.readCues())
    const storedDraftResult = loadAdminDraftResult(
      session.recording,
      session.tokenKeys
    )
    const storedDraft = storedDraftResult.status === 'ready'
      ? storedDraftResult.draft
      : null
    const volatileDraftRecovery =
      volatileDraftRecoveries.get(session.recording.id) ?? null
    draftEditor.clear()
    draftTimestampFloor = storedDraft?.updatedAt ?? 0
    draftRevision = storedDraftResult.revision
    state.volatileDraftRecovery = volatileDraftRecovery
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
      getSession() !== session
    ) {
      return
    }

    const committed = applyDraftMutation(() => {
      draftEditor.bind({
        tokenKeys: session.tokenKeys,
        sourceCues,
        cues: draft?.cues ?? sourceCues,
        ...(draft ? { tokenPointer: draft.tokenPointer } : {}),
        origin: draft ? 'local' : sourceCues.length ? 'published' : 'none',
        savedAt,
      })
      return true
    })
    if (!committed) {
      state.cueDataResolution = cueDataResolution
      state.cueDataLoading = false
      state.cueDataRetrying = false
      syncPanel()
      return
    }
    state.recordingIssueSaveError = null
    state.cueDataResolution = cueDataResolution
    state.cueDataLoading = false
    state.cueDataRetrying = false
    syncPanel()
  }

  const isMicrophoneCaptureActive = () =>
    microphoneCapture.state === 'starting' ||
    microphoneCapture.state === 'recording' ||
    microphoneCapture.state === 'stopping'

  const isMicrophoneRecordingForSession = (
    session: ReaderPlaybackCueAuthoringSessionSnapshot | null
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

  const getEditableCueIndex = () =>
    draftEditor.editableCueIndex(
      playback.snapshot().activeTokenIndex
    )

  const activateCueToken = (tokenKey: string) =>
    playback.activateToken(tokenKey, {
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
    const session = getSession()
    if (!session?.tokenKeys.length) return

    const clampedIndex = Math.max(
      0,
      Math.min(index, session.tokenKeys.length - 1)
    )
    draftEditor.select(clampedIndex)
    const cue = draftSnapshot().cues[clampedIndex]
    if (seekToCue && cue) {
      if (!preservePlayback) playback.pause()
      playback.seek(cue.timeStart)
      options.onCueNavigationChange(clampedIndex)
    } else if (!play && !preservePlayback) {
      playback.pause()
    }

    const activation = activateCueToken(session.tokenKeys[clampedIndex])
    const playbackRequest =
      play && cue && options.playback.snapshot().paused
        ? options.playback.play(async () => {
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

    const [, playbackStarted] = await Promise.all([
      activation,
      playbackRequest,
    ])
    if (syncMode === 'full') {
      options.onChange('playback')
      syncPanel()
    }
    if (focusRow) focusCueRow(getEditableCueIndex())
    return playbackStarted ?? !play
  }

  const getTokenLabel = (index: number) => {
    const session = getSession()
    const cue = draftSnapshot().cues[index]
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
    const draft = draftSnapshot()
    if (!session) return 'Drafts autosave locally per recording.'
    if (state.cueDataLoading) {
      return 'Checking published timing and locally saved work.'
    }
    if (state.recordingIssueSaveError) {
      return state.recordingIssueSaveError
    }
    const saveProblem = draftSaveProblemMessage(draft.saveProblem)
    if (saveProblem) return saveProblem
    if (draft.origin === 'local' && draft.savedAt) {
      return (
        `Local draft active for ${session.recording.title}. ` +
        `Last saved at ${draftTimeFormat.format(draft.savedAt)}.`
      )
    }
    if (draft.sourceCues.length) {
      if (draft.savedAt) {
        return (
          `Published timing loaded for ${session.recording.title}. ` +
          `Last saved at ${draftTimeFormat.format(draft.savedAt)}.`
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
    const draft = draftSnapshot()
    const items = session && !state.cueDataLoading
      ? draft.cues.map((cue, index) => ({
          key: `${formatTokenKey(cue)}:${index}`,
          tokenLabel: getTokenLabel(index),
          timeStart: cue.timeStart,
          flags: pendingCueFlags(cue).map(flag => flag.message),
        }))
      : []
    const selectedCueIndex = session ? getEditableCueIndex() : -1
    const playingCueIndex =
      session && !draft.recording && draft.cues.length
        ? getCurrentCueIndex(
            draft.cues,
            playback.snapshot().currentTime
          )
        : -1
    const followCueIndex = draft.recording
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
    cues: readonly WordCue[],
    currentTime: number
  ) => {
    let cueIndex = -1
    for (let index = 0; index < cues.length; index += 1) {
      if (cues[index].timeStart <= currentTime) cueIndex = index
      else break
    }
    return cueIndex
  }

  const syncProgress = () => {
    const session = getSession()
    const draft = draftSnapshot()
    const playbackSnapshot = playback.snapshot()
    const currentTime = playbackSnapshot.displayTime
    const duration = playbackSnapshot.duration
    const progress =
      session && Number.isFinite(duration) && duration > 0
        ? Math.max(0, Math.min(1, currentTime / duration))
        : 0
    const cueIndex = session
      ? getCurrentCueIndex(draft.cues, currentTime)
      : -1
    const wordProgress = getWordProgress({
      cueIndex,
      cueCount: session ? draft.cues.length : 0,
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

  const hasLocalCueChanges = () => draftSnapshot().dirty

  const getPanelProblems = (): CueAuthoringPanelSnapshot['problems'] => {
    const problems: CueAuthoringPanelSnapshot['problems'] = []
    if (state.volatileDraftRecovery) {
      problems.push({
        id: 'volatile-draft-recovery',
        tone: 'error',
        title: 'Unsaved cue snapshot needs download',
        message:
          'This exact cue snapshot could not replace the current draft and exists only in this open Reader.',
        details: [
          'Download it now before navigating away, closing this tab, clearing browser data, or retrying the recording.',
          `Reason: ${state.volatileDraftRecovery.reason}`,
        ],
        action: {
          type: 'export-unsaved-draft',
          label: 'Download Unsaved Snapshot',
          pendingLabel: 'Preparing Snapshot...',
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
    const draft = draftSnapshot()
    const tokenCount = session?.tokenKeys.length ?? 0
    const hasSession = Boolean(session && tokenCount)
    const sessionReady = hasSession && !state.cueDataLoading
    const hasCues = draft.cues.length > 0
    const hasIncompleteDraft =
      sessionReady && hasCues && draft.cues.length < tokenCount
    const canResumeDraft = hasIncompleteDraft && !draft.recording
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
        draft.tokenPointer >= 0 ? draft.tokenPointer + 1 : 0
      cueCountText =
        `${draft.cues.length} / ${tokenCount} Words - ${counterPointer}`
    }
    if (!state.cueDataLoading && hasSession && session && draft.recording) {
      const pointer =
        Math.max(
          1,
          Math.min(
            (draft.tokenPointer >= 0
              ? draft.tokenPointer
              : draft.cues.length) + 1,
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
      draft.cues.length === tokenCount &&
      tokenCount > 0
    ) {
      statusText =
        `${session.recording.title}: all ${tokenCount} Words are timed. ` +
        'Select one to play, adjust, or export.'
    } else if (!state.cueDataLoading && hasSession && session) {
      const pointer =
        draft.cues.length < tokenCount
          ? Math.min(draft.cues.length + 1, tokenCount)
          : tokenCount
      statusText = hasCues
        ? `${session.recording.title}: ${draft.cues.length}/${tokenCount} ` +
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
      syncNoteVisible: draft.recording,
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
          : draft.recording
            ? recordingMicrophone
              ? 'audio'
              : 'timing'
            : 'idle',
      },
      canStepBack: sessionReady && draft.tokenPointer >= 0,
      canUndo: sessionReady && hasCues,
      canMarkIssue: sessionReady,
      canReset:
        sessionReady && (hasCues || draft.recording || draft.tokenPointer >= 0),
      canExport: sessionReady && draft.exportReady,
      canImport: sessionReady && !draft.recording && !microphoneBusy && !draft.saveProblem,
      exportChanged: hasLocalCueChanges(),
      resumeWord: canResumeDraft ? draft.cues.length + 1 : null,
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

  const startTimingRecording = (tokenPointer: number | null = null) => {
    clearCapturedAudio()
    draftEditor.startRecording({
      ...(tokenPointer === null ? {} : { tokenPointer }),
      activeTokenIndex: playback.snapshot().activeTokenIndex,
    })
    syncPanel()
    options.focusReader()
  }

  const resumeDraft = async () => {
    const session = getSession()
    const draft = draftSnapshot()
    if (!session?.tokenKeys.length || !draft.cues.length) return
    draftEditor.stopRecording()
    const lastSavedCueIndex = Math.max(
      0,
      Math.min(draft.cues.length - 1, session.tokenKeys.length - 1)
    )
    const playbackStarted = await selectToken(lastSavedCueIndex, { play: true })
    if (!playbackStarted || getSession() !== session) return
    startTimingRecording(draft.cues.length)
  }

  const resetRecorder = async ({
    playSource = true,
    scrollBehavior = 'smooth',
  }: {
    playSource?: boolean
    scrollBehavior?: ScrollBehavior
  } = {}) => {
    const session = getSession()
    if (!session) return false

    const activeTokenKey = commitDraftEdit(
      () => draftEditor.startFreshPass(),
      (_tokenKey, draft) => {
        options.onCueNavigationChange(draft.cues.length ? 0 : null)
        playback.pause()
        playback.seek(0)
      }
    )
    if (!activeTokenKey) return false

    await playback.activateToken(activeTokenKey, {
      scroll: true,
      scrollBehavior,
    })
    options.focusReader()
    if (playSource) {
      await playback.play(async () => {
        await resetRecorder({ playSource, scrollBehavior })
      })
    }
    return true
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
      draftSnapshot().cues.length &&
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
      const reset = await resetRecorder({
        playSource: false,
        scrollBehavior: 'auto',
      })
      if (!reset) {
        throw new Error('Cue Draft reset was rejected by the playback session')
      }
      return true
    } catch (error) {
      draftEditor.stopRecording()
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
    if (!draftSnapshot().recording && !isMicrophoneCaptureActive()) return false
    draftEditor.stopRecording()
    playback.pause()
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
    const session = getSession()
    const draft = draftSnapshot()
    if (!session || !draft.exportReady) return

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
    const exportCues = normalizeFirstCueStart(
      cloneCues(draft.cues)
    ).map(
      (cue, index) => ({
        cueNumber: index + 1,
        timeStart: cue.timeStart,
        ...(cue.timeEnd === undefined ? {} : { timeEnd: cue.timeEnd }),
        pageNumber: cue.pageNumber,
        lineIndex: cue.lineIndex,
        fragmentIndex: cue.fragmentIndex,
        wordIndex: cue.wordIndex,
        ...(cue.review ? { review: cue.review } : {}),
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
      savedAt: new Date().toISOString(),
      issues: [...options.getMergedRecordingIssues()],
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

  const exportUnsavedDraft = () => {
    const session = getSession()
    if (!session) return
    const volatileDraft = state.volatileDraftRecovery
      ? state.volatileDraftRecovery
      : null
    if (!volatileDraft) {
      syncPanel()
      options.showPersistenceNotice(
        'No unsaved cue snapshot is available for this recording.'
      )
      return
    }

    try {
      const serialized = `${JSON.stringify(
        JSON.parse(volatileDraft.rawValue),
        null,
        2
      )}\n`
      resetUnsavedDraftDownloadLink()
      unsavedDraftDownloadUrl = URL.createObjectURL(
        new Blob([serialized], { type: 'application/json' })
      )
      const download = document.createElement('a')
      const safeAudioId = session.recording.id.replace(/[^a-z0-9._-]+/gi, '-')
      download.href = unsavedDraftDownloadUrl
      download.download = `${safeAudioId}-unsaved-draft.json`
      download.hidden = true
      document.body.append(download)
      download.click()
      download.remove()
    } catch (error) {
      console.error(
        `Failed to export unsaved admin draft for ${session.recording.id}`,
        error
      )
      options.showPersistenceNotice(
        'The unsaved snapshot download could not be prepared. It remains only in this open Reader; retry before navigating away or closing this tab.'
      )
    }
  }

  const getCueClockSeconds = (
    session: ReaderPlaybackCueAuthoringSessionSnapshot
  ) =>
    isMicrophoneRecordingForSession(session)
      ? microphoneCapture.elapsedSeconds
      : playback.snapshot().currentTime

  const recordNextCue = () => {
    const session = getSession()
    if (!session) return
    commitDraftEdit(
      () =>
        draftEditor.record({
          activeTokenIndex: playback.snapshot().activeTokenIndex,
          timeStart: getCueClockSeconds(session),
        }),
      (result) => {
        void activateCueToken(result.tokenKey)
      }
    )
  }

  const stepBack = () => {
    const session = getSession()
    if (!session?.tokenKeys.length) return
    const recordingMicrophone = isMicrophoneRecordingForSession(session)
    const selectedCueIndex = getEditableCueIndex()
    const activeIndex = playback.snapshot().activeTokenIndex
    const draft = draftSnapshot()
    const originIndex =
      draft.recording && activeIndex >= 0
        ? activeIndex
        : selectedCueIndex
    const targetIndex =
      originIndex > 0
        ? originIndex - 1
        : draft.tokenPointer <= 0
          ? 0
          : Math.max(0, draft.tokenPointer - 1)
    void selectToken(targetIndex, {
      play: !recordingMicrophone,
      preservePlayback: true,
      seekToCue: !recordingMicrophone,
      syncMode: draft.recording ? 'step-back' : 'full',
    })
  }

  const undoLastCue = () => {
    if (!draftSnapshot().cues.length) return
    commitDraftEdit(
      () => ({ tokenKey: draftEditor.undo() }),
      ({ tokenKey }) => {
        if (tokenKey) void activateCueToken(tokenKey)
        else playback.clearHighlight()
      }
    )
  }

  const trimCuesFromSelection = () => {
    if (!getSession()) return
    commitDraftEdit(
      () => draftEditor.trim(playback.snapshot().activeTokenIndex),
      (tokenPointer) => {
        void selectToken(tokenPointer, { seekToCue: false })
      }
    )
  }

  const nudgeCue = (deltaSeconds: number) => {
    const duration = playback.snapshot().duration
    commitDraftEdit(
      () =>
        draftEditor.nudge({
          activeTokenIndex: playback.snapshot().activeTokenIndex,
          deltaSeconds,
          duration,
        }),
      (result) => {
        playback.pause()
        playback.seek(result.cue.timeStart)
        options.onCueNavigationChange(result.index)
        void playback.activateToken(formatTokenKey(result.cue), {
          scroll: options.getAutoScroll(),
        })
      }
    )
  }

  const handleCueListAction = (action: CueAuthoringCueListAction) => {
    const selectedCueIndex = getEditableCueIndex()
    switch (action.type) {
      case 'next-flag': {
        const nextIndex = nextFlaggedCueIndex(draftSnapshot().cues, selectedCueIndex)
        if (nextIndex >= 0) void selectToken(nextIndex, { focusRow: true })
        break
      }
      case 'review-flag':
        commitDraftEdit(() => {
          const cues = draftSnapshot().cues
          if (!cues[selectedCueIndex] || !pendingCueFlags(cues[selectedCueIndex]).length) return null
          draftEditor.replaceCues(cues.map((cue, index) => index === selectedCueIndex ? markCueReviewed(cue) : cue))
          return true
        })
        break
      case 'select':
        void selectToken(action.index)
        break
      case 'move': {
        const draft = draftSnapshot()
        const nextIndex = selectedCueIndex + action.delta
        if (
          selectedCueIndex >= 0 &&
          nextIndex >= 0 &&
          nextIndex < draft.cues.length
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
    pendingIssueAudioId = null
    pendingIssueTokenKey = null
    pendingIssueTimeStart = undefined
  }

  const closeIssueModal = () => issueDialog?.close()

  const persistIssueChanges = (nextIssues: RecordingIssue[]) => {
    const session = getSession()
    if (!session || session.recording.id !== pendingIssueAudioId || !pendingIssueTokenKey) {
      state.recordingIssueSaveError = 'The selected recording changed. Close this dialog and select the word again.'
      return false
    }
    let savedRevision: PersistedJsonRevision
    try {
      savedRevision = saveLocalRecordingIssues(
        options.localStorage,
        session.recording.id,
        TOKENIZATION_VERSION,
        nextIssues,
        options.getLocalRecordingIssueRevision()
      )
    } catch (error) {
      if (error instanceof RecordingIssueConflictError && error.latest.revision) {
        options.onLocalRecordingIssuesChanged(
          error.latest.issues,
          error.latest.revision
        )
        waveform?.contentChanged()
        syncCueList()
      }
      state.recordingIssueSaveError = error instanceof RecordingIssueConflictError
        ? 'Recording notes changed in another tab. Review them, then retry.'
        : 'This recording note could not be saved locally. Keep this dialog open and retry.'
      console.error(
        `Failed to save recording issues for ${session.recording.id}`,
        error
      )
      syncPanel()
      return false
    }
    state.recordingIssueSaveError = null
    waveform?.contentChanged()
    options.onLocalRecordingIssuesChanged(nextIssues, savedRevision)
    syncCueList()
    syncPanel()
    return true
  }

  const selectedIssue = (issueId: string) => options.getMergedRecordingIssues().find(issue =>
    issue.id === issueId && issue.audioId === pendingIssueAudioId && issue.tokenKey === pendingIssueTokenKey)

  const saveIssue = ({ issueId, kind, note, readerVisible }: CueAuthoringIssueInput) => {
    const session = getSession()
    const previous = issueId ? selectedIssue(issueId) : undefined
    if (!session || !pendingIssueTokenKey || session.recording.id !== pendingIssueAudioId || (issueId && !previous)) {
      state.recordingIssueSaveError = 'This issue or recording changed. Close this dialog and select the word again.'
      return false
    }
    const issue = createRecordingIssue({
      audioId: session.recording.id, tokenKey: pendingIssueTokenKey,
      timeStart: pendingIssueTimeStart, kind,
      visibility: readerVisible ? 'readerVisible' : 'authoringOnly',
      severity: kind === 'other' ? 'low' : 'medium', note,
      createdAt: Date.now(), tokenizationVersion: TOKENIZATION_VERSION,
    })
    const nextIssues = options.getLocalRecordingIssues().filter(candidate =>
      candidate.id !== previous?.id && !(candidate.tokenKey === issue.tokenKey && candidate.kind === issue.kind))
    if (previous && previous.kind !== kind) nextIssues.push({ ...previous, removed: true })
    return persistIssueChanges([...nextIssues, issue])
  }

  const removeIssue = (issueId: string) => {
    const issue = selectedIssue(issueId)
    if (!issue) {
      state.recordingIssueSaveError = 'This issue changed. Close this dialog and select the word again.'
      return false
    }
    return persistIssueChanges([
      ...options.getLocalRecordingIssues().filter(candidate =>
        !(candidate.tokenKey === issue.tokenKey && candidate.kind === issue.kind)),
      { ...issue, removed: true },
    ])
  }

  const openIssueModal = () => {
    const session = getSession()
    if (!session) return
    const tokenKey = options.getActiveTokenKey()
    if (!tokenKey) return
    if (!session.tokenKeys.includes(tokenKey)) {
      options.showPersistenceNotice('Select a word in the loaded recording before marking an issue.')
      return
    }
    const cue = draftSnapshot().cues.find(
      (candidate) => formatTokenKey(candidate) === tokenKey
    )
    pendingIssueAudioId = session.recording.id
    pendingIssueTokenKey = tokenKey
    pendingIssueTimeStart = cue?.timeStart ?? playback.snapshot().currentTime
    if (!issueDialog) {
      throw new Error('Cue Authoring Issue Dialog is not mounted')
    }
    state.recordingIssueSaveError = null
    issueDialog.open({
      issues: options.getMergedRecordingIssues().filter(issue =>
        issue.audioId === session.recording.id && issue.tokenKey === tokenKey),
      wordLabel: getTokenLabel(session.tokenKeys.indexOf(tokenKey)),
    })
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
      void playback.restoreReaderSession().catch((error) => {
        console.error(
          'Failed to restore the reader playback session',
          error
        )
      })
      return
    }

    void playback.prepareAuthoringSession().catch((error) => {
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

    const panelButton = event.target instanceof HTMLElement &&
      event.target.closest('[data-target-id="cue-authoring-panel-root"] button')
    if (isEditableTarget(event.target) &&
      !(event.code === 'Space' && isVisible() && panelButton)) return false
    if (!state.unlocked || !getSession()) {
      return false
    }
    if (event.code === 'Space' && isVisible() && !draftSnapshot().recording) {
      event.preventDefault()
      if (!event.repeat) {
        if (playback.snapshot().paused) void playback.play()
        else playback.pause()
      }
      return true
    }
    if (!draftSnapshot().recording) return false
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
    if (draftSnapshot().recording || isMicrophoneCaptureActive()) {
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
    if (!draftSnapshot().cues.length) {
      clearCapturedAudio()
      await resetRecorder()
      return
    }
    startTimingRecording()
  }

  const resetTiming = async () => {
    if (draftSnapshot().recording || isMicrophoneCaptureActive()) {
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
    const draft = draftSnapshot()
    const preserveLocalCues =
      draft.origin === 'local' || draft.dirty
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
      const savedAt = resolution.payload.savedAt
        ? Date.parse(resolution.payload.savedAt)
        : NaN
      const committed = applyDraftMutation(() => {
        draftEditor.applyPublishedSource({
          cues: publishedCues,
          savedAt: Number.isFinite(savedAt) ? savedAt : null,
          preserveDraft: preserveLocalCues,
        })
        return true
      })
      if (!committed) {
        state.cueDataRetrying = false
        syncPanel()
        return
      }
    } else {
      const committed = applyDraftMutation(() => {
        draftEditor.applyPublishedSource({
          cues: [],
          savedAt: null,
          preserveDraft: preserveLocalCues,
        })
        return true
      })
      if (!committed) {
        state.cueDataRetrying = false
        syncPanel()
        return
      }
    }
    state.cueDataRetrying = false
    options.onChange('cue-data')
    syncPanel()
  }

  const importCues = async (file: File) => {
    const session = getSession()
    const generation = sessionBindingGeneration
    if (!session || !getPanelSnapshot().canImport) return
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose one cue JSON file smaller than 5 MB. Unzip bulk downloads first.')
      const value: unknown = JSON.parse(await file.text())
      if (generation !== sessionBindingGeneration || getSession() !== session) {
        throw new Error('The recording changed while opening the file. Select it again for the matching recording.')
      }
      const cues = parseCueImport(value, session.recording, draftSnapshot().tokenKeys)
      if (!getPanelSnapshot().canImport) throw new Error('Stop recording and resolve any draft save problem before importing.')
      if (draftSnapshot().cues.length && !view.confirm(
        `Import ${cues.length} cues for ${session.recording.title} and replace its current local timings? Cancel to export your current draft first.`
      )) return
      playback.pause()
      const committed = applyDraftMutation(() => {
        draftEditor.replaceCues(cues)
        draftEditor.select(0)
        return true
      })
      if (!committed) return
      const saved = await saveDraft()
      options.onChange('playback')
      syncPanel()
      if (saved) options.showPersistenceNotice(`Imported ${cues.length} cues with ${cues.reduce((sum, cue) => sum + pendingCueFlags(cue).length, 0)} pending flags. Saved as a local draft.`)
    } catch (error) {
      console.error('Cue import failed', error)
      options.showPersistenceNotice(error instanceof Error ? error.message : 'Cue import failed. Your current draft is retained.')
    }
  }

  const handlePanelAction = (action: CueAuthoringPanelAction) => {
    switch (action.type) {
      case 'close':
        closeAccess()
        break
      case 'retry-cue-data':
        void retryPublishedCueData()
        break
      case 'export-unsaved-draft':
        exportUnsavedDraft()
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
      case 'import':
        void importCues(action.file)
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
    remove: removeIssue,
    getSaveError: () => state.recordingIssueSaveError,
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
      const playbackSnapshot = playback.snapshot()
      const draft = draftSnapshot()
      return {
        session,
        currentTime: playbackSnapshot.currentTime,
        duration: playbackSnapshot.duration,
        paused: playbackSnapshot.paused,
        ended: playbackSnapshot.ended,
        cues: draft.cues,
        issues: options.getMergedRecordingIssues(),
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
    seek: (time) => playback.seek(time),
  })
  scope.own(() => {
    waveform = null
  })
  scope.own(
    playback.subscribe((change, playbackSnapshot) => {
      if (
        change.type === 'session' ||
        change.type === 'playback' ||
        change.type === 'error'
      ) {
        syncPanel()
        if (change.type === 'session') waveform?.schedule()
        return
      }

      syncProgress()
      waveform?.schedule()
      if (change.type !== 'media-progress' || draftSnapshot().recording) return
      const session = getSession()
      const draft = draftSnapshot()
      if (!session || !draft.cues.length) return
      const cueIndex = getCurrentCueIndex(
        draft.cues,
        playbackSnapshot.currentTime
      )
      if (cueIndex >= 0 && isVisible()) cueList?.setCurrent(cueIndex)
    })
  )

  scope.own(() => {
    resetExportDownloadLinks()
    resetUnsavedDraftDownloadLink()
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
    isRecording: () => draftSnapshot().recording,
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
