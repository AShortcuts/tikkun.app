import { afterEach, expect, test, vi } from 'vitest'
import { audioRecordings } from '../../generated/audio-manifest.ts'
import { type NativePlaybackPlugin, type NativePlaybackState } from '../platform/native-playback.ts'
import { createActiveAudioSession } from './audio-controller.ts'
import { NativeAudioController } from './native-audio-controller.ts'

const controllers: NativeAudioController[] = []
afterEach(() => { controllers.splice(0).forEach((controller) => controller.destroy()); vi.restoreAllMocks() })

function harness(resolveSource?: ConstructorParameters<typeof NativeAudioController>[2]) {
  let state: NativePlaybackState = {
    revision: 0, sessionID: null, segmentIndex: 0, currentTime: 0, duration: null,
    paused: true, ended: false, rate: 1, phase: 'idle', error: null,
  }
  const callbacks = new Map<string, (state: unknown) => void>()
  const emit = (patch: Partial<NativePlaybackState>) => {
    state = { ...state, ...patch, revision: state.revision + 1 }
    callbacks.get('stateChanged')?.(state)
    return Promise.resolve(state)
  }
  const remove = vi.fn(async () => {})
  const bridge: NativePlaybackPlugin = {
    setSession: vi.fn(async ({ sessionID }) => emit({ sessionID, phase: 'ready', currentTime: 0, paused: true, duration: 10 })),
    getState: vi.fn(async () => state),
    play: vi.fn(async () => emit({ paused: false })),
    pause: vi.fn(async () => emit({ paused: true })),
    seek: vi.fn(async ({ time }) => emit({ currentTime: time })),
    setRate: vi.fn(async ({ rate }) => emit({ rate })),
    clear: vi.fn(async () => emit({ sessionID: null, phase: 'idle', paused: true })),
    addListener: vi.fn(async (event, callback) => { callbacks.set(event, callback); return { remove } }),
  }
  const audio = document.createElement('audio')
  vi.spyOn(audio, 'load').mockImplementation(() => {})
  const htmlPlay = vi.spyOn(audio, 'play').mockResolvedValue()
  const controller = new NativeAudioController(audio, bridge, resolveSource)
  controllers.push(controller)
  const session = createActiveAudioSession({
    target: { runId: 'test', index: 1 }, tokenKeys: [], status: 'current-only',
    segments: [{ recording: { ...audioRecordings[0], playSrc: 'https://tikkunreader.com/audio/first.m4a' },
      tokenKeys: [], cues: [], startTime: 2, endTime: 12 }],
  })
  return { controller, session, bridge, emit, callbacks, htmlPlay, remove }
}

test('native playback receives the exact physical plan and serializes seek before play', async () => {
  const { controller, session, bridge, htmlPlay } = harness()
  await controller.loadSession(session)
  expect(bridge.setSession).toHaveBeenCalledWith(expect.objectContaining({
    segments: [{ url: 'https://tikkunreader.com/audio/first.m4a', start: 2, end: 12 }],
  }))
  controller.seek(4)
  await controller.play()
  expect(bridge.seek).toHaveBeenCalledWith(expect.objectContaining({ time: 4 }))
  expect(controller.currentTime).toBe(4)
  expect(controller.paused).toBe(false)
  expect(htmlPlay).not.toHaveBeenCalled()
  expect(vi.mocked(bridge.seek).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(bridge.play).mock.invocationCallOrder[0])
})

test('native state drives highlights, while stale session and revision events are ignored', async () => {
  const { controller, session, emit, callbacks } = harness()
  const frame = vi.fn()
  controller.on('frame-updated', frame)
  await controller.loadSession(session)
  const previous = await emit({ currentTime: 3 })
  await emit({ currentTime: 7 })
  callbacks.get('stateChanged')?.(previous)
  expect(controller.currentTime).toBe(7)
  callbacks.get('stateChanged')?.({ ...previous, sessionID: 'replaced', revision: 1000 })
  expect(controller.currentTime).toBe(7)
  expect(frame).toHaveBeenLastCalledWith({ currentTime: 7 })
})

test('bridge errors use the existing Reader error path and playback can retry', async () => {
  const { controller, session, bridge } = harness()
  const error = vi.fn()
  controller.on('playback-error', error)
  await controller.loadSession(session)
  vi.mocked(bridge.play).mockRejectedValueOnce(new Error('Audio session unavailable'))
  await expect(controller.play()).rejects.toThrow('Audio session unavailable')
  expect(error).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }))
  await controller.play()
  expect(controller.error).toBeNull()
})

test('published playback uses the verified local file without rewriting catalog identity', async () => {
  const resolve = vi.fn(async () => 'file:///owned/one.m4a')
  const { controller, session, bridge } = harness(resolve)
  await controller.loadSession(session)
  expect(bridge.setSession).toHaveBeenCalledWith(expect.objectContaining({
    segments: [{ url: 'file:///owned/one.m4a', start: 2, end: 12 }],
  }))
  expect(session.segments[0].recording.playSrc).toBe('https://tikkunreader.com/audio/first.m4a')
})
