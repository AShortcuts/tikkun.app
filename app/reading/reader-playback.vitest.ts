import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'
import { createMount } from '../lifecycle/mount.ts'
import type { ReaderViewport } from '../adaptive/reader-viewport.ts'
import {
  createReaderPlayback,
  type ReaderPlayback,
  type ReaderPlaybackChange,
  type ReaderPlaybackSnapshot,
} from './reader-playback.ts'

const tokenKey = '1:0:0:0'
let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.restoreAllMocks()
})

function recording(narratorId = 'reader'): ParshaAudioRecording {
  return {
    id: `${narratorId}-beresheet-1`,
    narratorId,
    reading: {
      kind: 'parsha',
      id: 'beresheet',
      name: 'Beresheet',
    },
    parshaSlug: 'beresheet',
    parshaName: 'Beresheet',
    aliyah: 1,
    title: 'Beresheet Aliyah 1',
    playSrc: `/audio/${narratorId}/beresheet/1.mp3`,
    downloadSrc: `/audio/${narratorId}/beresheet/1.mp3`,
    format: 'mp3',
    status: 'available',
  }
}

function cue(timeStart = 0): WordCue {
  return {
    pageNumber: 1,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex: 0,
    timeStart,
  }
}

function createRunFixture(): LeiningRun {
  const date: LeiningDate = {
    date: new Date(2026, 0, 1),
    id: '2026-01-01',
    title: { en: 'Beresheet', he: 'בראשית' },
    leinings: [],
  }
  const leining: LeiningInstance = {
    date,
    id: LeiningInstanceId.Shacharis,
    isParsha: true,
    runs: [],
  }
  const run: LeiningRun = {
    id: 'beresheet-run',
    type: LeiningRunType.Main,
    leining,
    scroll: 'torah',
    aliyot: [
      {
        index: 1,
        start: { scroll: 'torah', b: 1, c: 1, v: 1 },
        end: { scroll: 'torah', b: 1, c: 2, v: 1 },
      },
    ],
  }
  leining.runs = [run]
  date.leinings = [leining]
  return run
}

function createFixture() {
  fixture = document.createElement('div')
  fixture.innerHTML = `
    <main data-target-id="book">
      <span class="word" data-token-key="${tokenKey}">Word</span>
    </main>
    <div data-target-id="floating-player-root"></div>
    <audio data-target-id="audio"></audio>
  `
  document.body.appendChild(fixture)
  const audio =
    fixture.querySelector<HTMLAudioElement>('[data-target-id="audio"]')!
  const book =
    fixture.querySelector<HTMLElement>('[data-target-id="book"]')!
  let paused = true

  Object.defineProperties(audio, {
    paused: {
      configurable: true,
      get: () => paused,
    },
    ended: {
      configurable: true,
      get: () => false,
    },
    readyState: {
      configurable: true,
      value: HTMLMediaElement.HAVE_METADATA,
    },
    duration: {
      configurable: true,
      value: 12,
    },
  })
  const load = vi.spyOn(audio, 'load').mockImplementation(() => {})
  const play = vi.spyOn(audio, 'play').mockImplementation(async () => {
    paused = false
    audio.dispatchEvent(new Event('play'))
  })
  const pause = vi.spyOn(audio, 'pause').mockImplementation(() => {
    paused = true
    audio.dispatchEvent(new Event('pause'))
  })

  return { audio, book, load, pause, play }
}

