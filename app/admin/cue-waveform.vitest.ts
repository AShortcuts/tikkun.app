import { afterEach, expect, test, vi } from 'vitest'
import '../../css/cue-authoring.css'
import type { ParshaAudioRecording } from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import type { ReaderPlaybackCueAuthoringSessionSnapshot } from '../reading/reader-playback.ts'
import {
  createCueWaveform,
  type CueWaveformSnapshot,
} from './cue-waveform.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null
const audioUrls: string[] = []

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  for (const url of audioUrls.splice(0)) URL.revokeObjectURL(url)
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

test('decodes audio into a sharp canvas while keeping markers, seeking, and resize in sync', async () => {
  const snapshot = audioSnapshot(wavUrl(2))
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  const { waveform, seek } = mountAudioWaveform(snapshot)
  const status = required('[data-target-id="admin-waveform-status"]')
  const bars = required<HTMLElement>('[data-target-id="admin-waveform-bars"]')
  const canvas = required<HTMLCanvasElement>('canvas')
  await expect.poll(() => status.textContent).toContain('full recording')
  expect(canvas.width).toBe(Math.round(400 * window.devicePixelRatio))
  expect(canvas.height).toBe(Math.round(80 * window.devicePixelRatio))
  expect(canvas.getAttribute('aria-hidden')).toBe('true')
  expect(required<HTMLElement>('.admin-waveform-cue').style.getPropertyValue('--timeline-ratio')).toBe('0.5')
  expect(required<HTMLElement>('.admin-waveform-issue').style.getPropertyValue('--timeline-ratio')).toBe('0.75')
  expect(required('.admin-waveform-issue').getAttribute('title')).toBe('Recording repeats here')

  const context = canvas.getContext('2d')!
  const peakAlpha = () => context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.3), 1, 1).data[3]
  expect(peakAlpha()).toBeGreaterThan(0)
  expect(context.getImageData(Math.floor(canvas.width / 4), Math.floor(canvas.height * 0.3), 1, 1).data[3]).toBe(0)
  const draw = vi.spyOn(context, 'fillRect')
  snapshot.currentTime = 2.25
  waveform.schedule()
  await expect.poll(() => required<HTMLElement>('.admin-waveform-playhead').style.getPropertyValue('--timeline-ratio')).toBe('0.5625')
  expect(draw).not.toHaveBeenCalled()

  const rect = bars.getBoundingClientRect()
  required('[data-target-id="admin-waveform-lane"]').dispatchEvent(new MouseEvent('click', {
    bubbles: true, clientX: rect.left + rect.width * 0.75,
  }))
  expect(seek).toHaveBeenLastCalledWith(3)
  bars.style.width = '250px'
  await expect.poll(() => canvas.width).toBe(Math.round(250 * window.devicePixelRatio))
  expect(peakAlpha()).toBeGreaterThan(0)

  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
  window.dispatchEvent(new Event('resize'))
  await expect.poll(() => canvas.width).toBe(500)
  expect(canvas.height).toBe(160)
  expect(peakAlpha()).toBeGreaterThan(0)
  expect(fetchSpy).toHaveBeenCalledTimes(1)
})

test('retries failed audio, hides catalog peaks for microphone capture, and reloads replaced media', async () => {
  const snapshot = audioSnapshot(wavUrl(2))
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 503 }))
  const { waveform } = mountAudioWaveform(snapshot)
  const status = required<HTMLElement>('[data-target-id="admin-waveform-status"]')
  const bars = required<HTMLElement>('[data-target-id="admin-waveform-bars"]')
  const canvas = required<HTMLCanvasElement>('canvas')
  await expect.poll(() => status.getAttribute('role')).toBe('button')
  expect(status.textContent).toContain('activate to retry')
  status.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await expect.poll(() => status.textContent).toContain('full recording')
  expect(status.hasAttribute('tabindex')).toBe(false)
  expect(fetchSpy).toHaveBeenCalledTimes(2)

  snapshot.microphoneState = 'recording'
  waveform.schedule()
  await expect.poll(() => status.textContent).toContain('Recording live microphone audio')
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  expect(pixels.every(value => value === 0)).toBe(true)
  expect(bars.querySelector('.admin-waveform-cue')).toBeNull()
  snapshot.microphoneState = 'ready'
  waveform.schedule()
  await expect.poll(() => status.textContent).toContain('ready to export')
  snapshot.microphoneState = null
  waveform.schedule()
  await expect.poll(() => status.textContent).toContain('full recording')
  expect(fetchSpy).toHaveBeenCalledTimes(2)

  const replacement = wavUrl(1)
  snapshot.session = { ...session, recording: { ...recording, playSrc: replacement } }
  waveform.contentChanged()
  await expect.poll(() => bars.dataset.summaryKey).toContain(replacement)
  expect(fetchSpy).toHaveBeenCalledTimes(3)
  const context = canvas.getContext('2d')!
  expect(context.getImageData(Math.floor(canvas.width / 4), Math.floor(canvas.height * 0.3), 1, 1).data[3]).toBeGreaterThan(0)
  expect(context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.3), 1, 1).data[3]).toBe(0)
})

function mountAudioWaveform(snapshot: CueWaveformSnapshot) {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <span data-target-id="admin-waveform-status"></span>
    <div data-target-id="admin-waveform-lane">
      <div class="admin-waveform-bars" data-target-id="admin-waveform-bars" style="width:400px;height:80px;color:#123"></div>
    </div>
  `
  document.body.appendChild(fixture)
  const seek = vi.fn()
  let waveform!: ReturnType<typeof createCueWaveform>
  destroy = createMount()((scope) => {
    waveform = createCueWaveform(scope, {
      document,
      view: window,
      // Playback snapshots may be new objects for the same recording.
      getSnapshot: () => ({ ...snapshot, session: snapshot.session ? { ...snapshot.session } : null }),
      formatDuration: String,
      seek,
    })
  })
  waveform.setVisible(true)
  return { waveform, seek }
}

function audioSnapshot(src: string): CueWaveformSnapshot {
  return {
    session: { ...session, recording: { ...recording, playSrc: src } },
    currentTime: 2,
    duration: 4,
    paused: true,
    ended: false,
    cues: [{ timeStart: 2, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 }],
    issues: [{
      id: 'test-repeat', audioId: recording.id, tokenKey: '1:0:0:0', timeStart: 3,
      kind: 'repeated-word', visibility: 'readerVisible', severity: 'low',
      createdAt: 0, tokenizationVersion: 'test',
    }],
    microphoneState: null,
  }
}

function wavUrl(onsetSeconds: number) {
  const sampleRate = 16_000
  const sampleCount = sampleRate * 4
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
  }
  view.setUint32(4, buffer.byteLength - 8, true)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  view.setUint32(40, sampleCount * 2, true)
  for (let index = 0; index < 64; index += 1) {
    view.setInt16(44 + (onsetSeconds * sampleRate + index) * 2, index < 32 ? 30000 : -30000, true)
  }
  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  audioUrls.push(url)
  return url
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

const session: ReaderPlaybackCueAuthoringSessionSnapshot = {
  sessionRevision: 1,
  recording,
  tokenKeys: ['1:0:0:0'],
}
