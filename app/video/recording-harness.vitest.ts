import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording } from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import type { ReaderPlaybackRecordingHarnessSessionSnapshot } from '../reading/reader-playback.ts'
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
  activateHighlightAt: ReturnType<typeof vi.fn>
  loadByAudioId: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
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
  const session: ReaderPlaybackRecordingHarnessSessionSnapshot = {
    sessionRevision: 1,
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
    status: 'current-only',
  }
  let currentTime = 0
  const seek = vi.fn((seconds: number) => {
    currentTime = seconds
  })
  const syncHighlight = vi.fn(async () => {})
  const activateHighlightAt = vi.fn(async () => true)
  const loadByAudioId = vi.fn(async () => session)
  const play = vi.fn(async () => {})
  const pause = vi.fn()
  let ready = false

  return {
    activateHighlightAt,
    loadByAudioId,
    pause,
    play,
    seek,
    syncHighlight,
    options: {
      document,
      view: window,
      playback: {
        snapshot: () => ({
          session,
          currentTime,
          duration: 12,
          activeTokenKey: '1:0:0:0',
        }),
        loadByAudioId,
        seek,
        play,
        pause,
        syncHighlight,
        activateHighlightAt,
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
  const {
    activateHighlightAt,
    loadByAudioId,
    options,
    pause,
    play,
    seek,
    syncHighlight,
  } = createOptions()
  destroy = createMount()((scope) => {
    mountRecordingHarness(scope, options)
  })

  expect(window.tikkunRecorder?.state().ready).toBe(false)
  await window.tikkunRecorder?.ready()
  expect(window.tikkunRecorder?.state().ready).toBe(true)

  const loaded = await window.tikkunRecorder?.loadAudio(
    'reader-beresheet-1'
  )
  expect(loadByAudioId).toHaveBeenCalledWith('reader-beresheet-1')
  expect(loaded?.cues).toHaveLength(1)
  expect(loaded?.tokenKeys).toEqual(['1:0:0:0'])

  const rendered = await window.tikkunRecorder?.renderAt(3.5)
  expect(seek).toHaveBeenCalledWith(3.5)
  expect(syncHighlight).toHaveBeenCalledOnce()
  expect(rendered).toMatchObject({
    audioId: 'reader-beresheet-1',
    currentTime: 3.5,
    duration: 12,
    activeTokenKey: '1:0:0:0',
  })

  const animated = await window.tikkunRecorder?.renderHighlightAnimationAt(
    1.25,
    120,
    false,
    true,
    0
  )
  expect(activateHighlightAt).toHaveBeenCalledWith(1.25, { scroll: true })
  expect(animated?.audioId).toBe('reader-beresheet-1')

  await window.tikkunRecorder?.play()
  window.tikkunRecorder?.pause()
  expect(play).toHaveBeenCalledOnce()
  expect(pause).toHaveBeenCalledOnce()

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
