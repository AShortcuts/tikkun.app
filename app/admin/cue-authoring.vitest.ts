import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import { createCueDraftPayload } from '../audio/cue-draft.ts'
import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import {
  createRecordingIssue,
  loadLocalRecordingIssues,
  mergePublishedAndLocalRecordingIssues,
  saveLocalRecordingIssues,
  type RecordingIssue,
} from '../audio/recording-issues.ts'
import { createMount } from '../lifecycle/mount.ts'
import {
  AudioController,
  createActiveAudioSession,
} from '../reading/audio-controller.ts'
import { HighlightController } from '../reading/highlight-controller.ts'
import { buildPlaybackPlan } from '../reading/playback-plan.ts'
import type {
  ReaderPlaybackCueAuthoringAdapter,
  ReaderPlaybackCueAuthoringChange,
  ReaderPlaybackCueAuthoringSnapshot,
  ReaderPlaybackCueAuthoringSessionSnapshot,
} from '../reading/reader-playback.ts'
import { replaceAuthoringSessionCues } from './authoring-session.ts'
import { createCueAuthoring, type CueAuthoring } from './cue-authoring.ts'
import { incompleteCueSessionFixture } from './cue-authoring.fixture.ts'
import { saveAdminDraftPayload } from './draft-storage.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null
let restoreClipboard: (() => void) | null = null

afterEach(async () => {
  destroy?.()
  destroy = null
  await Promise.all(
    ['current', 'missing'].map((audioId) =>
      navigator.locks.request(
        `tikkun-admin-draft:${audioId}`,
        { mode: 'exclusive' },
        () => undefined
      )
    )
  )
  restoreClipboard?.()
  restoreClipboard = null
  fixture?.remove()
  fixture = null
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

test('owns its DOM listeners across replacement mounts without duplicating editor UI', () => {
  const { audioController, highlightController } = createFixture()
  const mount = createMount()
  const firstRestore = vi.fn(async () => {})
  const secondRestore = vi.fn(async () => {})
  let first: CueAuthoring | null = null
  let second: CueAuthoring | null = null

  mount((scope) => {
    first = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        restoreReaderSession: firstRestore,
      })
    )
  })
  first!.setVisible(true)

  destroy = mount((scope) => {
    second = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        restoreReaderSession: secondRestore,
      })
    )
  })
  second!.setVisible(true)
  required<HTMLButtonElement>('[data-target-id="admin-close"]').click()

  expect(
    document.querySelectorAll('[data-target-id="admin-draft-status"]')
  ).toHaveLength(1)
  expect(firstRestore).not.toHaveBeenCalled()
  expect(secondRestore).toHaveBeenCalledTimes(1)
  expect(second!.isVisible()).toBe(false)
})

test('surfaces malformed published Cue Data and recovers it without leaving authoring', async () => {
  const { audioController, highlightController } = createFixture()
  const publishedCue = {
    ...cue(tokenKeys[0], 0),
    cueNumber: 1,
  }
  const resolve = vi.fn(async () => ({
    status: 'invalid' as const,
    path: '../../audio-cues/reader/test/1.json',
    payload: null,
    problem: {
      code: 'invalid-payload' as const,
      message: 'The published Cue Data file is not valid.',
      details: ['$: This looks like a local Cue Draft.'],
    },
  }))
  const retry = vi.fn(async () => ({
    status: 'ready' as const,
    path: '../../audio-cues/reader/test/1.json',
    payload: {
      audioId: 'current',
      audioFormat: 'mp3' as const,
      narratorId: 'reader',
      readingId: 'test',
      aliyah: 1,
      tokenCount: tokenKeys.length,
      cueCount: 1,
      tokenizationVersion: TOKENIZATION_VERSION,
      savedAt: '2026-08-03T12:00:00.000Z',
      cues: [publishedCue],
    },
  }))
  let cueAuthoring: CueAuthoring | null = null

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        cueData: { resolve, retry },
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [],
      },
    })!
  )

  await audioController.loadSession(session)
  await cueAuthoring!.bindSession()

  expect(cueAuthoring!.getSession()?.recording.id).toBe(session.recording.id)
  expect(session.cues).toEqual([])
  expect(resolve).toHaveBeenCalledWith(session.recording)
  expect(
    required('[data-admin-problem="published-cue-data"]').textContent
  ).toContain('Published cue file needs repair')

  required<HTMLButtonElement>(
    '[data-admin-problem-action="retry-cue-data"]'
  ).click()
  await vi.waitFor(() => {
    expect(retry).toHaveBeenCalledWith(session.recording)
    expect(session.cues).toEqual([publishedCue])
  })
  expect(
    document.querySelector('[data-admin-problem="published-cue-data"]')
  ).toBeNull()
  expect(
    required('[data-target-id="admin-draft-status"]').textContent
  ).toContain('Published timing loaded')
})