function createHarness({
  recordings = [recording()],
  getNarratorId = () => recordings[0]!.narratorId,
  loadCues = async () => [cue()],
}: {
  recordings?: readonly ParshaAudioRecording[]
  getNarratorId?: () => string
  loadCues?: (
    recording: ParshaAudioRecording
  ) => Promise<readonly WordCue[]>
} = {}) {
  const { audio, book, load, pause, play } = createFixture()
  const run = createRunFixture()
  const activeRecording = recordings[0]!
  const onPlaybackRateChange = vi.fn()
  const viewport: ReaderViewport = {
    mode: 'wide',
    isCompact: () => false,
    onChange: () => () => {},
  }
  let playback!: ReaderPlayback

  destroy = createMount()((scope) => {
    playback = createReaderPlayback(scope, {
      document,
      view: window,
      audioElement: audio,
      book,
      viewport,
      initialPlaybackRate: 1.25,
      timeline: {
        getAutoScroll: () => false,
        getPlaybackRate: () => audio.playbackRate,
        onPlaybackRateChange,
        isCueAuthoringRecording: () => false,
        saveReadingPosition: vi.fn(),
        focusReader: vi.fn(),
        restoreFocus: vi.fn(),
      },
      recording: {
        library: {
          findRecording: ({ narratorId }) =>
            recordings.find(
              (candidate) => candidate.narratorId === narratorId
            ) ?? null,
          findAuthoringRecording: ({ narratorId }) =>
            recordings.find(
              (candidate) => candidate.narratorId === narratorId
            ) ?? activeRecording,
          listRecordings: () => [...recordings],
          loadCues,
        },
        display: {
          resolveRun: (runId) => (runId === run.id ? run : null),
          collectTokenKeys: async () => [tokenKey],
          waitUntilReady: async () => {},
          resolveRunForRecording: () => run,
        },
        authoring: {
          isActive: () => false,
          isVisible: () => false,
          hasSession: () => false,
          bindSession: async () => {},
          clearSession: vi.fn(),
        },
        getNarratorId,
        recordingMode: false,
      },
    })
  })

  return {
    audio,
    load,
    onPlaybackRateChange,
    pause,
    play,
    playback,
    run,
  }
}

test('owns playback state behind semantic commands and immutable snapshots', async () => {
  const { playback, run } = createHarness()
  const changes: Array<{
    change: ReaderPlaybackChange
    snapshot: ReaderPlaybackSnapshot
  }> = []
  playback.subscribe((change, snapshot) => {
    changes.push({ change, snapshot })
  })

  expect(
    fixture!.querySelector('[data-target-id="floating-player"]')
  ).not.toBeNull()

  const loaded = await playback.loadRecording({
    runId: run.id,
    aliyahIndex: 1,
  })
  expect(loaded).toMatchObject({
    runId: run.id,
    aliyahIndex: 1,
    cueCount: 1,
    tokenCount: 1,
    tokenKeys: [tokenKey],
  })

  const snapshot = playback.snapshot()
  expect(Object.isFrozen(snapshot)).toBe(true)
  expect(Object.isFrozen(snapshot.session)).toBe(true)
  expect(Object.isFrozen(snapshot.session?.tokenKeys)).toBe(true)
  expect(Object.isFrozen(snapshot.session?.recording)).toBe(true)
  expect(Object.isFrozen(snapshot.session?.recording.reading)).toBe(true)
  expect(snapshot).toMatchObject({
    activeTokenKey: tokenKey,
    activeTokenIndex: 0,
    currentCueIndex: 0,
  })
  expect(
    playback.isTargetActive({
      recordingId: recording().id,
      runId: run.id,
      aliyahIndex: 1,
    })
  ).toBe(true)
  expect(playback.tokenIndex(tokenKey)).toBe(0)
  expect(playback.cueForToken(tokenKey)).toEqual(cue())
  expect(Object.isFrozen(playback.cueForToken(tokenKey))).toBe(true)
  expect(playback.protectedCuePageNumbers(1)).toEqual([1])
  expect(changes.some(({ change }) => change.type === 'session-loaded')).toBe(true)
  expect(
    changes.some(({ change }) => change.type === 'active-token-changed')
  ).toBe(true)

  const sessionRevision = snapshot.sessionRevision
  playback.resetRoute()
  expect(playback.snapshot()).toMatchObject({
    sessionRevision: sessionRevision + 1,
    session: null,
    activeTokenKey: null,
  })
  expect(changes.at(-1)?.change.type).toBe('route-reset')

  destroy?.()
  destroy = null
  await Promise.resolve()
  expect(
    fixture!.querySelector('[data-target-id="floating-player"]')
  ).toBeNull()
})

