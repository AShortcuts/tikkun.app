import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import { createCueDraftPayload } from '../audio/cue-draft.ts'
import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import { loadLocalRecordingIssues } from '../audio/recording-issues.ts'
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
import { buildZipFixture } from './zip.fixture.ts'

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
    saveCueFile: async () => ({ status: 'unavailable' as const }),
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

test('imports generated flags, keeps their review state in the draft across reloads, and leaves it out of exports', async () => {
  const { audioController, highlightController } = createFixture()
  const writeText = vi.fn().mockResolvedValue(undefined)
  installClipboard(writeText)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:flagged-cues-test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const notice = vi.fn()
  let authoring!: CueAuthoring
  const mountAuthoring = () => {
    destroy = createMount()((scope) => {
      authoring = createCueAuthoring(scope, createOptions(audioController, highlightController, {
        showPersistenceNotice: notice,
      }))
    })
  }
  mountAuthoring()
  await audioController.loadSession(createActiveAudioSession(buildPlaybackPlan({
    target: { runId: 'run', index: 1 }, tokenKeys,
    current: { recording: recording('current', 1), cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)] },
  })!))
  highlightController.setSequence(tokenKeys)
  await authoring.bindSession()
  const imported = {
    ...draftRecordingIdentity(recording('current', 1)), tokenCount: 2, cueCount: 2,
    tokenizationVersion: TOKENIZATION_VERSION,
    cues: tokenKeys.map((key, index) => ({ ...cue(key, index * 3.25), cueNumber: index + 1,
      review: { source: 'torah-audio-aligner', status: 'pending', flags: [{
        id: `test-flag:${index}`, kind: 'unclear_audio', status: 'pending', message: 'Check this onset.',
      }] },
    })),
  }
  const chooseFile = () => {
    const input = required<HTMLInputElement>('[aria-label="Import cue JSON or an aligner ZIP for the loaded recording"]')
    const files = new DataTransfer()
    files.items.add(new File([JSON.stringify(imported)], 'generated-cues.json', { type: 'application/json' }))
    input.files = files.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const plainRowBackground = getComputedStyle(required('.admin-cue-row:not(.is-selected)')).backgroundColor
  chooseFile()
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
  expect(document.querySelectorAll('.admin-cue-row.is-flagged')).toHaveLength(0)
  confirm.mockReturnValue(true)
  chooseFile()
  await vi.waitFor(() => expect(document.querySelectorAll('.admin-cue-row.is-flagged')).toHaveLength(2))
  await vi.waitFor(() => expect(notice).toHaveBeenCalledWith(expect.stringContaining('2 pending flags')))
  expect(getComputedStyle(required('.admin-cue-row.is-flagged:not(.is-selected)')).backgroundColor).not.toBe(plainRowBackground)
  required<HTMLButtonElement>('[data-target-id="admin-next-flag"]').click()
  await vi.waitFor(() => expect(required('[data-admin-cue-index="1"]').classList.contains('is-selected')).toBe(true))
  required<HTMLButtonElement>('[data-admin-nudge="0.05"]').click()
  await vi.waitFor(() => expect(audioController.session?.cues[1].timeStart).toBe(3.3))
  expect(document.querySelectorAll('.admin-cue-row.is-flagged')).toHaveLength(2)
  required<HTMLButtonElement>('[data-target-id="admin-export"]').click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
  const exported = JSON.parse(writeText.mock.calls[0][0])
  expect(exported.cues[1].timeStart).toBe(3.3)
  expect(exported.cues.some((exportedCue: { review?: unknown }) => 'review' in exportedCue)).toBe(false)
  required<HTMLButtonElement>('[data-target-id="export-close"]').click()
  required<HTMLButtonElement>('[data-target-id="admin-review-flag"]').click()
  await vi.waitFor(() => expect(document.querySelectorAll('.admin-cue-row.is-flagged')).toHaveLength(1))
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('tikkun-admin-draft:current')!).cues[1].review.flags[0].status).toBe('reviewed'))
  destroy!()
  mountAuthoring()
  await authoring.bindSession()
  expect(document.querySelectorAll('.admin-cue-row.is-flagged')).toHaveLength(1)
  required<HTMLButtonElement>('[data-target-id="admin-export"]').click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
  const reexport = JSON.parse(writeText.mock.calls[1][0])
  expect(reexport.cues.some((exportedCue: { review?: unknown }) => 'review' in exportedCue)).toBe(false)
})