test('loads an incomplete 137-of-334 published session as resumable', async () => {
  const { tokenKeys: incompleteTokenKeys, cues: publishedCues } =
    incompleteCueSessionFixture
  const { audioController, highlightController } = createFixture(
    incompleteTokenKeys
  )
  const activeRecording = recording('current', 1)
  let finishResolve!: (
    value: ReturnType<typeof readyCueData>
  ) => void
  const resolution = new Promise<ReturnType<typeof readyCueData>>((resolve) => {
    finishResolve = resolve
  })
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        cueData: {
          resolve: () => resolution,
          retry: async () =>
            readyCueData(
              activeRecording,
              publishedCues,
              incompleteTokenKeys.length
            ),
        },
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys: incompleteTokenKeys,
      current: { recording: activeRecording, cues: [] },
    })!
  )
  await audioController.loadSession(session)

  const binding = cueAuthoring.bindSession()
  await vi.waitFor(() => {
    expect(required('[data-target-id="admin-status"]').textContent).toContain(
      'loading published timing'
    )
  })
  expect(
    required<HTMLButtonElement>('[data-target-id="admin-record"]').disabled
  ).toBe(true)
  expect(document.querySelectorAll('[data-admin-cue-index]')).toHaveLength(0)
  expect(
    required<HTMLElement>('[data-target-id="admin-resume-wrap"]').hidden
  ).toBe(true)

  finishResolve(
    readyCueData(
      activeRecording,
      publishedCues,
      incompleteTokenKeys.length
    )
  )
  await binding

  expect(session.cues).toHaveLength(incompleteCueSessionFixture.cueCount)
  expect(document.querySelectorAll('[data-admin-cue-index]')).toHaveLength(
    incompleteCueSessionFixture.cueCount
  )
  expect(
    required<HTMLElement>('[data-target-id="admin-resume-wrap"]').hidden
  ).toBe(false)
  expect(required('[data-target-id="admin-cue-count"]').textContent).toBe(
    '137 / 334 Words - 138'
  )
  expect(
    required('[data-target-id="admin-resume-draft"]').getAttribute(
      'aria-label'
    )
  ).toContain('Word 138')
  expect(
    document.querySelector('[data-admin-problem="published-cue-data"]')
  ).toBeNull()
})

test('does not let an empty local draft suppress published timing', async () => {
  const { audioController, highlightController } = createFixture()
  const activeRecording = recording('current', 1)
  const publishedCue = {
    ...cue(tokenKeys[0], 0),
    cueNumber: 1,
  }
  let cueAuthoring!: CueAuthoring

  localStorage.setItem(
    'tikkun-admin-draft:current',
    JSON.stringify({
      ...draftRecordingIdentity(activeRecording),
      tokenCount: tokenKeys.length,
      tokenPointer: -1,
      tokenizationVersion: TOKENIZATION_VERSION,
      updatedAt: 200,
      cues: [],
    })
  )
  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        cueData: {
          resolve: async () => readyCueData(activeRecording, [publishedCue]),
          retry: async () => readyCueData(activeRecording, [publishedCue]),
        },
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: { recording: activeRecording, cues: [publishedCue] },
    })!
  )
  await audioController.loadSession(session)
  await cueAuthoring.bindSession()

  expect(session.cues).toEqual([publishedCue])
  expect(document.querySelectorAll('[data-admin-cue-index]')).toHaveLength(1)
  expect(required<HTMLElement>('[data-target-id="admin-resume-wrap"]').hidden).toBe(false)
  expect(required('[data-target-id="admin-draft-status"]').textContent).toContain(
    'Published timing loaded'
  )
})

test('restores access and binds a validated local Cue Draft to one authoring session', async () => {
  const { audioController, highlightController } = createFixture()
  const prepareAuthoringSession = vi.fn(async () => {})
  let cueAuthoring: CueAuthoring | null = null

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        prepareAuthoringSession,
      })
    )
  })

  sessionStorage.setItem('tikkun-admin-unlocked', '1')
  sessionStorage.setItem('tikkun-admin-panel-open', '1')
  cueAuthoring!.restoreAccessState()
  expect(cueAuthoring!.isActive()).toBe(true)
  expect(prepareAuthoringSession).toHaveBeenCalledTimes(1)

  const tokenKeys = ['1:0:0:0', '1:0:0:1']
  const activeRecording = recording('current', 1)
  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: activeRecording,
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  const draftCues = [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)]
  localStorage.setItem(
    'tikkun-admin-draft:current',
    JSON.stringify({
      ...draftRecordingIdentity(activeRecording),
      tokenCount: tokenKeys.length,
      tokenPointer: 1,
      tokenizationVersion: TOKENIZATION_VERSION,
      updatedAt: 100,
      cues: draftCues,
    })
  )

  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring!.bindSession()

  expect(session.cues).toEqual(draftCues)
  expect(
    required<HTMLElement>('[data-target-id="admin-cue-count"]')
      .textContent
  ).toBe('2 / 2 Words - 2')
  expect(document.querySelectorAll('[data-admin-cue-index]')).toHaveLength(2)

  required<HTMLButtonElement>('[data-target-id="admin-record"]').click()
  expect(cueAuthoring!.isRecording()).toBe(true)
})

