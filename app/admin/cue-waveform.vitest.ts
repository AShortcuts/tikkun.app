import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording } from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import type { ActiveAudioSession } from '../reading/audio-controller.ts'
import {
  createCueWaveform,
  type CueWaveformSnapshot,
} from './cue-waveform.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.restoreAllMocks()
})

test('owns waveform targets, lane seeking, visibility, and teardown', () => {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <span data-target-id="admin-waveform-status"></span>
    <div data-target-id="admin-waveform-lane">
      <div data-target-id="admin-waveform-bars"></div>
    </div>
  `
  document.body.appendChild(fixture)

  const snapshot: CueWaveformSnapshot = {
    session,
    currentTime: 5,
    duration: 40,
    paused: true,
    ended: false,
    cues: [],
    issues: [],
    microphoneState: 'ready',
  }
  const seek = vi.fn()
  let waveform: ReturnType<typeof createCueWaveform> | null = null
  destroy = createMount()((scope) => {
    waveform = createCueWaveform(scope, {
      document,
      view: window,
      getSnapshot: () => snapshot,
      formatDuration: (seconds) => `${seconds}s`,
      seek,
    })
  })

  waveform!.setVisible(true)
  expect(required('[data-target-id="admin-waveform-status"]').textContent).toContain(
    'ready to export'
  )

  const bars = required<HTMLElement>('[data-target-id="admin-waveform-bars"]')
  vi.spyOn(bars, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 20,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  })
  required('[data-target-id="admin-waveform-lane"]').dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: 50 })
  )
  expect(seek).toHaveBeenLastCalledWith(20)

  waveform!.setVisible(false)
  snapshot.microphoneState = 'recording'
  waveform!.schedule()
  expect(required('[data-target-id="admin-waveform-status"]').textContent).toContain(
    'ready to export'
  )

  destroy()
  destroy = null
  required('[data-target-id="admin-waveform-lane"]').dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: 75 })
  )
  expect(seek).toHaveBeenCalledTimes(1)
})

test('requires all stable waveform targets', () => {
  fixture = document.createElement('section')
  fixture.innerHTML = '<div data-target-id="admin-waveform-lane"></div>'
  document.body.appendChild(fixture)

  expect(() =>
    createMount()((scope) =>
      createCueWaveform(scope, {
        document,
        view: window,
        getSnapshot: () => ({
          session: null,
          currentTime: 0,
          duration: Number.NaN,
          paused: true,
          ended: false,
          cues: [],
          issues: [],
          microphoneState: null,
        }),
        formatDuration: String,
        seek: vi.fn(),
      })
    )
  ).toThrow('Cue Waveform requires [data-target-id="admin-waveform-bars"]')
})

function required<ElementType extends Element = HTMLElement>(selector: string) {
  const element = fixture?.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

const recording: ParshaAudioRecording = {
  id: 'beresheet-1-test',
  narratorId: 'test-reader',
  reading: {
    kind: 'parsha',
    id: 'beresheet',
    name: 'Beresheet',
  },
  parshaSlug: 'beresheet',
  parshaName: 'Beresheet',
  aliyah: 1,
  title: 'Beresheet 1',
  playSrc: '/beresheet-1-test.mp3',
  downloadSrc: '/beresheet-1-test.mp3',
  format: 'mp3',
  status: 'available',
}

const session: ActiveAudioSession = {
  recording,
  cues: [],
  runId: 'run',
  aliyahIndex: 1,
  tokenKeys: ['1:0:0:0'],
  segments: [
    {
      recording,
      cues: [],
      tokenKeys: ['1:0:0:0'],
      startTime: 0,
      endTime: null,
      logicalStart: 0,
      logicalEnd: Number.POSITIVE_INFINITY,
    },
  ],
  status: 'current-only',
}