test('replaces the active recording when the narrator changes on the same aliyah', async () => {
  const first = recording('reader')
  const second = recording('second-reader')
  let narratorId = first.narratorId
  const { playback, run } = createHarness({
    recordings: [first, second],
    getNarratorId: () => narratorId,
  })
  const target = { runId: run.id, aliyahIndex: 1 as const }

  await playback.loadRecording(target)
  expect(
    playback.isTargetActive({ recordingId: first.id, ...target })
  ).toBe(true)

  narratorId = second.narratorId
  const availability = playback.lookupRecording(run, target.aliyahIndex)
  expect(availability.recording?.id).toBe(second.id)
  expect(
    playback.isTargetActive({
      recordingId: availability.recording?.id ?? null,
      ...target,
    })
  ).toBe(false)

  const replaced = await playback.loadRecording(target)
  expect(replaced?.recording.id).toBe(second.id)
  expect(playback.snapshot().session?.recording.id).toBe(second.id)
})

test('keeps only the newest narrator load during rapid replacement', async () => {
  const first = recording('reader')
  const second = recording('second-reader')
  let narratorId = first.narratorId
  let resolveFirstCues!: (cues: readonly WordCue[]) => void
  const firstCues = new Promise<readonly WordCue[]>((resolve) => {
    resolveFirstCues = resolve
  })
  const loadCues = vi.fn((candidate: ParshaAudioRecording) =>
    candidate.id === first.id
      ? firstCues
      : Promise.resolve<readonly WordCue[]>([cue(1)])
  )
  const { playback, run } = createHarness({
    recordings: [first, second],
    getNarratorId: () => narratorId,
    loadCues,
  })
  const target = { runId: run.id, aliyahIndex: 1 as const }

  const obsoleteLoad = playback.loadRecording(target)
  await vi.waitFor(() => expect(loadCues).toHaveBeenCalledWith(first))
  narratorId = second.narratorId
  const currentLoad = playback.loadRecording(target)

  await expect(currentLoad).resolves.toMatchObject({
    recording: { id: second.id },
  })
  resolveFirstCues([cue()])
  await expect(obsoleteLoad).resolves.toBeNull()
  expect(playback.snapshot().session?.recording.id).toBe(second.id)
})

test('attempts new and active playback commands while offline', async () => {
  const {
    audio,
    onPlaybackRateChange,
    pause,
    play,
    playback,
    run,
  } = createHarness()
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)

  // Loading a new target must reach its exact media URL so the service worker
  // can satisfy the request from the offline recording cache.
  await playback.loadRecording({ runId: run.id, aliyahIndex: 1 })
  const retry = vi.fn(async () => {})

  expect(playback.authorizePlayback(recording())).toBe(true)
  expect(await playback.play(retry)).toBe(true)
  expect(play).toHaveBeenCalledOnce()
  expect(retry).not.toHaveBeenCalled()
  expect(playback.snapshot().playing).toBe(true)

  playback.pause()
  expect(playback.snapshot().paused).toBe(true)

  fixture!
    .querySelector<HTMLButtonElement>('[data-target-id="floating-replay"]')!
    .click()
  await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2))
  expect(retry).not.toHaveBeenCalled()

  pause.mockClear()
  playback.pause()
  await playback.activateSessionToken(tokenKey, {
    play: true,
    seekToCue: true,
    retry,
  })
  expect(play).toHaveBeenCalledTimes(3)
  expect(retry).not.toHaveBeenCalled()
  expect(playback.snapshot().activeTokenKey).toBe(tokenKey)
  expect(audio.currentTime).toBe(0)

  await playback.setPlaybackRate(2)
  expect(onPlaybackRateChange).toHaveBeenLastCalledWith(2)
})

test('reports an offline media failure with a retry for the current session', async () => {
  const { audio, play, playback, run } = createHarness()
  let online = false
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online)
  await playback.loadRecording({ runId: run.id, aliyahIndex: 1 })
  play.mockClear()

  let offlineRetry: (() => Promise<void>) | null = null
  playback.subscribe((change) => {
    if (change.type === 'offline-media-error') offlineRetry = change.retry
  })

  audio.dispatchEvent(new Event('error'))
  expect(offlineRetry).not.toBeNull()

  online = true
  await offlineRetry!()
  expect(play).toHaveBeenCalledOnce()
})

