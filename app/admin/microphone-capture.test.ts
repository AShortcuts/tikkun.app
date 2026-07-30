import { expect, test } from 'vitest'
import {
  audioFileExtensionForMimeType,
  MicrophoneCapture,
  selectMicrophoneMimeType,
  type MicrophoneCaptureDependencies,
} from './microphone-capture.ts'

class FakeMediaRecorder extends EventTarget {
  readonly mimeType: string
  state: RecordingState = 'inactive'

  constructor(mimeType: string) {
    super()
    this.mimeType = mimeType
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    const dataEvent = Object.assign(new Event('dataavailable'), {
      data: new Blob(['voice'], { type: this.mimeType }),
    })
    this.dispatchEvent(dataEvent)
    this.dispatchEvent(new Event('stop'))
  }
}

function createDependencies({
  recorder,
  now,
  stopTrack,
}: {
  recorder: FakeMediaRecorder
  now: () => number
  stopTrack: () => void
}): MicrophoneCaptureDependencies {
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream

  return {
    getUserMedia: async () => stream,
    createRecorder: () => recorder as unknown as MediaRecorder,
    isTypeSupported: (mimeType) => mimeType.includes('webm'),
    now,
  }
}

test('prefers a supported compressed audio type and maps download extensions', () => {
  expect(selectMicrophoneMimeType((mimeType) => mimeType.includes('webm'))).toBe(
    'audio/webm;codecs=opus'
  )
  expect(audioFileExtensionForMimeType('audio/mp4;codecs=mp4a.40.2')).toBe('m4a')
  expect(audioFileExtensionForMimeType('audio/webm;codecs=opus')).toBe('webm')
  expect(audioFileExtensionForMimeType('audio/ogg;codecs=opus')).toBe('ogg')
})

test('records a microphone blob using the same monotonic clock as cue timing', async () => {
  let clock = 1_000
  let trackStopCount = 0
  const recorder = new FakeMediaRecorder('audio/webm;codecs=opus')
  const capture = new MicrophoneCapture(
    createDependencies({
      recorder,
      now: () => clock,
      stopTrack: () => {
        trackStopCount += 1
      },
    })
  )

  await capture.start()
  clock = 2_375

  expect(capture.state).toBe('recording')
  expect(capture.elapsedSeconds).toBe(1.375)

  const result = await capture.stop()
  expect(result?.durationSeconds).toBe(1.375)
  expect(result?.mimeType).toBe('audio/webm;codecs=opus')
  expect(result?.fileExtension).toBe('webm')
  expect(await result?.blob.text()).toBe('voice')
  expect(capture.state).toBe('ready')
  expect(trackStopCount).toBe(1)
})

test('surfaces microphone permission failures without leaving capture active', async () => {
  const dependencies: MicrophoneCaptureDependencies = {
    getUserMedia: async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    },
    createRecorder: () => {
      throw new Error('Recorder should not be created')
    },
    isTypeSupported: () => true,
    now: () => 0,
  }
  const capture = new MicrophoneCapture(dependencies)

  await expect(capture.start()).rejects.toMatchObject({ name: 'NotAllowedError' })
  expect(capture.state).toBe('idle')
})