async function mountWithCurrentRecording(overrides: CueAuthoringTestOverrides = {}) {
  const { audioController, highlightController } = createFixture()
  let authoring!: CueAuthoring
  const mountAuthoring = () => {
    destroy = createMount()((scope) => {
      authoring = createCueAuthoring(scope, createOptions(audioController, highlightController, overrides))
    })
  }
  mountAuthoring()
  await audioController.loadSession(createActiveAudioSession(buildPlaybackPlan({
    target: { runId: 'run', index: 1 }, tokenKeys,
    current: { recording: recording('current', 1), cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)] },
  })!))
  highlightController.setSequence(tokenKeys)
  await authoring.bindSession()
  return {
    audioController,
    remount: async () => {
      destroy!()
      mountAuthoring()
      await authoring.bindSession()
    },
  }
}

const generatedCueFile = (audioId: string, aliyah: number, starts = [0, 3]) => ({
  ...draftRecordingIdentity(recording(audioId, aliyah)), tokenCount: 2, cueCount: 2,
  tokenizationVersion: TOKENIZATION_VERSION,
  cues: tokenKeys.map((key, index) => ({ ...cue(key, starts[index]), cueNumber: index + 1 })),
})

function chooseImportFile(file: File) {
  const input = required<HTMLInputElement>('[aria-label="Import cue JSON or an aligner ZIP for the loaded recording"]')
  const files = new DataTransfer()
  files.items.add(file)
  input.files = files.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const bundleRecordings = () => [recording('current', 1), recording('other', 2)]
const bundleOptions = {
  listRecordings: bundleRecordings,
  loadRecordingTokenKeys: async () => tokenKeys,
}
const encodeJson = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const cueZip = (files: Array<[string, unknown]>) => new File(
  [buildZipFixture(files.map(([name, value]) => ({ name, bytes: encodeJson(value) })))],
  'tikkun-generated-cues.zip', { type: 'application/zip' })
const textOf = (selector: string) => [...document.querySelectorAll(selector)]
  .map((row) => row.textContent?.replace(/\s+/g, ' ').trim())
const storedDraftStarts = (audioId: string) =>
  JSON.parse(localStorage.getItem('tikkun-admin-draft:' + audioId) ?? 'null')?.cues.map((saved: WordCue) => saved.timeStart)

test('checks a cue ZIP against the project, loads the chosen aliyot as drafts, and tracks them until closed', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  installClipboard(writeText)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bundle-test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const confirm = vi.spyOn(window, 'confirm')
  const notice = vi.fn()
  const saveCueFile = vi.fn<(serialized: string) => Promise<{ status: 'saved'; path: string; replaced: boolean; unchanged: boolean }>>(async () => ({
    status: 'saved' as const, path: 'audio-cues/reader/test/1.json', replaced: false, unchanged: false,
  }))
  // Unexported work on another aliyah from the ZIP.
  const other = recording('other', 2)
  await saveAdminDraftPayload(createCueDraftPayload({
    recording: other, tokenCount: tokenKeys.length, tokenKeys, tokenPointer: 1, updatedAt: Date.now(),
    cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 1.1)],
  }), other, tokenKeys, { writerToken: 'earlier-tab', expectedRevision: null })
  const { audioController, remount } = await mountWithCurrentRecording({ ...bundleOptions, saveCueFile, showPersistenceNotice: notice })

  chooseImportFile(cueZip([
    ['manifest.json', { private: true }],
    ['current-tikkun-cues.json', generatedCueFile('current', 1, [0, 2.5])],
    ['other-tikkun-cues.json', generatedCueFile('other', 2, [0, 3])],
    ['stranger-tikkun-cues.json', generatedCueFile('stranger', 3)],
  ]))
  await vi.waitFor(() => expect(textOf('.admin-cue-bundle-count')).toEqual(['1 of 3 selected']))
  expect(textOf('.admin-cue-bundle-choice')).toEqual([
    'current No cues yet',
    'other No cues yet Unexported draft here will be replaced',
    'test Aliyah 3 Can’t load This recording isn’t in the project yet',
  ])
  const box = (audioId: string) => required<HTMLInputElement>('[data-bundle-row="' + audioId + '"]')
  expect([box('current').checked, box('other').checked, box('stranger').disabled]).toEqual([true, false, true])
  // Nothing loads until the choice is confirmed.
  expect(audioController.session?.cues[1].timeStart).toBe(3.25)
  expect(storedDraftStarts('other')).toEqual([0, 1.1])

  box('other').click()
  await vi.waitFor(() => expect(required('[data-target-id="admin-bundle-load"]').textContent?.trim()).toBe('Load 2 as drafts'))
  required<HTMLButtonElement>('[data-target-id="admin-bundle-load"]').click()
  await vi.waitFor(() => expect(textOf('.admin-cue-bundle-entry')).toEqual(['current Ready to review', 'other Ready to review']))
  expect(audioController.session?.cues[1].timeStart).toBe(2.5)
  expect(storedDraftStarts('other')).toEqual([0, 3])
  expect(confirm).not.toHaveBeenCalled()
  expect(notice).toHaveBeenCalledWith('Loaded 2 aliyot as drafts to review.')
  expect(textOf('.admin-cue-bundle-count')).toEqual(['0 of 2 saved'])

  required<HTMLButtonElement>('[data-target-id="admin-export"]').click()
  await vi.waitFor(() => expect(textOf('.admin-cue-bundle-entry')).toEqual(['current Saved', 'other Ready to review']))
  expect(JSON.parse(saveCueFile.mock.calls[0][0]).cues[1].timeStart).toBe(2.5)
  required<HTMLButtonElement>('[data-target-id="export-close"]').click()

  // The list outlives the tab; closing it forgets only the list.
  await remount()
  await vi.waitFor(() => expect(textOf('.admin-cue-bundle-entry')).toHaveLength(2))
  required<HTMLButtonElement>('[data-target-id="admin-bundle-close"]').click()
  await vi.waitFor(() => expect(document.querySelector('[data-target-id="admin-cue-bundle"]')).toBeNull())
  expect(localStorage.getItem('tikkun-admin-cue-bundle')).toBeNull()
  expect(storedDraftStarts('other')).toEqual([0, 3])
})

