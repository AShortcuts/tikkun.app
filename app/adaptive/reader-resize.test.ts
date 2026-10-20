import { expect, test, vi } from 'vitest'
import { observeReaderResize } from './reader-resize.ts'

class ResizeView extends EventTarget {
  visualViewport = new EventTarget()
  frames = new Map<number, FrameRequestCallback>()
  nextFrame = 0
  requestAnimationFrame(callback: FrameRequestCallback) {
    const id = ++this.nextFrame
    this.frames.set(id, callback)
    return id
  }
  cancelAnimationFrame(id: number) { this.frames.delete(id) }
  flush() {
    const callbacks = [...this.frames.values()]
    this.frames.clear()
    callbacks.forEach(callback => callback(0))
  }
}

test('coalesces all resize sources and orders chrome, content and final positioning in one frame', () => {
  const view = new ResizeView()
  const calls: string[] = []
  const subscriptions = (['position', 'content', 'viewport', 'chrome'] as const).map(phase =>
    observeReaderResize(view, phase, () => calls.push(phase)))
  view.dispatchEvent(new Event('resize'))
  view.visualViewport.dispatchEvent(new Event('resize'))
  subscriptions[0].request()
  expect(view.frames.size).toBe(1)
  expect(calls).toEqual([])
  view.flush()
  expect(calls).toEqual(['viewport', 'chrome', 'content', 'position'])
  expect(view.frames.size).toBe(0)
  subscriptions.forEach(subscription => subscription.destroy())
})

test('new content replaces stale content within the same transaction', () => {
  const view = new ResizeView()
  const oldLayout = vi.fn()
  const newLayout = vi.fn()
  let content = observeReaderResize(view, 'content', oldLayout)
  const viewport = observeReaderResize(view, 'viewport', () => {
    content.destroy()
    content = observeReaderResize(view, 'content', newLayout)
  })
  viewport.request()
  view.flush()
  expect(oldLayout).not.toHaveBeenCalled()
  expect(newLayout).toHaveBeenCalledOnce()
  viewport.destroy()
  content.destroy()
})

test('unmount cancels queued work and releases event listeners', () => {
  const view = new ResizeView()
  const update = vi.fn()
  const subscription = observeReaderResize(view, 'content', update)
  subscription.request()
  subscription.destroy()
  view.dispatchEvent(new Event('resize'))
  view.visualViewport.dispatchEvent(new Event('resize'))
  expect(view.frames.size).toBe(0)
  view.flush()
  expect(update).not.toHaveBeenCalled()
})

test('requests for upcoming phases are completed in the current frame', () => {
  const view = new ResizeView()
  const update = vi.fn()
  const content = observeReaderResize(view, 'content', update)
  const viewport = observeReaderResize(view, 'viewport', () => content.request())
  viewport.request()
  view.flush()
  expect(update).toHaveBeenCalledOnce()
  expect(view.frames.size).toBe(0)
  viewport.destroy()
  content.destroy()
})

test('requests for already completed phases schedule a new frame', () => {
  const view = new ResizeView()
  const update = vi.fn()
  const content = observeReaderResize(view, 'content', update)
  const position = observeReaderResize(view, 'position', () => content.request())
  content.request()
  view.flush()
  expect(update).toHaveBeenCalledOnce()
  expect(view.frames.size).toBe(1)
  position.destroy()
  view.flush()
  expect(update).toHaveBeenCalledTimes(2)
  content.destroy()
})
