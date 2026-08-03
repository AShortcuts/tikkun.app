import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type {
  ParshaAudioRecording,
  WordCue,
} from '../audio/types.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'
import {
  AudioController,
  type ActiveAudioSession,
} from './audio-controller.ts'
import { HighlightController } from './highlight-controller.ts'
import {
  createRecordingSession,
  type RecordingTarget,
} from './recording-session.ts'

const firstToken = '1:0:0:0'
const overlapToken = '1:0:0:1'
const lastToken = '1:0:0:2'

const firstRecording: ParshaAudioRecording = {
  id: 'reader:first',
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'fixture', name: 'Fixture' },
  parshaSlug: 'fixture',
  parshaName: 'Fixture',
  aliyah: 1,
  title: 'Fixture 1',
  playSrc: '/fixture-1.mp3',
  downloadSrc: '/fixture-1.mp3',
  format: 'mp3',
  status: 'available',
}

const secondRecording: ParshaAudioRecording = {
  ...firstRecording,
  id: 'reader:second',
  aliyah: 2,
  title: 'Fixture 2',
  playSrc: '/fixture-2.mp3',
  downloadSrc: '/fixture-2.mp3',
}

const missingSecondRecording: ParshaAudioRecording = {
  ...secondRecording,
  status: 'missing',
}

const firstCues: WordCue[] = [
  {
    timeStart: 1,
    pageNumber: 1,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex: 0,
  },
  {
    timeStart: 2,
    pageNumber: 1,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex: 1,
  },
]

const secondCues: WordCue[] = [
  {
    timeStart: 1,
    pageNumber: 1,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex: 1,
  },
  {
    timeStart: 2,
    pageNumber: 1,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex: 2,
  },
]

let audio: HTMLAudioElement
let book: HTMLElement
let audioController: AudioController
let highlightController: HighlightController

beforeEach(() => {
  audio = document.createElement('audio')
  book = document.createElement('main')
  document.body.append(audio, book)
  Object.defineProperty(audio, 'readyState', {
    configurable: true,
    value: HTMLMediaElement.HAVE_METADATA,
  })
  vi.spyOn(audio, 'load').mockImplementation(() => {})
  vi.spyOn(audio, 'pause').mockImplementation(() => {})
  vi.spyOn(audio, 'play').mockResolvedValue()
  audioController = new AudioController(audio)
  highlightController = new HighlightController(book)
  vi.spyOn(highlightController, 'activateCue').mockResolvedValue(null)
  vi.spyOn(highlightController, 'activateTokenKey').mockResolvedValue(null)
})

afterEach(() => {
  audioController.destroy()
  audio.remove()
  book.remove()
  vi.restoreAllMocks()
})

function createRunFixture() {
  const date: LeiningDate = {
    date: new Date(2026, 0, 1),
    id: '2026-01-01',
    title: { en: 'Fixture', he: 'Fixture' },
    leinings: [],
  }
  const leining: LeiningInstance = {
    date,
    id: LeiningInstanceId.Shacharis,
    isParsha: true,
    runs: [],
  }
  const run: LeiningRun = {
    id: 'fixture-run',
    type: LeiningRunType.Main,
    leining,
    scroll: 'torah',
    aliyot: [
      {
        index: 1,
        start: { scroll: 'torah', b: 1, c: 1, v: 1 },
        end: { scroll: 'torah', b: 1, c: 2, v: 1 },
      },
      {
        index: 2,
        start: { scroll: 'torah', b: 1, c: 2, v: 1 },
        end: { scroll: 'torah', b: 1, c: 3, v: 1 },
      },
    ],
  }
  leining.runs = [run]
  date.leinings = [leining]
  return run
}