test('a list restored on a later visit checks each aliyah before one is loaded and opens the chosen one', async () => {
  localStorage.setItem('tikkun-admin-cue-bundle', JSON.stringify({ version: 2, name: 'earlier.zip', audioIds: ['current', 'other'] }))
  const other = recording('other', 2)
  await saveAdminDraftPayload(createCueDraftPayload({
    recording: other, tokenCount: tokenKeys.length, tokenKeys, tokenPointer: 1, updatedAt: Date.now(),
    cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3)],
  }), other, tokenKeys, { writerToken: 'earlier-tab', expectedRevision: null })
  const openRecording = vi.fn(async () => {})
  const { audioController, highlightController } = createFixture()
  destroy = createMount()((scope) => {
    createCueAuthoring(scope, createOptions(audioController, highlightController, { ...bundleOptions, openRecording }))
  })

  await vi.waitFor(() => expect(textOf('.admin-cue-bundle-entry')).toEqual(['current Not loaded', 'other Ready to review']))
  required<HTMLButtonElement>('[data-bundle-open="other"]').click()
  await vi.waitFor(() => expect(openRecording).toHaveBeenCalledWith(other))
})

test('asks before importing cues timed with new audio that has no fingerprint', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const { audioController } = await mountWithCurrentRecording()
  const withoutFingerprint = { ...generatedCueFile('current', 1, [0, 1.5]), mediaIdentity: undefined }
  const file = () => new File([JSON.stringify(withoutFingerprint)], '1.json', { type: 'application/json' })
  chooseImportFile(file())
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('no audio fingerprint')))
  expect(audioController.session?.cues[1].timeStart).toBe(3.25)
  confirm.mockReturnValue(true)
  chooseImportFile(file())
  await vi.waitFor(() => expect(audioController.session?.cues[1].timeStart).toBe(1.5))
})

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