test('resumes an incomplete draft by previewing its last cue before recording the next word', async () => {
  const { audioController, highlightController } = createFixture()
  let startPlayback!: () => void
  let playbackAttempt = 0
  const playNetworkRecording = vi.fn(() => {
    playbackAttempt += 1
    if (playbackAttempt === 1) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
        startPlayback = () => resolve(true)
      })
  })
  const focusReader = vi.fn()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        playNetworkRecording,
        focusReader,
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()

  const resumeDraft = required<HTMLButtonElement>(
    '[data-target-id="admin-resume-draft"]'
  )
  resumeDraft.click()
  await vi.waitFor(() => expect(playNetworkRecording).toHaveBeenCalledOnce())

  expect(cueAuthoring.isRecording()).toBe(false)
  expect(highlightController.getActiveTokenKey()).toBe(tokenKeys[0])
  expect(focusReader).not.toHaveBeenCalled()

  resumeDraft.click()
  await vi.waitFor(() => expect(playNetworkRecording).toHaveBeenCalledTimes(2))
  expect(cueAuthoring.isRecording()).toBe(false)

  startPlayback()
  await vi.waitFor(() => expect(cueAuthoring.isRecording()).toBe(true))

  expect(focusReader).toHaveBeenCalledOnce()
  expect(
    required('[data-target-id="admin-status"]').textContent
  ).toContain('recording Word 2')
  expect(
    required('[data-target-id="admin-record"]').getAttribute('aria-label')
  ).toBe('Stop recording word timings and switch to playback review')
  expect(
    required<HTMLElement>('[data-target-id="admin-resume-wrap"]').hidden
  ).toBe(true)
})

test('requires synchronized microphone capture for a missing recording', async () => {
  const { audioController, highlightController } = createFixture()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

  const missing = { ...recording('missing', 1), status: 'missing' as const }
  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: { recording: missing, cues: [] },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()

  const captureAudio = required<HTMLInputElement>(
    '[data-target-id="admin-capture-audio"]'
  )
  expect(captureAudio.checked).toBe(true)
  expect(captureAudio.disabled).toBe(true)
  expect(
    required('[data-target-id="admin-status"]').textContent
  ).toContain('no published audio')
})

test('keeps cue selection, seeking, focus, and timing edits behind TypeScript', async () => {
  const { audioController, highlightController } = createFixture()
  const onCueNavigationChange = vi.fn()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        onCueNavigationChange,
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()

  const firstRow = required<HTMLButtonElement>(
    '[data-admin-cue-index="0"]'
  )
  firstRow.click()
  await vi.waitFor(() => {
    expect(firstRow.classList.contains('is-selected')).toBe(true)
  })
  expect(onCueNavigationChange).toHaveBeenLastCalledWith(0)
  expect(highlightController.getActiveTokenKey()).toBe(tokenKeys[0])

  await cueAuthoring.selectReaderToken(1, { focusRow: true })
  const secondRow = required<HTMLButtonElement>(
    '[data-admin-cue-index="1"]'
  )
  expect(document.activeElement).toBe(secondRow)
  expect(secondRow.classList.contains('is-selected')).toBe(true)

  required<HTMLButtonElement>('[data-admin-nudge="0.05"]').click()
  expect(session.cues[1].timeStart).toBe(3.3)
  expect(
    required<HTMLButtonElement>('[data-admin-cue-index="1"]')
  ).toBe(secondRow)
  expect(secondRow.textContent).toContain('0:03.300')
  expect(onCueNavigationChange).toHaveBeenLastCalledWith(1)
})

test('rolls back a timing edit when playback rejects its cue replacement', async () => {
  const { audioController, highlightController } = createFixture()
  const activeRecording = recording('current', 1)
  const initialCues = [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)]
  const showPersistenceNotice = vi.fn()
  const onChange = vi.fn()
  const baseOptions = createOptions(audioController, highlightController, {
    cueData: {
      resolve: async () => readyCueData(activeRecording, initialCues),
      retry: async () => readyCueData(activeRecording, initialCues),
    },
    showPersistenceNotice,
    onChange,
  })
  const basePlayback = baseOptions.playback
  let rejectReplacement = false
  const replaceCues = vi.fn((cues: readonly WordCue[]) =>
    rejectReplacement ? false : basePlayback.replaceCues(cues)
  )
  const playback = {
    ...basePlayback,
    replaceCues,
  } satisfies ReaderPlaybackCueAuthoringAdapter
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(scope, {
      ...baseOptions,
      playback,
    })
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: { recording: activeRecording, cues: initialCues },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()
  await cueAuthoring.selectReaderToken(1)

  const secondRow = required<HTMLButtonElement>(
    '[data-admin-cue-index="1"]'
  )
  const changeCount = onChange.mock.calls.length
  rejectReplacement = true
  required<HTMLButtonElement>('[data-admin-nudge="0.05"]').click()

  expect(replaceCues).toHaveBeenCalledTimes(2)
  expect(session.cues[1].timeStart).toBe(3.25)
  expect(secondRow.textContent).toContain('0:03.250')
  expect(onChange).toHaveBeenCalledTimes(changeCount)
  expect(localStorage.getItem('tikkun-admin-draft:current')).toBeNull()
  expect(showPersistenceNotice).toHaveBeenCalledWith(
    'Timing edit was not applied because the active authoring session changed. Reload timing and try again.'
  )
})

