const MICROPHONE_MIME_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
] as const

export type MicrophoneCaptureState =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'ready'

export interface CapturedMicrophoneAudio {
  blob: Blob
  mimeType: string
  fileExtension: 'm4a' | 'webm' | 'ogg' | 'audio'
  durationSeconds: number
}

export interface MicrophoneCaptureDependencies {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
  createRecorder(stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder
  isTypeSupported(mimeType: string): boolean
  now(): number
}

export function selectMicrophoneMimeType(
  isTypeSupported: (mimeType: string) => boolean
) {
  return MICROPHONE_MIME_TYPES.find(isTypeSupported) ?? ''
}

export function audioFileExtensionForMimeType(
  mimeType: string
): CapturedMicrophoneAudio['fileExtension'] {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('mp4')) return 'm4a'
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('ogg')) return 'ogg'
  return 'audio'
}

function getBrowserDependencies(): MicrophoneCaptureDependencies | null {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return null
  }

  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createRecorder: (stream, options) => new MediaRecorder(stream, options),
    isTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    now: () => performance.now(),
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export class MicrophoneCapture {
  private stateValue: MicrophoneCaptureState = 'idle'
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private resultValue: CapturedMicrophoneAudio | null = null
  private startedAt = 0
  private now: (() => number) | null = null
  private dataHandler: ((event: Event) => void) | null = null
  private startTask: Promise<void> | null = null
  private stopTask: Promise<CapturedMicrophoneAudio | null> | null = null
  private stopRequested = false

  constructor(private readonly dependencies?: MicrophoneCaptureDependencies) {}

  get state() {
    return this.stateValue
  }

  get result() {
    return this.resultValue
  }

  get elapsedSeconds() {
    if (
      (this.stateValue === 'recording' || this.stateValue === 'stopping') &&
      this.now
    ) {
      return Math.max(0, (this.now() - this.startedAt) / 1000)
    }
    return this.resultValue?.durationSeconds ?? 0
  }

  isSupported() {
    return Boolean(this.dependencies ?? getBrowserDependencies())
  }

  async start() {
    if (
      this.stateValue === 'starting' ||
      this.stateValue === 'recording' ||
      this.stateValue === 'stopping'
    ) {
      throw new Error('Microphone capture is already active')
    }

    const dependencies = this.dependencies ?? getBrowserDependencies()
    if (!dependencies) {
      throw new Error('This browser does not support microphone recording')
    }

    this.stateValue = 'starting'
    this.resultValue = null
    this.chunks = []
    this.stopRequested = false
    const startTask = this.startWithDependencies(dependencies)
    this.startTask = startTask
    try {
      await startTask
    } finally {
      if (this.startTask === startTask) this.startTask = null
    }
  }

  private async startWithDependencies(dependencies: MicrophoneCaptureDependencies) {
    let stream: MediaStream | null = null
    try {
      stream = await dependencies.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
        video: false,
      })
      if (this.stopRequested) {
        stopStream(stream)
        this.stateValue = 'idle'
        return
      }

      const mimeType = selectMicrophoneMimeType(dependencies.isTypeSupported)
      const recorder = dependencies.createRecorder(
        stream,
        mimeType
          ? {
              mimeType,
              audioBitsPerSecond: 128_000,
            }
          : undefined
      )
      const dataHandler = (event: Event) => {
        const data = (event as Event & { data?: Blob }).data
        if (data?.size) this.chunks.push(data)
      }
      recorder.addEventListener('dataavailable', dataHandler)

      this.stream = stream
      this.recorder = recorder
      this.dataHandler = dataHandler
      this.startedAt = dependencies.now()
      this.now = dependencies.now
      recorder.start(1_000)
      this.stateValue = 'recording'
    } catch (error) {
      stopStream(stream)
      this.resetActiveResources()
      this.stateValue = 'idle'
      throw error
    }
  }

  async stop(): Promise<CapturedMicrophoneAudio | null> {
    if (this.stateValue === 'starting') {
      this.stopRequested = true
      try {
        await this.startTask
      } catch {
        return null
      }
      return this.hasRecordingStarted() ? this.stop() : this.resultValue
    }
    if (this.stateValue === 'stopping') return this.stopTask
    if (this.stateValue === 'ready') return this.resultValue
    if (this.stateValue !== 'recording' || !this.recorder) return null

    this.stateValue = 'stopping'
    const durationSeconds = this.elapsedSeconds
    const stopTask = this.finishRecording(this.recorder, durationSeconds)
    this.stopTask = stopTask
    try {
      return await stopTask
    } finally {
      if (this.stopTask === stopTask) this.stopTask = null
    }
  }

  private finishRecording(
    recorder: MediaRecorder,
    durationSeconds: number
  ): Promise<CapturedMicrophoneAudio> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        recorder.removeEventListener('stop', handleStop)
        recorder.removeEventListener('error', handleError)
        if (this.dataHandler) {
          recorder.removeEventListener('dataavailable', this.dataHandler)
        }
        stopStream(this.stream)
        this.resetActiveResources()
      }
      const handleStop = () => {
        const mimeType =
          recorder.mimeType || this.chunks.find((chunk) => chunk.type)?.type || 'audio/webm'
        const result: CapturedMicrophoneAudio = {
          blob: new Blob(this.chunks, { type: mimeType }),
          mimeType,
          fileExtension: audioFileExtensionForMimeType(mimeType),
          durationSeconds,
        }
        cleanup()
        this.resultValue = result
        this.stateValue = 'ready'
        resolve(result)
      }
      const handleError = (event: Event) => {
        const recorderError = (event as Event & { error?: Error }).error
        cleanup()
        this.stateValue = 'idle'
        reject(recorderError ?? new Error('Microphone recording failed'))
      }

      recorder.addEventListener('stop', handleStop, { once: true })
      recorder.addEventListener('error', handleError, { once: true })
      try {
        recorder.stop()
      } catch (error) {
        cleanup()
        this.stateValue = 'idle'
        reject(error)
      }
    })
  }

  clear() {
    if (
      this.stateValue === 'starting' ||
      this.stateValue === 'recording' ||
      this.stateValue === 'stopping'
    ) {
      throw new Error('Stop microphone capture before clearing it')
    }
    this.resultValue = null
    this.stateValue = 'idle'
  }

  private hasRecordingStarted() {
    return this.stateValue === 'recording'
  }

  private resetActiveResources() {
    this.recorder = null
    this.stream = null
    this.dataHandler = null
    this.now = null
    this.stopRequested = false
  }
}