function createHarness({
  includeSecondRecording = true,
}: {
  includeSecondRecording?: boolean
} = {}) {
  const run = createRunFixture()
  let authoringVisible = false
  let authoringSession: ActiveAudioSession | null = null
  const collectTokenKeys = vi.fn(async ({ aliyahIndex }: RecordingTarget) =>
    aliyahIndex === 1
      ? [firstToken, overlapToken]
      : [overlapToken, lastToken]
  )
  const loadCues = vi.fn(async (recording: ParshaAudioRecording) =>
    recording.status === 'missing'
      ? []
      : recording.id === firstRecording.id
        ? firstCues
        : secondCues
  )
  const sessionLoaded = vi.fn()
  const session = createRecordingSession({
    audioController,
    highlightController,
    library: {
      findRecording: ({ aliyahIndex }) =>
        aliyahIndex === 1
          ? firstRecording
          : includeSecondRecording
            ? secondRecording
            : null,
      findAuthoringRecording: ({ aliyahIndex }) =>
        aliyahIndex === 1
          ? firstRecording
          : includeSecondRecording
            ? secondRecording
            : missingSecondRecording,
      listRecordings: () => [firstRecording, secondRecording],
      loadCues,
    },
    display: {
      resolveRun: (runId) => (runId === run.id ? run : null),
      collectTokenKeys,
      waitUntilReady: async () => {},
      resolveRunForRecording: () => run,
    },
    authoring: {
      isActive: () => authoringVisible,
      isVisible: () => authoringVisible,
      getSession: () => authoringSession,
      bindSession: async (activeSession) => {
        authoringSession = activeSession
      },
      clearSession: () => {
        authoringSession = null
      },
    },
    presentation: {
      setCueIndex: vi.fn(),
      sessionLoaded,
    },
    getNarratorId: () => 'reader',
    recordingMode: false,
  })

  return {
    run,
    session,
    collectTokenKeys,
    loadCues,
    sessionLoaded,
    setAuthoringVisible(visible: boolean) {
      authoringVisible = visible
    },
    clearAuthoringSession() {
      authoringSession = null
    },
  }
}

test('loads, clones, activates, and caches a reader recording transaction', async () => {
  const harness = createHarness()

  const loaded = await harness.session.load({
    runId: harness.run.id,
    aliyahIndex: 1,
  })
  expect(loaded?.status).toBe('current-only')
  expect(highlightController.activateCue).toHaveBeenCalled()
  expect(harness.sessionLoaded).toHaveBeenCalledWith(loaded)
  expect(harness.collectTokenKeys).toHaveBeenCalledOnce()

  loaded!.segments[0]!.cues[0]!.timeStart = 9
  expect(firstCues[0]?.timeStart).toBe(1)

  await harness.session.load({
    runId: harness.run.id,
    aliyahIndex: 1,
  })
  expect(harness.collectTokenKeys).toHaveBeenCalledOnce()
  expect(harness.session.tokenCacheSize()).toBe(1)
})

test('finishes the initial cue activation before publishing the session', async () => {
  const harness = createHarness()
  let finishActivation!: (value: HTMLElement | null) => void
  const activation = new Promise<HTMLElement | null>((resolve) => {
    finishActivation = resolve
  })
  vi.mocked(highlightController.activateCue).mockReturnValueOnce(activation)

  const pending = harness.session.load({
    runId: harness.run.id,
    aliyahIndex: 1,
  })
  await vi.waitFor(() =>
    expect(highlightController.activateCue).toHaveBeenCalledOnce()
  )

  expect(harness.sessionLoaded).not.toHaveBeenCalled()
  finishActivation(null)

  const loaded = await pending
  expect(loaded).not.toBeNull()
  expect(harness.sessionLoaded).toHaveBeenCalledWith(loaded)
})

test('keeps overlap availability distinct from the current recording', async () => {
  const harness = createHarness({ includeSecondRecording: false })
  const availability = harness.session.lookup(harness.run, 2)

  expect(availability.recording).toBeNull()
  expect(availability.overlapRecording?.id).toBe(firstRecording.id)
  expect(availability.available).toBe(true)

  const loaded = await harness.session.load({
    runId: harness.run.id,
    aliyahIndex: 2,
  })
  expect(loaded?.status).toBe('overlap-only')
})

test('creates an authoring session for an aliyah with no published audio', async () => {
  const harness = createHarness({ includeSecondRecording: false })
  harness.setAuthoringVisible(true)

  const loaded = await harness.session.load(
    { runId: harness.run.id, aliyahIndex: 2 },
    { mode: 'authoring' }
  )

  expect(loaded?.recording).toBe(missingSecondRecording)
  expect(loaded?.recording.status).toBe('missing')
  expect(loaded?.status).toBe('current-only')
  expect(loaded?.segments).toHaveLength(1)
  expect(loaded?.tokenKeys).toEqual([overlapToken, lastToken])
  expect(harness.sessionLoaded).toHaveBeenCalledWith(loaded)
})

test('reset discards an authoring checkpoint from the previous route', async () => {
  const harness = createHarness()
  const readerSession = await harness.session.load({
    runId: harness.run.id,
    aliyahIndex: 1,
  })
  expect(readerSession).not.toBeNull()
  audioController.seek(1.5)
  harness.setAuthoringVisible(true)

  await harness.session.enterAuthoring()
  const authoringSession = audioController.session
  expect(authoringSession).not.toBe(readerSession)

  harness.session.reset()
  harness.clearAuthoringSession()
  harness.setAuthoringVisible(false)
  await harness.session.leaveAuthoring()

  expect(audioController.session).toBe(authoringSession)
  expect(audioController.session).not.toBe(readerSession)
})
