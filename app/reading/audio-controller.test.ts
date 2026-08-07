import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording } from '../audio/types.ts'
import { AudioController, createActiveAudioSession } from './audio-controller.ts'
import type { PlaybackPlan } from './playback-plan.ts'

class FakeAudioElement {
  currentTime = 0
  duration: number
  ended = false
  paused = true
  readyState: number
  src = ''
  preload = ''
  error: { code: number } | null = null
  playCount = 0
  loadCount = 0
  playError: Error | null = null
  private readonly listeners = new Map<
    string,
    Array<{ listener: EventListenerOrEventListenerObject; once: boolean }>
  >()

  constructor(duration = Number.NaN, readyState = 1) {
    this.duration = duration
    this.readyState = readyState
  }

  addEventListener(
    name: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    const once = typeof options === 'object' && Boolean(options.once)
    this.listeners.set(name, [
      ...(this.listeners.get(name) ?? []),
      { listener, once },
    ])
    if (typeof options === 'object' && options.signal) {
      options.signal.addEventListener(
        'abort',
        () => this.removeEventListener(name, listener),
        { once: true }
      )
    }
  }

  removeEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((entry) => entry.listener !== listener)
    )
  }

  dispatch(name: string) {
    const entries = [...(this.listeners.get(name) ?? [])]
    this.listeners.set(
      name,
      entries.filter((entry) => !entry.once)
    )
    const event = { type: name } as Event
    for (const { listener } of entries) {
      if (typeof listener === 'function') listener(event)
      else listener.handleEvent(event)
    }
  }

  listenerCount() {
    return [...this.listeners.values()].reduce(
      (total, listeners) => total + listeners.length,
      0
    )
  }

  setMetadata(duration: number) {
    this.duration = duration
    this.readyState = 1
    this.dispatch('loadedmetadata')
  }

  setDuration(duration: number) {
    this.duration = duration
    this.dispatch('durationchange')
  }

  load() {
    this.loadCount += 1
  }

  pause() {
    this.paused = true
  }

  play() {
    this.playCount += 1
    this.paused = false
    return this.playError ? Promise.reject(this.playError) : Promise.resolve()
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
}

const recording: ParshaAudioRecording = {
  id: 'current',
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'test', name: 'Test' },
  parshaSlug: 'test',
  parshaName: 'Test',
  aliyah: 2,
  title: 'Current',
  playSrc: '/current.mp3',
  downloadSrc: '/current.mp3',
  format: 'mp3',
  status: 'available',
}

const recordingWithId = (id: string): ParshaAudioRecording => ({
  ...recording,
  id,
  title: id,
  playSrc: `/${id}.mp3`,
  downloadSrc: `/${id}.mp3`,
})

const missingRecording: ParshaAudioRecording = {
  ...recording,
  id: 'missing',
  title: 'Missing',
  playSrc: '/missing.mp3',
  downloadSrc: '/missing.mp3',
  status: 'missing',
}

const plan = (endTime: number | null): PlaybackPlan => ({
  target: { runId: 'run', index: 2 },
  tokenKeys: ['1:0:0:0', '1:0:0:1'],
  status: 'current-only',
  segments: [
    {
      recording,
      tokenKeys: ['1:0:0:0', '1:0:0:1'],
      cues: [
        {
          timeStart: 0,
          pageNumber: 1,
          lineIndex: 0,
          fragmentIndex: 0,
          wordIndex: 0,
        },
        {
          timeStart: endTime === null ? 609.046 : Math.min(4, endTime),
          pageNumber: 1,
          lineIndex: 0,
          fragmentIndex: 0,
          wordIndex: 1,
        },
      ],
      startTime: 0,
      endTime,
    },
  ],
})

const compositePlan = (): PlaybackPlan => ({
  target: { runId: 'composite', index: 2 },
  tokenKeys: [],
  status: 'previous-opening',
  segments: [
    {
      recording: recordingWithId('previous'),
      tokenKeys: [],
      cues: [],
      startTime: 100,
      endTime: 110,
    },
    {
      recording: recordingWithId('final'),
      tokenKeys: [],
      cues: [],
      startTime: 20,
      endTime: null,
    },
  ],
})

const missingPlan = (): PlaybackPlan => ({
  ...plan(null),
  segments: [
    {
      ...plan(null).segments[0],
      recording: missingRecording,
      cues: [],
    },
  ],
})

function stubMediaGlobals(preloads: FakeAudioElement[] = []) {
  vi.stubGlobal('window', { location: { href: 'https://tikkun.test/' } })
  vi.stubGlobal('HTMLMediaElement', { HAVE_METADATA: 1 })
  vi.stubGlobal('Audio', class extends FakeAudioElement {
    constructor() {
      super(Number.NaN, 0)
      preloads.push(this)
    }
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('uses media metadata for an open-ended current segment', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(614.957)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(plan(null)))
  expect(controller.duration).toBe(614.957)

  controller.seek(612)
  expect(audio.currentTime).toBe(612)
  expect(controller.currentTime).toBe(612)
})

test('loads a missing recording as an authoring target without requesting media', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(Number.NaN, 0)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(missingPlan()))

  expect(controller.session?.recording.status).toBe('missing')
  expect(controller.currentTime).toBe(0)
  expect(controller.duration).toBe(Number.POSITIVE_INFINITY)
  expect(audio.src).toBe('')
  expect(audio.loadCount).toBe(0)
  await expect(controller.play()).rejects.toThrow(
    'record microphone audio first'
  )
})