test('preserves conflicting cues and tells the author to export before reloading', async () => {
  const { audioController, highlightController } = createFixture()
  const activeRecording = recording('current', 1)
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: activeRecording,
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()

  await saveAdminDraftPayload(
    createCueDraftPayload({
      recording: activeRecording,
      tokenCount: tokenKeys.length,
      tokenKeys,
      tokenPointer: 0,
      updatedAt: Date.now(),
      cues: [cue(tokenKeys[0], 1)],
    }),
    activeRecording,
    tokenKeys,
    { writerToken: 'other-tab', expectedRevision: null }
  )

  await cueAuthoring.selectReaderToken(0)
  required<HTMLButtonElement>('[data-admin-nudge="0.05"]').click()

  await vi.waitFor(() => {
    expect(
      required('[data-target-id="admin-draft-status"]').textContent
    ).toContain('Download or export your unsaved cues')
  })
  expect(
    required('[data-admin-problem="volatile-draft-recovery"]').textContent
  ).toContain('Unsaved cue snapshot needs download')
})

test('keeps a delayed rejected save downloadable on its original recording', async () => {
  const { audioController, highlightController } = createFixture()
  const showPersistenceNotice = vi.fn()
  const activeRecording = recording('current', 1)
  const nextRecording = recording('missing', 2)
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        showPersistenceNotice,
      })
    )
  })

  const firstSession = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: activeRecording,
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  await audioController.loadSession(firstSession)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()

  await saveAdminDraftPayload(
    createCueDraftPayload({
      recording: activeRecording,
      tokenCount: tokenKeys.length,
      tokenKeys,
      tokenPointer: 0,
      updatedAt: Date.now(),
      cues: [cue(tokenKeys[0], 1)],
    }),
    activeRecording,
    tokenKeys,
    { writerToken: 'other-tab', expectedRevision: null }
  )
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:volatile-draft')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

  let releaseLock!: () => void
  let confirmLock!: () => void
  const lockAcquired = new Promise<void>((resolve) => {
    confirmLock = resolve
  })
  const holdLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  const blocker = navigator.locks.request(
    `tikkun-admin-draft:${activeRecording.id}`,
    { mode: 'exclusive' },
    async () => {
      confirmLock()
      await holdLock
    }
  )
  await lockAcquired

  await cueAuthoring.selectReaderToken(0)
  required<HTMLButtonElement>('[data-admin-nudge="0.05"]').click()

  const secondSession = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 2 },
      tokenKeys,
      current: {
        recording: nextRecording,
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  await audioController.loadSession(secondSession)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()
  releaseLock()
  await blocker

  await vi.waitFor(() => {
    expect(showPersistenceNotice).toHaveBeenCalledWith(
      expect.stringContaining(
        'current could not be saved after the recording changed. Its cues remain only in this open Reader'
      )
    )
  })
  expect(cueAuthoring.getSession()?.recording.id).toBe(
    secondSession.recording.id
  )
  expect(
    required('[data-target-id="admin-draft-status"]').textContent
  ).toContain('missing')
  expect(
    required('[data-target-id="admin-draft-status"]').textContent
  ).not.toContain('another tab')
  await audioController.loadSession(firstSession)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()
  expect(
    required('[data-admin-problem="volatile-draft-recovery"]').textContent
  ).toContain('Unsaved cue snapshot needs download')

  required<HTMLButtonElement>(
    '[data-admin-problem="volatile-draft-recovery"] [data-admin-problem-action="export-unsaved-draft"]'
  ).click()
  const recoveryBlob = createObjectURL.mock.calls[0]?.[0]
  expect(recoveryBlob).toBeInstanceOf(Blob)
  if (!(recoveryBlob instanceof Blob)) throw new Error('Missing recovery Blob')
  const exported = JSON.parse(await recoveryBlob.text())
  expect(exported).toMatchObject({
    audioId: activeRecording.id,
    cues: [{ timeStart: 0.05 }],
  })
})

test('steps back from the highlighted word only while timing existing cues', async () => {
  const timingTokenKeys = [
    '1:0:0:0',
    '1:0:0:1',
    '1:0:0:2',
    '1:0:0:3',
  ]
  const { audioController, highlightController } = createFixture(
    timingTokenKeys
  )
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })
  sessionStorage.setItem('tikkun-admin-unlocked', '1')
  cueAuthoring.restoreAccessState()

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys: timingTokenKeys,
      current: {
        recording: recording('current', 1),
        cues: timingTokenKeys.map((key, index) => cue(key, index)),
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(timingTokenKeys)
  await cueAuthoring.bindSession()

  await cueAuthoring.selectReaderToken(1)
  await highlightController.activateTokenKey(timingTokenKeys[3], {
    scroll: false,
  })
  required<HTMLButtonElement>('[data-target-id="admin-step-back"]').click()
  await vi.waitFor(() => {
    expect(highlightController.getActiveTokenKey()).toBe(timingTokenKeys[0])
  })

  await cueAuthoring.selectReaderToken(1)
  required<HTMLButtonElement>('[data-target-id="admin-record"]').click()
  expect(cueAuthoring.isRecording()).toBe(true)

  const right = new KeyboardEvent('keydown', {
    key: 'ArrowRight',
    cancelable: true,
  })
  expect(cueAuthoring.handleKeydown(right)).toBe(true)
  expect(right.defaultPrevented).toBe(true)
  expect(highlightController.getActiveTokenKey()).toBe(timingTokenKeys[2])

  const left = new KeyboardEvent('keydown', {
    key: 'ArrowLeft',
    cancelable: true,
  })
  expect(cueAuthoring.handleKeydown(left)).toBe(true)
  expect(left.defaultPrevented).toBe(true)
  expect(highlightController.getActiveTokenKey()).toBe(timingTokenKeys[1])
  expect(
    required<HTMLElement>('[data-target-id="admin-cue-count"]').textContent
  ).toBe('4 / 4 Words - 2')
})

