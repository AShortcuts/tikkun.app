import { expect, test, vi } from 'vitest'
import {
  createReaderPresentationScheduler,
  type ReaderPresentationFrame,
} from './reader-presentation-scheduler.ts'

function createFrameHarness() {
  let nextFrame = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  return {
    adapter: {
      request(callback: FrameRequestCallback) {
        const frame = nextFrame++
        callbacks.set(frame, callback)
        return frame
      },
      cancel(frame: number) {
        callbacks.delete(frame)
      },
    },
    size() {
      return callbacks.size
    },
    flush(timestampMs = 0) {
      const current = [...callbacks.values()]
      callbacks.clear()
      current.forEach((callback) => callback(timestampMs))
    },
  }
}

test('coalesces mixed invalidations into one ordered immutable frame', () => {
  const frames = createFrameHarness()
  const presented: ReaderPresentationFrame[] = []
  const scheduler = createReaderPresentationScheduler({
    frame: frames.adapter,
    present: (snapshot) => presented.push(snapshot),
  })

  scheduler.invalidate('reader-position')
  scheduler.invalidate('playback-state', 'inline-audio')
  scheduler.invalidate('reader-position', 'viewport-title')

  expect(frames.size()).toBe(1)

  frames.flush()

  expect(presented).toEqual([
    {
      revision: 1,
      invalidations: [
        'viewport-title',
        'inline-audio',
        'reader-position',
        'playback-state',
      ],
    },
  ])
  expect(Object.isFrozen(presented[0])).toBe(true)
  expect(Object.isFrozen(presented[0].invalidations)).toBe(true)
})

test('moves reentrant invalidation to the following frame', () => {
  const frames = createFrameHarness()
  const presented: ReaderPresentationFrame[] = []
  const scheduler = createReaderPresentationScheduler({
    frame: frames.adapter,
    present: (snapshot) => {
      presented.push(snapshot)
      if (snapshot.revision === 1) scheduler.invalidate('playback-state')
    },
  })

  scheduler.invalidate('reader-position')
  frames.flush()

  expect(presented.map(({ invalidations }) => invalidations)).toEqual([
    ['reader-position'],
  ])
  expect(frames.size()).toBe(1)

  frames.flush()
  expect(presented.map(({ invalidations }) => invalidations)).toEqual([
    ['reader-position'],
    ['playback-state'],
  ])
})

test('defers layout-sensitive work one frame before normal presentation', () => {
  const frames = createFrameHarness()
  const present = vi.fn()
  const scheduler = createReaderPresentationScheduler({
    frame: frames.adapter,
    present,
  })

  scheduler.invalidateAfterLayout('reader-position')
  scheduler.invalidateAfterLayout('reader-position', 'viewport-title')

  expect(frames.size()).toBe(1)

  frames.flush()
  expect(present).not.toHaveBeenCalled()
  expect(frames.size()).toBe(1)

  frames.flush()
  expect(present).toHaveBeenCalledOnce()
  expect(present.mock.calls[0][0].invalidations).toEqual([
    'viewport-title',
    'reader-position',
  ])
})

test('joins deferred work to an already scheduled presentation frame', () => {
  const frames = createFrameHarness()
  const present = vi.fn()
  const scheduler = createReaderPresentationScheduler({
    frame: frames.adapter,
    present,
  })

  scheduler.invalidateAfterLayout('reader-position')
  frames.flush()
  scheduler.invalidate('playback-state')

  expect(frames.size()).toBe(1)
  frames.flush()

  expect(present).toHaveBeenCalledOnce()
  expect(present.mock.calls[0][0].invalidations).toEqual([
    'reader-position',
    'playback-state',
  ])
})

test('uses one frame pump for immediate and layout-deferred work', () => {
  const frames = createFrameHarness()
  const presented: ReaderPresentationFrame[] = []
  const scheduler = createReaderPresentationScheduler({
    frame: frames.adapter,
    present: (snapshot) => presented.push(snapshot),
  })

  scheduler.invalidate('inline-audio')
  scheduler.invalidateAfterLayout('reader-position')

  expect(frames.size()).toBe(1)
  frames.flush()
  expect(presented.map(({ invalidations }) => invalidations)).toEqual([
    ['inline-audio'],
  ])
  expect(frames.size()).toBe(1)

  frames.flush()
  expect(presented.map(({ invalidations }) => invalidations)).toEqual([
    ['inline-audio'],
    ['reader-position'],
  ])
})

test('destroy cancels pending work and makes future invalidation inert', () => {
  const frames = createFrameHarness()
  const present = vi.fn()
  const scheduler = createReaderPresentationScheduler({
    frame: frames.adapter,
    present,
  })

  scheduler.invalidate('reader-position')
  scheduler.invalidateAfterLayout('viewport-title')
  expect(frames.size()).toBe(1)

  scheduler.destroy()
  scheduler.destroy()
  scheduler.invalidate('playback-state')
  frames.flush()

  expect(frames.size()).toBe(0)
  expect(present).not.toHaveBeenCalled()
})