test('authorizes media loading synchronously without starting playback', () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(Number.NaN, 0)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  expect(controller.authorizePlayback(recording)).toBe(true)
  expect(audio.src).toBe(recording.playSrc)
  expect(audio.loadCount).toBe(1)
  expect(audio.playCount).toBe(0)
})

test('plays synchronously when the active segment already has metadata', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(614.957)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(plan(null)))
  const playback = controller.play()

  expect(audio.playCount).toBe(1)
  await playback
})

test('requests playback synchronously while a user-authorized source loads metadata', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(Number.NaN, 0)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  controller.authorizePlayback(recording)
  await controller.loadSession(createActiveAudioSession(plan(null)))
  const playback = controller.play()
  let completed = false
  void playback.then(() => {
    completed = true
  })

  expect(audio.loadCount).toBe(1)
  expect(audio.playCount).toBe(1)
  await Promise.resolve()
  expect(completed).toBe(false)

  audio.setMetadata(614.957)
  await playback

  expect(completed).toBe(true)
  expect(audio.currentTime).toBe(0)
})

test('seeks repeatedly within the current segment without reactivating its media', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(614.957)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)
  const activatedRecordings: string[] = []
  controller.on('segment-updated', ({ segment }) => {
    activatedRecordings.push(segment.recording.id)
  })

  await controller.loadSession(createActiveAudioSession(plan(null)))
  controller.seek(120)
  controller.seek(240)

  expect(activatedRecordings).toEqual(['current'])
  expect(audio.loadCount).toBe(1)
  expect(controller.currentTime).toBe(240)
})

test('adopts a finite duration reported after loadedmetadata', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(Number.NaN, 0)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)
  const durations: number[] = []
  controller.on('duration-updated', ({ duration }) => durations.push(duration))

  await controller.loadSession(createActiveAudioSession(plan(null)))
  audio.setMetadata(Number.POSITIVE_INFINITY)
  expect(controller.duration).toBe(Number.POSITIVE_INFINITY)

  audio.setDuration(614.957)

  expect(controller.duration).toBe(614.957)
  expect(durations).toEqual([614.957])
})

test('continues to clamp an explicitly bounded overlap segment', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(614.957)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(plan(4.75)))
  expect(controller.duration).toBe(4.75)

  controller.seek(12)
  expect(audio.currentTime).toBe(4.75)
  expect(controller.currentTime).toBe(4.75)
})

test('keeps the authoring clock increasing after pausing beyond the final published cue', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(614.957)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(plan(null)))
  controller.seek(610)
  controller.pause()
  const firstCapture = controller.currentTime

  await controller.play()
  audio.currentTime = 612.5
  controller.pause()
  const secondCapture = controller.currentTime

  expect(firstCapture).toBe(610)
  expect(secondCapture).toBe(612.5)
  expect(secondCapture).toBeGreaterThan(firstCapture)
})

test('does not borrow the previous recording duration for an open final segment', async () => {
  const preloads: FakeAudioElement[] = []
  stubMediaGlobals(preloads)
  const audio = new FakeAudioElement(120)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(compositePlan()))

  expect(controller.duration).toBe(Number.POSITIVE_INFINITY)
  expect(preloads).toHaveLength(1)
  expect(preloads[0].preload).toBe('metadata')
  preloads[0].setMetadata(614)
  expect(controller.duration).toBe(604)
})

test('exposes the physical recording that owns the active logical segment', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(120)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)
  const activeRecordingIds: string[] = []
  controller.on('segment-updated', ({ segment }) => {
    activeRecordingIds.push(segment.recording.id)
  })

  await controller.loadSession(createActiveAudioSession(compositePlan()))
  controller.seek(11)

  expect(activeRecordingIds).toEqual(['previous', 'final'])
  expect(controller.activeSegment?.recording.id).toBe('final')
  expect(audio.currentTime).toBe(21)
})

test('releases an obsolete next-recording preload when the session changes', async () => {
  const preloads: FakeAudioElement[] = []
  stubMediaGlobals(preloads)
  const audio = new FakeAudioElement(120)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(compositePlan()))
  expect(preloads).toHaveLength(1)

  await controller.loadSession(createActiveAudioSession(plan(null)))

  expect(preloads[0].src).toBe('')
  expect(preloads[0].loadCount).toBe(1)
  expect(preloads[0].paused).toBe(true)
})

test('can seek into the final recording before its metadata is known', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(120)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(compositePlan()))
  audio.duration = Number.NaN
  audio.readyState = 0
  controller.seek(500)
  audio.setMetadata(614)

  expect(audio.currentTime).toBe(510)
  expect(controller.currentTime).toBe(500)
  expect(controller.duration).toBe(604)
})