test('retries the exact offline action after playback rejects', async () => {
  const { play, playback, run } = createHarness()
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
  await playback.loadRecording({ runId: run.id, aliyahIndex: 1 })
  play.mockRejectedValueOnce(new Error('Media unavailable offline'))

  const retryAction = vi.fn(async () => {})
  let offlineRetry: (() => Promise<void>) | null = null
  playback.subscribe((change) => {
    if (change.type === 'offline-media-error') offlineRetry = change.retry
  })

  expect(await playback.play(retryAction)).toBe(false)
  expect(offlineRetry).not.toBeNull()
  expect(retryAction).not.toHaveBeenCalled()

  await offlineRetry!()
  expect(retryAction).toHaveBeenCalledOnce()
})

test('keeps Cue Authoring semantic, immutable, and generation-stable', async () => {
  const { audio, playback, run } = createHarness()
  await playback.loadRecording({ runId: run.id, aliyahIndex: 1 })

  const adapter = playback.cueAuthoringAdapter()
  const session = adapter.session()
  const readCues = adapter.readCues()
  expect(session).not.toBeNull()
  expect(Object.isFrozen(session)).toBe(true)
  expect(Object.isFrozen(session?.tokenKeys)).toBe(true)
  expect(Object.isFrozen(readCues)).toBe(true)
  expect(Object.isFrozen(readCues[0])).toBe(true)
  expect(() => (session!.tokenKeys as string[]).push('mutated')).toThrow()
  expect(() => {
    ;(readCues[0] as WordCue).timeStart = 9
  }).toThrow()
  expect(playback.tokenIndex('mutated')).toBe(-1)
  expect(playback.cueForToken(tokenKey)?.timeStart).toBe(0)

  const changes: string[] = []
  const unsubscribe = adapter.subscribe((change) => {
    changes.push(change.type)
  })
  adapter.seek(2)
  expect(adapter.session()).toBe(session)
  audio.dispatchEvent(new Event('timeupdate'))
  expect(changes).toContain('media-progress')
  expect(changes).toContain('display-progress')
  unsubscribe()

  const replacement = [cue(3)]
  expect(adapter.replaceCues(replacement)).toBe(true)
  replacement[0].timeStart = 7
  expect(playback.cueForToken(tokenKey)?.timeStart).toBe(3)
})

test('exposes deterministic recording semantics without raw implementations', async () => {
  const { pause, play, playback } = createHarness()
  const harness = playback.recordingHarnessAdapter()
  const loaded = await harness.loadByAudioId(recording().id)

  expect(loaded).not.toBeNull()
  expect(Object.isFrozen(loaded)).toBe(true)
  expect(Object.isFrozen(loaded?.cues)).toBe(true)
  expect(Object.isFrozen(loaded?.cues[0])).toBe(true)
  expect(Object.isFrozen(loaded?.tokenKeys)).toBe(true)
  expect(harness.snapshot().session).toBe(loaded)

  harness.seek(0)
  await harness.syncHighlight()
  expect(await harness.activateHighlightAt(0, { scroll: false })).toBe(true)
  expect(harness.snapshot()).toMatchObject({
    currentTime: 0,
    activeTokenKey: tokenKey,
  })

  play.mockClear()
  pause.mockClear()
  await harness.play()
  harness.pause()
  expect(play).toHaveBeenCalledOnce()
  expect(pause).toHaveBeenCalledOnce()
})

test('keeps raw implementations private behind semantic Adapters', () => {
  const { playback } = createHarness()
  const cueAuthoring = playback.cueAuthoringAdapter()
  const recordingHarness = playback.recordingHarnessAdapter()

  expect(playback.cueAuthoringAdapter()).toBe(cueAuthoring)
  expect(playback.recordingHarnessAdapter()).toBe(recordingHarness)
  expect('audioController' in cueAuthoring).toBe(false)
  expect('highlightController' in cueAuthoring).toBe(false)
  expect('audio' in cueAuthoring).toBe(false)
  expect('highlight' in cueAuthoring).toBe(false)
  expect('audio' in recordingHarness).toBe(false)
  expect('highlight' in recordingHarness).toBe(false)
  expect('timeline' in recordingHarness).toBe(false)
  expect('recordingSession' in recordingHarness).toBe(false)
  expect('audioController' in playback).toBe(false)
  expect('highlightController' in playback).toBe(false)
  expect('recordingSession' in playback).toBe(false)
  expect('timeline' in playback).toBe(false)
})