test('routes Cue List controls through TypeScript behavior', async () => {
  const { audioController, highlightController } = createFixture()
  const playNetworkRecording = vi.fn(async () => true)
  const onCueNavigationChange = vi.fn()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        playNetworkRecording,
        onCueNavigationChange,
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()
  await cueAuthoring.selectReaderToken(1)

  const previous = required<HTMLButtonElement>(
    '[data-target-id="admin-prev-saved"]'
  )
  const play = required<HTMLButtonElement>(
    '[data-target-id="admin-play-current"]'
  )
  const next = required<HTMLButtonElement>(
    '[data-target-id="admin-next-saved"]'
  )
  const trim = required<HTMLButtonElement>(
    '[data-target-id="admin-trim-here"]'
  )

  expect(previous.disabled).toBe(false)
  expect(next.disabled).toBe(true)

  previous.click()
  await vi.waitFor(() => {
    expect(
      required('[data-admin-cue-index="0"]').classList.contains(
        'is-selected'
      )
    ).toBe(true)
  })
  expect(previous.disabled).toBe(true)
  expect(next.disabled).toBe(false)

  next.click()
  await vi.waitFor(() => {
    expect(
      required('[data-admin-cue-index="1"]').classList.contains(
        'is-selected'
      )
    ).toBe(true)
  })
  expect(next.disabled).toBe(true)

  play.click()
  await vi.waitFor(() => {
    expect(playNetworkRecording).toHaveBeenCalledOnce()
  })
  expect(onCueNavigationChange).toHaveBeenLastCalledWith(1)

  trim.click()
  await vi.waitFor(() => {
    expect(session.cues).toHaveLength(1)
    expect(document.querySelectorAll('[data-admin-cue-index]')).toHaveLength(1)
  })
  expect(previous.disabled).toBe(true)
  expect(next.disabled).toBe(true)
  await vi.waitFor(() => {
    expect(
      JSON.parse(localStorage.getItem('tikkun-admin-draft:current') ?? '{}')
        .cues
    ).toHaveLength(1)
  })
})

test('exports Cue Data through the Svelte sheet and revokes replaced downloads', async () => {
  const { audioController, highlightController } = createFixture()
  const writeText = vi.fn().mockResolvedValue(undefined)
  installClipboard(writeText)
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:cues-1')
    .mockReturnValueOnce('blob:cues-2')
  const revokeObjectURL = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()

  const exportButton = required<HTMLButtonElement>(
    '[data-target-id="admin-export"]'
  )
  exportButton.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))

  const modal = required<HTMLElement>('[data-target-id="export-modal"]')
  const textarea = required<HTMLTextAreaElement>(
    '[data-target-id="export-text"]'
  )
  const cueDownload = required<HTMLAnchorElement>(
    '[data-target-id="export-download"]'
  )
  const payload = JSON.parse(textarea.value)

  expect(modal.classList).not.toContain('u-hidden')
  expect(payload).toMatchObject({
    audioId: 'current',
    audioFormat: 'mp3',
    narratorId: 'reader',
    readingId: 'test',
    aliyah: 1,
    tokenCount: 2,
    cueCount: 2,
    issues: [],
    cues: [
      {
        cueNumber: 1,
        timeStart: 0,
        pageNumber: 1,
        lineIndex: 0,
        fragmentIndex: 0,
        wordIndex: 0,
      },
      {
        cueNumber: 2,
        timeStart: 3.25,
        pageNumber: 1,
        lineIndex: 0,
        fragmentIndex: 0,
        wordIndex: 1,
      },
    ],
  })
  expect(
    required('[data-target-id="export-target-path"]').textContent
  ).toContain('audio-cues/reader/test/1.json')
  expect(cueDownload.href).toBe('blob:cues-1')
  expect(cueDownload.download).toBe('1.json')
  expect(writeText).toHaveBeenLastCalledWith(textarea.value)
  expect(
    required('[data-target-id="export-copy-status"]').textContent
  ).toContain('Copied to clipboard.')
  expect(createObjectURL).toHaveBeenCalledOnce()

  exportButton.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
  expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  expect(revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:cues-1')
  expect(cueDownload.href).toBe('blob:cues-2')

  required<HTMLButtonElement>('[data-target-id="export-close"]').click()
  expect(modal.classList).toContain('u-hidden')
  expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  expect(revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:cues-2')
  expect(cueDownload.hasAttribute('href')).toBe(false)
  expect(cueDownload.hasAttribute('download')).toBe(false)
})

