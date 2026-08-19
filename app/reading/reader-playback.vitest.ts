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

function recording(): ParshaAudioRecording {
  return {
    id: 'reader-beresheet-1',
    narratorId: 'reader',
    reading: {
      kind: 'parsha',
      id: 'beresheet',
      name: 'Beresheet',
    },
    parshaSlug: 'beresheet',
    parshaName: 'Beresheet',
    aliyah: 1,
    title: 'Beresheet Aliyah 1',
    playSrc: '/audio/reader/beresheet/1.mp3',
    downloadSrc: '/audio/reader/beresheet/1.mp3',
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

function createHarness() {
  const { audio, book, load, pause, play } = createFixture()
  const run = createRunFixture()
  const activeRecording = recording()
  const canUseNetwork = vi.fn(() => true)
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
          findRecording: () => activeRecording,
          findAuthoringRecording: () => activeRecording,
          listRecordings: () => [activeRecording],
          loadCues: async () => [cue()],
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
          getSession: () => null,
          bindSession: async () => {},
          clearSession: vi.fn(),
        },
        getNarratorId: () => 'reader',
        recordingMode: false,
      },
      canUseNetwork,
    })
  })

  return {
    audio,
    canUseNetwork,
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
  expect(playback.isTargetActive({ runId: run.id, aliyahIndex: 1 })).toBe(true)
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

test('owns network gating and playback-rate commands', async () => {
  const {
    canUseNetwork,
    onPlaybackRateChange,
    play,
    playback,
    run,
  } = createHarness()
  await playback.loadRecording({ runId: run.id, aliyahIndex: 1 })
  const retry = vi.fn(async () => {})

  canUseNetwork.mockReturnValue(false)
  expect(await playback.play(retry)).toBe(false)
  expect(canUseNetwork).toHaveBeenLastCalledWith(retry)
  expect(play).not.toHaveBeenCalled()

  canUseNetwork.mockReturnValue(true)
  expect(playback.authorizePlayback(recording())).toBe(true)
  expect(await playback.play(retry)).toBe(true)
  expect(play).toHaveBeenCalledOnce()
  expect(playback.snapshot().playing).toBe(true)

  playback.pause()
  expect(playback.snapshot().paused).toBe(true)

  await playback.setPlaybackRate(2)
  expect(onPlaybackRateChange).toHaveBeenLastCalledWith(2)
})

test('limits raw implementations to explicit optional-feature adapters', () => {
  const { playback } = createHarness()

  expect(playback.cueAuthoringAdapter()).toBe(
    playback.cueAuthoringAdapter()
  )
  expect(playback.recordingHarnessAdapter()).toBe(
    playback.recordingHarnessAdapter()
  )
  expect('audioController' in playback).toBe(false)
  expect('highlightController' in playback).toBe(false)
  expect('recordingSession' in playback).toBe(false)
  expect('timeline' in playback).toBe(false)
})
