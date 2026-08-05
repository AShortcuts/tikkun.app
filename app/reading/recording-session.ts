import type { AudioRecording, WordCue } from '../audio/types.ts'
import { isParshaAudioRecording } from '../audio/types.ts'
import type { LeiningRun } from '../calendar-model/model-types.ts'
import { compareRefs } from '../calendar-model/ref-utils.ts'
import {
  AuthoringSessionTransition,
  createAuthoringPlaybackPlan,
  isAuthoringSession,
} from '../admin/authoring-session.ts'
import { getAliyahNavigationEntriesForRun } from './aliyah-navigation/model.ts'
import type { PlaybackAliyahIndex } from './aliyah-dom-target.ts'
import {
  createActiveAudioSession,
  type ActiveAudioSession,
  type AudioController,
} from './audio-controller.ts'
import type { HighlightController } from './highlight-controller.ts'
import { buildPlaybackPlan } from './playback-plan.ts'

export interface RecordingSessionLibrary {
  findRecording(input: {
    narratorId: string
    run: LeiningRun
    aliyahIndex: PlaybackAliyahIndex
  }): AudioRecording | null
  findAuthoringRecording(input: {
    narratorId: string
    run: LeiningRun
    aliyahIndex: PlaybackAliyahIndex
  }): AudioRecording | null
  listRecordings(): readonly AudioRecording[]
  loadCues(recording: AudioRecording): Promise<readonly WordCue[]>
}

export interface RecordingSessionDisplay {
  resolveRun(runId: string): LeiningRun | null
  collectTokenKeys(target: RecordingTarget): Promise<string[]>
  waitUntilReady(): Promise<void>
  resolveRunForRecording(recording: AudioRecording): LeiningRun | null
}

export interface RecordingSessionAuthoring {
  isActive(): boolean
  isVisible(): boolean
  getSession(): ActiveAudioSession | null
  bindSession(session: ActiveAudioSession): Promise<void>
  clearSession(): void
}

export interface RecordingSessionPresentation {
  setCueIndex(index: number | null): Promise<void> | void
  sessionLoaded(session: ActiveAudioSession): void
}

export interface RecordingSessionOptions {
  audioController: AudioController
  highlightController: HighlightController
  library: RecordingSessionLibrary
  display: RecordingSessionDisplay
  authoring: RecordingSessionAuthoring
  presentation: RecordingSessionPresentation
  getNarratorId(): string
  recordingMode: boolean
}

export interface RecordingTarget {
  runId: string
  aliyahIndex: PlaybackAliyahIndex
}

export interface RecordingAvailability {
  recording: AudioRecording | null
  overlapRecording: AudioRecording | null
  available: boolean
}

export interface RecordingSession {
  lookup(
    run: LeiningRun,
    aliyahIndex: PlaybackAliyahIndex
  ): RecordingAvailability
  load(
    target: RecordingTarget,
    options?: { mode?: 'reader' | 'authoring' }
  ): Promise<ActiveAudioSession | null>
  loadByAudioId(audioId: string): Promise<ActiveAudioSession | null>
  enterAuthoring(): Promise<void>
  leaveAuthoring(): Promise<void>
  reset(): void
  tokenCacheSize(): number
}

type LoadLifetime = {
  generation: number
  signal: AbortSignal
}

const cloneCues = (cues: readonly WordCue[]) =>
  cues.map((cue) => ({ ...cue }))