test('keeps the export available when clipboard copying is blocked', async () => {
  const { audioController, highlightController } = createFixture()
  const writeText = vi.fn().mockRejectedValue(new Error('blocked'))
  installClipboard(writeText)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cues')
  const revokeObjectURL = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()

  required<HTMLButtonElement>('[data-target-id="admin-export"]').click()
  await vi.waitFor(() => {
    expect(
      required('[data-target-id="export-copy-status"]').textContent
    ).toContain('Automatic clipboard copy was blocked.')
  })

  expect(
    required<HTMLElement>('[data-target-id="export-modal"]').classList
  ).not.toContain('u-hidden')
  expect(
    required<HTMLAnchorElement>('[data-target-id="export-download"]')
      .href
  ).toBe('blob:cues')

  cueAuthoring.closeOverlays()
  expect(
    required<HTMLElement>('[data-target-id="export-modal"]').classList
  ).toContain('u-hidden')
  expect(revokeObjectURL).toHaveBeenCalledOnce()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:cues')
})

test('owns the admin shortcut, access check, and panel toggle', () => {
  const { audioController, highlightController } = createFixture()
  let cueAuthoring: CueAuthoring | null = null

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

  const openEvent = new KeyboardEvent('keydown', {
    key: 'a',
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  })
  expect(cueAuthoring!.handleKeydown(openEvent)).toBe(true)
  expect(openEvent.defaultPrevented).toBe(true)
  const accessDialog = required<HTMLElement>(
    '[data-target-id="admin-access-dialog"]'
  )
  const password = required<HTMLInputElement>(
    '[data-target-id="admin-access-password"]'
  )
  expect(accessDialog.classList).not.toContain('u-hidden')
  expect(document.activeElement).toBe(password)
  expect(cueAuthoring!.isActive()).toBe(false)
  expect(sessionStorage.getItem('tikkun-admin-unlocked')).toBeNull()

  password.value = 'admin'
  password.dispatchEvent(new InputEvent('input', { bubbles: true }))
  required<HTMLButtonElement>('[data-target-id="admin-access-submit"]').click()

  expect(accessDialog.classList).toContain('u-hidden')
  expect(cueAuthoring!.isActive()).toBe(true)
  expect(sessionStorage.getItem('tikkun-admin-unlocked')).toBe('1')
  expect(sessionStorage.getItem('tikkun-admin-panel-open')).toBe('1')

  const closeEvent = new KeyboardEvent('keydown', {
    key: 'A',
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  })
  expect(cueAuthoring!.handleKeydown(closeEvent)).toBe(true)
  expect(cueAuthoring!.isVisible()).toBe(false)
  expect(accessDialog.classList).toContain('u-hidden')
})

test('keeps the Svelte issue dialog open when persistence fails and retries safely', async () => {
  const { audioController, highlightController } = createFixture()
  const onLocalRecordingIssuesChanged = vi.fn()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        onLocalRecordingIssuesChanged,
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()
  cueAuthoring.openIssue()

  const modal = required<HTMLElement>(
    '[data-target-id="recording-issue-modal"]'
  )
  expect(modal.getAttribute('aria-hidden')).toBe('false')
  const firstIssue = required<HTMLButtonElement>('[data-issue-kind]')
  expect(document.activeElement).toBe(firstIssue)

  const storageFailure = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError')
    })
  firstIssue.click()

  expect(modal.getAttribute('aria-hidden')).toBe('false')
  expect(onLocalRecordingIssuesChanged).not.toHaveBeenCalled()

  storageFailure.mockRestore()
  firstIssue.click()
  expect(modal.getAttribute('aria-hidden')).toBe('true')
  expect(onLocalRecordingIssuesChanged).toHaveBeenCalledOnce()
})

test('persists only local recording issue overlays when published issues are visible', async () => {
  const { audioController, highlightController } = createFixture()
  const publishedIssue = createRecordingIssue({
    audioId: 'current',
    tokenKey: tokenKeys[0],
    kind: 'repeated-word',
    visibility: 'authoringOnly',
    severity: 'medium',
    note: 'Published note',
    createdAt: 1,
    tokenizationVersion: TOKENIZATION_VERSION,
  })
  let localIssues: RecordingIssue[] = []
  let localRevision = loadLocalRecordingIssues(
    localStorage,
    'current',
    TOKENIZATION_VERSION
  ).revision
  let mergedIssues = [publishedIssue]
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        getMergedRecordingIssues: () => mergedIssues,
        getLocalRecordingIssues: () => localIssues,
        getLocalRecordingIssueRevision: () => localRevision,
        onLocalRecordingIssuesChanged: (issues, revision) => {
          localIssues = issues
          localRevision = revision
          mergedIssues = mergePublishedAndLocalRecordingIssues(
            [publishedIssue],
            localIssues
          )
        },
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()
  cueAuthoring.openIssue()
  required<HTMLButtonElement>(
    '[data-issue-kind="repeated-word"]'
  ).click()

  expect(localIssues).toHaveLength(1)
  expect(localIssues[0]).not.toEqual(publishedIssue)
  expect(mergedIssues).toEqual(localIssues)
  const persisted = JSON.parse(
    localStorage.getItem('tikkun.recording-issues:current') ?? '{}'
  )
  expect(persisted).toHaveLength(1)
  expect(persisted[0]).toMatchObject({ id: localIssues[0].id })
  expect(persisted).not.toContainEqual(publishedIssue)
})

