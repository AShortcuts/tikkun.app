import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording } from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import type { ActiveAudioSession } from '../reading/audio-controller.ts'
import {
  mountRecordingHarness,
  type RecordingHarnessOptions,
} from './recording-harness.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  delete window.tikkunRecorder
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

function createOptions(): {
  options: RecordingHarnessOptions
  seek: ReturnType<typeof vi.fn>
  syncHighlight: ReturnType<typeof vi.fn>
} {
  fixture = document.createElement('div')
  fixture.innerHTML = `
    <main data-target-id="book">
      <section class="tikkun-page">
        <table><tbody><tr><td class="line">
          <span class="word is-active-word">Word</span>
        </td></tr></tbody></table>
      </section>
    </main>
  `
  document.body.appendChild(fixture)
  const book = fixture.querySelector<HTMLElement>('[data-target-id="book"]')!
  const session: ActiveAudioSession = {
    recording: recording(),
    cues: [
      {
        pageNumber: 1,
        lineIndex: 0,
        fragmentIndex: 0,
        wordIndex: 0,
        timeStart: 1.25,
      },
    ],
    runId: 'beresheet',
    aliyahIndex: 1,
    tokenKeys: ['1:0:0:0'],
    segments: [],
    status: 'current-only',
  }
  let currentTime = 0
  const seek = vi.fn((seconds: number) => {
    currentTime = seconds
  })
  const syncHighlight = vi.fn(async () => {})
  let ready = false

  return {
    seek,
    syncHighlight,
    options: {
      document,
      view: window,
      audio: {
        get session() {
          return session
        },
        get currentTime() {
          return currentTime
        },
        get duration() {
          return 12
        },
        seek,
        play: vi.fn(async () => {}),
        pause: vi.fn(),
      },
      highlight: {
        getActiveTokenKey: () => '1:0:0:0',
        getCueIndex: () => 0,
        clear: vi.fn(),
        activateCue: vi.fn(async () => null),
      },
      timeline: { syncHighlight },
      recordingSession: {
        loadByAudioId: vi.fn(async () => session),
      },
      isReaderReady: () => ready,
      waitUntilReaderReady: async () => {
        ready = true
      },
      getBook: () => book,
    },
  }
}

test('mounts the external recording interface and cleans it up with its lifetime', async () => {
  const { options, seek, syncHighlight } = createOptions()
  destroy = createMount()((scope) => {
    mountRecordingHarness(scope, options)
  })

  expect(window.tikkunRecorder?.state().ready).toBe(false)
  await window.tikkunRecorder?.ready()
  expect(window.tikkunRecorder?.state().ready).toBe(true)

  const rendered = await window.tikkunRecorder?.renderAt(3.5)
  expect(seek).toHaveBeenCalledWith(3.5)
  expect(syncHighlight).toHaveBeenCalledOnce()
  expect(rendered).toMatchObject({
    audioId: 'reader-beresheet-1',
    currentTime: 3.5,
    duration: 12,
    activeTokenKey: '1:0:0:0',
  })

  destroy()
  destroy = null
  expect(window.tikkunRecorder).toBeUndefined()
})

test('rejects duplicate mounts instead of replacing an active recording interface', () => {
  const { options } = createOptions()
  destroy = createMount()((scope) => {
    mountRecordingHarness(scope, options)
    expect(() => mountRecordingHarness(scope, options)).toThrow(
      'Recording Harness is already mounted'
    )
  })
})
