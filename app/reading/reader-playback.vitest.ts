import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import type { ReaderViewport } from '../adaptive/reader-viewport.ts'
import { createActiveAudioSession } from './audio-controller.ts'
import { buildPlaybackPlan } from './playback-plan.ts'
import {
  createReaderPlayback,
  type ReaderPlayback,
} from './reader-playback.ts'

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

function createFixture() {
  fixture = document.createElement('div')
  fixture.innerHTML = `
    <main data-target-id="book">
      <span class="word" data-token-key="1:0:0:0">Word</span>
    </main>
    <div data-target-id="floating-player-root"></div>
    <audio data-target-id="audio"></audio>
  `
  document.body.appendChild(fixture)
  return {
    audio: fixture.querySelector<HTMLAudioElement>('[data-target-id="audio"]')!,
    book: fixture.querySelector<HTMLElement>('[data-target-id="book"]')!,
  }
}

test('owns playback implementation lifetimes and resets route state once', async () => {
  const { audio, book } = createFixture()
  const timelineChanges = vi.fn()
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
        getPlaybackRate: () => 1.25,
        onPlaybackRateChange: vi.fn(),
        isCueAuthoringRecording: () => false,
        saveReadingPosition: vi.fn(),
        focusReader: vi.fn(),
        restoreFocus: vi.fn(),
      },
      recording: {
        library: {
          findRecording: () => null,
          listRecordings: () => [],
          loadCues: async () => [],
        },
        display: {
          resolveRun: () => null,
          collectTokenKeys: async () => [],
          waitUntilReady: async () => {},
          resolveRunForRecording: () => null,
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
      playNetworkRecording: async () => true,
      replayNetworkRecordingFromStart: async () => true,
      onTimelineChange: timelineChanges,
      onSessionLoaded: vi.fn(),
    })
  })

  expect(audio.playbackRate).toBe(1.25)
  expect(
    fixture!.querySelector('[data-target-id="floating-player"]')
  ).not.toBeNull()

  const plan = buildPlaybackPlan({
    target: { runId: 'beresheet', index: 1 },
    tokenKeys: ['1:0:0:0'],
    current: {
      recording: recording(),
      cues: [cue()],
    },
  })
  if (!plan) throw new Error('Expected a playback plan')
  await playback.audioController.loadSession(createActiveAudioSession(plan))
  playback.highlightController.setSequence(['1:0:0:0'])
  await playback.highlightController.activateTokenKey('1:0:0:0', {
    scroll: false,
  })

  expect(playback.audioController.session).not.toBeNull()
  expect(playback.highlightController.getActiveTokenKey()).toBe('1:0:0:0')
  expect(
    timelineChanges.mock.calls.some(
      ([change]) => change.type === 'session-loaded'
    )
  ).toBe(true)

  playback.resetRoute()
  expect(playback.audioController.session).toBeNull()
  expect(playback.highlightController.getActiveTokenKey()).toBeNull()

  destroy()
  destroy = null
  await Promise.resolve()
  expect(
    fixture!.querySelector('[data-target-id="floating-player"]')
  ).toBeNull()
})