test('keeps a stale issue save open, adopts newer local state, and retries without data loss', async () => {
  const { audioController, highlightController } = createFixture()
  let localIssues: RecordingIssue[] = []
  let localRevision = loadLocalRecordingIssues(
    localStorage,
    'current',
    TOKENIZATION_VERSION
  ).revision
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        getMergedRecordingIssues: () => localIssues,
        getLocalRecordingIssues: () => localIssues,
        getLocalRecordingIssueRevision: () => localRevision,
        onLocalRecordingIssuesChanged: (issues, revision) => {
          localIssues = issues
          localRevision = revision
        },
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession()
  cueAuthoring.openIssue()

  const newerTabIssue = createRecordingIssue({
    audioId: 'current',
    tokenKey: tokenKeys[1],
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: TOKENIZATION_VERSION,
  })
  saveLocalRecordingIssues(
    localStorage,
    'current',
    TOKENIZATION_VERSION,
    [newerTabIssue],
    localRevision
  )

  const modal = required<HTMLElement>(
    '[data-target-id="recording-issue-modal"]'
  )
  const issueButton = required<HTMLButtonElement>(
    '[data-issue-kind="repeated-word"]'
  )
  issueButton.click()
  expect(modal.getAttribute('aria-hidden')).toBe('false')
  expect(localIssues).toEqual([newerTabIssue])

  issueButton.click()
  expect(modal.getAttribute('aria-hidden')).toBe('true')
  expect(localIssues).toHaveLength(2)
  expect(localIssues).toContainEqual(newerTabIssue)
  expect(
    loadLocalRecordingIssues(
      localStorage,
      'current',
      TOKENIZATION_VERSION
    ).issues
  ).toEqual(localIssues)
})

type CueAuthoringTestOverrides = Partial<
  Parameters<typeof createCueAuthoring>[1]
> & {
  prepareAuthoringSession?: () => Promise<void>
  restoreReaderSession?: () => Promise<void>
  playNetworkRecording?: (
    retry?: () => Promise<void>
  ) => Promise<boolean>
}

function createOptions(
  audioController: AudioController,
  highlightController: HighlightController,
  overrides: CueAuthoringTestOverrides = {}
): Parameters<typeof createCueAuthoring>[1] {
  const {
    prepareAuthoringSession = async () => {},
    restoreReaderSession = async () => {},
    playNetworkRecording = async () => true,
    playback: playbackOverride,
    ...optionOverrides
  } = overrides
  const localRecordingIssueRevision = loadLocalRecordingIssues(
    localStorage,
    'current',
    TOKENIZATION_VERSION
  ).revision
  return {
    document,
    view: window,
    playback:
      playbackOverride ??
      createCueAuthoringPlaybackAdapter(
        audioController,
        highlightController,
        {
          prepareAuthoringSession,
          restoreReaderSession,
          playNetworkRecording,
        }
      ),
    localStorage,
    sessionStorage,
    getAutoScroll: () => false,
    getActiveTokenKey: () => tokenKeys[0],
    getMergedRecordingIssues: () => [],
    getLocalRecordingIssues: () => [],
    getLocalRecordingIssueRevision: () => localRecordingIssueRevision,
    focusReader: () => {},
    formatDuration: (seconds) => `0:${String(Math.floor(seconds)).padStart(2, '0')}`,
    onChange: () => {},
    onCueNavigationChange: () => {},
    onLocalRecordingIssuesChanged: () => {},
    showPersistenceNotice: () => {},
    ...optionOverrides,
  }
}