export function createRecordingSession(
  options: RecordingSessionOptions
): RecordingSession {
  const {
    audioController,
    highlightController,
    library,
    display,
    authoring,
    presentation,
  } = options
  const tokenKeysByTarget = new Map<string, string[]>()
  const authoringTransition = new AuthoringSessionTransition()
  let loadGeneration = 0
  let loadController: AbortController | null = null

  const beginLoad = (): LoadLifetime => {
    loadController?.abort()
    loadController = new AbortController()
    return {
      generation: ++loadGeneration,
      signal: loadController.signal,
    }
  }

  const isCurrent = (lifetime: LoadLifetime) =>
    lifetime.generation === loadGeneration &&
    loadController?.signal === lifetime.signal &&
    !lifetime.signal.aborted

  const cancelLoad = () => {
    loadGeneration += 1
    loadController?.abort()
    loadController = null
  }

  const targetKey = ({ runId, aliyahIndex }: RecordingTarget) =>
    `${runId}:${aliyahIndex}`

  const collectTokenKeys = async (
    target: RecordingTarget,
    lifetime: LoadLifetime
  ) => {
    const key = targetKey(target)
    const cached = tokenKeysByTarget.get(key)
    if (cached) return [...cached]
    const tokenKeys = await display.collectTokenKeys(target)
    if (!isCurrent(lifetime)) return []
    if (tokenKeys.length) tokenKeysByTarget.set(key, [...tokenKeys])
    return [...tokenKeys]
  }

  const currentRecording = (
    run: LeiningRun,
    aliyahIndex: PlaybackAliyahIndex
  ) =>
    library.findRecording({
      narratorId: options.getNarratorId(),
      run,
      aliyahIndex,
    })

  const previousEntry = (
    run: LeiningRun,
    aliyahIndex: PlaybackAliyahIndex
  ) => {
    const entries = getAliyahNavigationEntriesForRun(run)
    const index = entries.findIndex(
      (entry) =>
        entry.run.id === run.id && entry.aliyah.index === aliyahIndex
    )
    return {
      target: index >= 0 ? entries[index] : null,
      previous: index > 0 ? entries[index - 1] : null,
    }
  }

  const overlapRecording = (
    run: LeiningRun,
    aliyahIndex: PlaybackAliyahIndex
  ) => {
    const { target, previous } = previousEntry(run, aliyahIndex)
    if (
      !target ||
      !previous?.aliyah.index ||
      target.aliyah.start.scroll !== previous.aliyah.end.scroll ||
      compareRefs(target.aliyah.start, previous.aliyah.start) < 0 ||
      compareRefs(target.aliyah.start, previous.aliyah.end) > 0
    ) {
      return null
    }
    return currentRecording(previous.run, previous.aliyah.index)
  }

  const lookup = (
    run: LeiningRun,
    aliyahIndex: PlaybackAliyahIndex
  ): RecordingAvailability => {
    const recording = currentRecording(run, aliyahIndex)
    const previous = overlapRecording(run, aliyahIndex)
    return {
      recording,
      overlapRecording: previous,
      available: Boolean(recording || previous),
    }
  }

  const loadTransaction = async (
    target: RecordingTarget,
    {
      mode = 'reader',
      recordingOverride,
    }: {
      mode?: 'reader' | 'authoring'
      recordingOverride?: AudioRecording | null
    } = {}
  ) => {
    const lifetime = beginLoad()
    const run = display.resolveRun(target.runId)
    if (!run) return null
    const tokenKeys = await collectTokenKeys(target, lifetime)
    if (!isCurrent(lifetime) || !tokenKeys.length) return null

    const useAuthoringPlan = mode === 'authoring' || authoring.isActive()

    const recording =
      recordingOverride === undefined
        ? mode === 'authoring'
          ? library.findAuthoringRecording({
              narratorId: options.getNarratorId(),
              run,
              aliyahIndex: target.aliyahIndex,
            })
          : currentRecording(run, target.aliyahIndex)
        : recordingOverride
    const current = recording
      ? {
          recording,
          cues: cloneCues(await library.loadCues(recording)),
        }
      : null
    if (!isCurrent(lifetime)) return null

    let previous: { recording: AudioRecording; cues: WordCue[] } | null = null
    let previousTokenKeys: string[] = []
    if (!options.recordingMode && !useAuthoringPlan) {
      const entry = previousEntry(run, target.aliyahIndex).previous
      if (entry?.aliyah.index) {
        const recording = currentRecording(entry.run, entry.aliyah.index)
        if (recording) {
          const previousTarget = {
            runId: entry.run.id,
            aliyahIndex: entry.aliyah.index,
          }
          previousTokenKeys = await collectTokenKeys(previousTarget, lifetime)
          if (!isCurrent(lifetime)) return null
          previous = {
            recording,
            cues: cloneCues(await library.loadCues(recording)),
          }
        }
      }
    }
    if (!isCurrent(lifetime)) return null

    const plan = buildPlaybackPlan({
      target: { runId: target.runId, index: target.aliyahIndex },
      tokenKeys,
      current,
      previous,
      previousTokenKeys,
    })
    if (!plan) return null
    const sessionPlan = useAuthoringPlan
      ? recording && createAuthoringPlaybackPlan(plan, recording.id)
      : plan
    if (!sessionPlan || !isCurrent(lifetime)) return null
    const session = createActiveAudioSession(sessionPlan)

    await audioController.loadSession(session)
    if (!isCurrent(lifetime)) return null
    highlightController.setSequence(tokenKeys)
    const startCue = session.cues[0]
    if (startCue) {
      audioController.seek(startCue.timeStart)
      await presentation.setCueIndex(0)
      if (!isCurrent(lifetime)) return null
      await highlightController.activateCue(startCue, { scroll: true })
    } else if (session.tokenKeys[0]) {
      await highlightController.activateTokenKey(session.tokenKeys[0], {
        scroll: true,
      })
    }
    if (!isCurrent(lifetime)) return null

    if (isAuthoringSession(session)) {
      await authoring.bindSession(session)
      if (!isCurrent(lifetime)) return null
      await presentation.setCueIndex(
        session.cues.length && audioController.currentTime
          ? highlightController.getCueIndex(
              session.cues,
              audioController.currentTime
            )
          : session.cues.length
            ? 0
            : null
      )
    } else {
      authoring.clearSession()
    }
    if (!isCurrent(lifetime)) return null

    presentation.sessionLoaded(session)
    return session
  }

  const load: RecordingSession['load'] = (target, { mode = 'reader' } = {}) =>
    loadTransaction(target, { mode })

  const loadByAudioId = async (audioId: string) => {
    const recording =
      library.listRecordings().find((entry) => entry.id === audioId) ?? null
    if (!recording || !isParshaAudioRecording(recording)) return null
    await display.waitUntilReady()
    const run = display.resolveRunForRecording(recording)
    if (!run) return null
    const session = await loadTransaction(
      { runId: run.id, aliyahIndex: recording.aliyah },
      { recordingOverride: recording }
    )
    if (!session) return null
    const lifetime = {
      generation: loadGeneration,
      signal: loadController?.signal ?? AbortSignal.abort(),
    }
    await audioController.waitForFiniteDuration({ signal: lifetime.signal })
    return isCurrent(lifetime) ? session : null
  }

  const enterAuthoring = async () => {
    const session = audioController.session
    if (
      !session ||
      authoring.getSession() ||
      session.status === 'overlap-only'
    ) {
      return
    }
    const currentSegment = session.segments[session.segments.length - 1]
    if (
      !currentSegment ||
      currentSegment.recording.id !== session.recording.id
    ) {
      return
    }

    const transition = authoringTransition.begin(
      session,
      audioController.currentTime
    )
    audioController.pause()
    const authoringSession = await loadTransaction(
      { runId: session.runId, aliyahIndex: session.aliyahIndex },
      { mode: 'authoring', recordingOverride: session.recording }
    )
    if (
      !authoringTransition.isCurrent(transition) ||
      !authoring.isVisible()
    ) {
      return
    }
    if (!authoringSession || !isAuthoringSession(authoringSession)) {
      throw new Error(
        `Could not create an authoring session for ${session.recording.id}`
      )
    }
  }

  const leaveAuthoring = async () => {
    const snapshot = authoringTransition.leave()
    if (!snapshot) return
    cancelLoad()
    audioController.pause()
    await audioController.loadSession(snapshot.session)
    if (
      authoring.isVisible() ||
      audioController.session !== snapshot.session
    ) {
      return
    }
    audioController.seek(snapshot.currentTime)
    presentation.sessionLoaded(snapshot.session)
  }

  const reset = () => {
    cancelLoad()
    tokenKeysByTarget.clear()
    authoringTransition.leave()
  }

  return {
    lookup,
    load,
    loadByAudioId,
    enterAuthoring,
    leaveAuthoring,
    reset,
    tokenCacheSize: () => tokenKeysByTarget.size,
  }
}
