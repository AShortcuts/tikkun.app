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
import { createReaderPlayback, type ReaderPlayback } from './reader-playback.ts'

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
    kind: 'service',
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