function createCueAuthoringPlaybackAdapter(
  audioController: AudioController,
  highlightController: HighlightController,
  options: {
    prepareAuthoringSession(): Promise<void>
    restoreReaderSession(): Promise<void>
    playNetworkRecording(
      retry?: () => Promise<void>
    ): Promise<boolean>
  }
): ReaderPlaybackCueAuthoringAdapter {
  const listeners = new Set<
    (
      change: ReaderPlaybackCueAuthoringChange,
      snapshot: ReaderPlaybackCueAuthoringSnapshot
    ) => void
  >()
  let sessionRevision = 0
  let disconnect: (() => void) | null = null
  let cachedSession: ReaderPlaybackCueAuthoringSessionSnapshot | null = null

  const snapshot = (): ReaderPlaybackCueAuthoringSnapshot => {
    const session = audioController.session
    const currentTime = audioController.currentTime
    return Object.freeze({
      sessionRevision,
      hasSession: Boolean(session),
      activeTokenKey: highlightController.getActiveTokenKey(),
      activeTokenIndex: highlightController.getActiveIndex(),
      currentCueIndex: session?.cues.length
        ? highlightController.getCueIndex(session.cues, currentTime)
        : -1,
      currentTime,
      displayTime: currentTime,
      duration: audioController.duration,
      paused: audioController.audio.paused,
      ended: audioController.audio.ended,
      error: audioController.error,
    })
  }
  const emit = (change: ReaderPlaybackCueAuthoringChange) => {
    const nextSnapshot = snapshot()
    for (const listener of listeners) listener(change, nextSnapshot)
  }
  const connect = () => {
    if (disconnect) return
    const unsubscribers = [
      audioController.on('session-loaded', () => {
        sessionRevision += 1
        cachedSession = null
        emit({ type: 'session' })
      }),
      audioController.on('playback-updated', () => {
        emit({ type: 'playback' })
      }),
      audioController.on('frame-updated', () => {
        emit({ type: 'media-progress' })
      }),
      audioController.on('time-updated', () => {
        emit({ type: 'display-progress' })
      }),
      audioController.on('duration-updated', () => {
        emit({ type: 'display-progress' })
      }),
      audioController.on('playback-error', () => {
        emit({ type: 'error' })
      }),
    ]
    disconnect = () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
      disconnect = null
    }
  }

  const adapter: ReaderPlaybackCueAuthoringAdapter = {
    snapshot,
    session() {
      const session = audioController.session
      if (!session) return null
      if (cachedSession?.sessionRevision === sessionRevision) {
        return cachedSession
      }
      cachedSession = Object.freeze({
        sessionRevision,
        recording: session.recording,
        tokenKeys: Object.freeze([...session.tokenKeys]),
      })
      return cachedSession
    },
    readCues() {
      return Object.freeze(
        (audioController.session?.cues ?? []).map((cue) =>
          Object.freeze({ ...cue })
        )
      )
    },
    subscribe(listener) {
      listeners.add(listener)
      connect()
      return () => {
        listeners.delete(listener)
        if (!listeners.size) disconnect?.()
      }
    },
    prepareAuthoringSession: options.prepareAuthoringSession,
    restoreReaderSession: options.restoreReaderSession,
    play: options.playNetworkRecording,
    pause: () => audioController.pause(),
    seek: (time) => audioController.seek(time),
    async activateToken(tokenKey, activationOptions) {
      await highlightController.activateTokenKey(tokenKey, activationOptions)
    },
    clearHighlight: () => highlightController.clear(),
    replaceCues(cues) {
      const session = audioController.session
      return session
        ? replaceAuthoringSessionCues(
            session,
            cues.map((cue) => ({ ...cue }))
          )
        : false
    },
    refresh: () => {},
    setCueIndex: async () => {},
  }
  return Object.freeze(adapter)
}

const tokenKeys = ['1:0:0:0', '1:0:0:1']

function createFixture(keys: readonly string[] = tokenKeys) {
  fixture = document.createElement('div')
  fixture.innerHTML = `
    <main data-target-id="tikkun-book" tabindex="-1">
      ${keys
        .map(
          (key, index) =>
            `<span class="word" data-token-key="${key}">Word ${index + 1}</span>`
        )
        .join('')}
    </main>
    <div data-target-id="cue-authoring-panel-root"></div>
    <div data-target-id="cue-authoring-access-dialog-root"></div>
    <div data-target-id="recording-issue-dialog-root"></div>
    <div data-target-id="cue-authoring-export-sheet-root"></div>
    <audio data-target-id="reader-audio"></audio>
  `
  document.body.appendChild(fixture)
  const audioController = new AudioController(
    required<HTMLAudioElement>('[data-target-id="reader-audio"]')
  )
  const highlightController = new HighlightController(
    required<HTMLElement>('[data-target-id="tikkun-book"]')
  )
  return { audioController, highlightController }
}

function required<ElementType extends Element>(selector: string) {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

function installClipboard(writeText: (text: string) => Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard'
  )
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  restoreClipboard = () => {
    if (descriptor) {
      Object.defineProperty(navigator, 'clipboard', descriptor)
    } else {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  }
}

function recording(
  id: string,
  aliyah: number
): ParshaAudioRecording {
  return {
    id,
    narratorId: 'reader',
    reading: { kind: 'parsha', id: 'test', name: 'Test' },
    parshaSlug: 'test',
    parshaName: 'Test',
    aliyah,
    title: id,
    playSrc: `/${id}.mp3`,
    downloadSrc: `/${id}.mp3`,
    format: 'mp3',
    status: 'available',
    mediaIdentity: {
      algorithm: 'sha256',
      digest: 'a'.repeat(64),
      byteLength: 123,
    },
  }
}

function draftRecordingIdentity(activeRecording: ParshaAudioRecording) {
  return {
    audioId: activeRecording.id,
    audioFormat: activeRecording.format,
    narratorId: activeRecording.narratorId,
    readingId: activeRecording.reading.id,
    aliyah: activeRecording.aliyah,
    mediaIdentity: activeRecording.mediaIdentity,
  }
}

function readyCueData(
  activeRecording: ParshaAudioRecording,
  cues: WordCue[],
  tokenCount = tokenKeys.length
) {
  return {
    status: 'ready' as const,
    path: `../../audio-cues/${activeRecording.narratorId}/${activeRecording.reading.id}/${activeRecording.aliyah}.json`,
    payload: {
      audioId: activeRecording.id,
      audioFormat: activeRecording.format,
      narratorId: activeRecording.narratorId,
      readingId: activeRecording.reading.id,
      aliyah: activeRecording.aliyah,
      tokenCount,
      cueCount: cues.length,
      tokenizationVersion: TOKENIZATION_VERSION,
      savedAt: '2026-08-03T12:00:00.000Z',
      cues,
    },
  }
}

function cue(key: string, timeStart: number): WordCue {
  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = key
    .split(':')
    .map(Number)
  return {
    pageNumber,
    lineIndex,
    fragmentIndex,
    wordIndex,
    timeStart,
  }
}