test('cancels stale metadata callbacks and autoplay when a session is replaced', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(120)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(compositePlan()))
  audio.duration = Number.NaN
  audio.readyState = 0
  audio.dispatch('ended')

  const replacementPlan: PlaybackPlan = {
    ...plan(null),
    target: { runId: 'replacement', index: 2 },
    segments: [{ ...plan(null).segments[0], recording: recordingWithId('replacement') }],
  }
  await controller.loadSession(createActiveAudioSession(replacementPlan))
  audio.setMetadata(50)
  await Promise.resolve()

  expect(controller.session?.runId).toBe('replacement')
  expect(audio.playCount).toBe(0)
  expect(audio.currentTime).toBe(0)
})

test('fails pending playback on a media error and recovers on retry', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(Number.NaN, 0)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)
  const errors: Error[] = []
  controller.on('playback-error', ({ error }) => errors.push(error))

  await controller.loadSession(createActiveAudioSession(plan(null)))
  const firstPlay = controller.play()
  const firstPlayExpectation = expect(firstPlay).rejects.toThrow('code 4')
  audio.error = { code: 4 }
  audio.dispatch('error')

  await firstPlayExpectation
  expect(errors).toHaveLength(1)
  expect(controller.error).toBe(errors[0])

  audio.error = null
  const retry = controller.play()
  audio.setMetadata(614.957)
  await retry

  expect(controller.error).toBeNull()
  expect(audio.playCount).toBe(2)
})

test('cancels pending playback when the session is cleared', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(Number.NaN, 0)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(plan(null)))
  const pendingPlay = controller.play()
  controller.clearSession()
  audio.setMetadata(20)

  await expect(pendingPlay).resolves.toBeUndefined()
  expect(controller.session).toBeNull()
  expect(audio.playCount).toBe(1)
})

test('times out pending metadata instead of leaving playback unresolved', async () => {
  vi.useFakeTimers()
  stubMediaGlobals()
  const audio = new FakeAudioElement(Number.NaN, 0)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(plan(null)))
  const pendingPlay = controller.play()
  const timeoutExpectation = expect(pendingPlay).rejects.toThrow(
    'Timed out loading audio metadata'
  )
  await vi.advanceTimersByTimeAsync(15_000)

  await timeoutExpectation
})

test('does not reload media after a recoverable play rejection', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(20)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(plan(null)))
  const loadCount = audio.loadCount
  audio.playError = new Error('Playback requires a user gesture')
  await expect(controller.play()).rejects.toThrow('user gesture')

  audio.playError = null
  await controller.play()

  expect(audio.loadCount).toBe(loadCount)
  expect(controller.error).toBeNull()
})

test('waits for a finite open-segment duration and supports cancellation', async () => {
  stubMediaGlobals()
  const audio = new FakeAudioElement(Number.NaN, 0)
  const controller = new AudioController(audio as unknown as HTMLAudioElement)

  await controller.loadSession(createActiveAudioSession(plan(null)))
  const duration = controller.waitForFiniteDuration()
  audio.setDuration(614.957)

  await expect(duration).resolves.toBe(614.957)

  const pendingAudio = new FakeAudioElement(Number.NaN, 0)
  const pendingController = new AudioController(
    pendingAudio as unknown as HTMLAudioElement
  )
  await pendingController.loadSession(createActiveAudioSession(plan(null)))
  const abortController = new AbortController()
  const cancelled = pendingController.waitForFiniteDuration({
    signal: abortController.signal,
  })
  abortController.abort()

  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
})

test('rejects malformed segment boundaries before media activation', () => {
  const invalidOpenPlan = compositePlan()
  invalidOpenPlan.segments[0]!.endTime = null
  expect(() => createActiveAudioSession(invalidOpenPlan)).toThrow(
    'Only the final playback segment may be open-ended'
  )

  const invalidCuePlan = plan(4.75)
  invalidCuePlan.segments[0]!.cues[1]!.timeEnd = 5
  expect(() => createActiveAudioSession(invalidCuePlan)).toThrow(
    'invalid cue ordering'
  )
})

test('releases media listeners, playback work, and preloads when destroyed', async () => {
  const preloads: FakeAudioElement[] = []
  stubMediaGlobals(preloads)
  const cancelAnimationFrame = vi.fn()
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42))
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
  const audio = new FakeAudioElement(20)
  const lifetime = new AbortController()
  const controller = new AudioController(
    audio as unknown as HTMLAudioElement,
    { signal: lifetime.signal }
  )

  await controller.loadSession(createActiveAudioSession(compositePlan()))
  expect(audio.listenerCount()).toBeGreaterThan(0)
  expect(preloads).toHaveLength(1)
  audio.paused = false
  audio.dispatch('play')

  lifetime.abort()

  expect(audio.listenerCount()).toBe(0)
  expect(controller.session).toBeNull()
  expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
  expect(preloads[0]?.src).toBe('')
  expect(preloads[0]?.loadCount).toBeGreaterThan(0)
})
