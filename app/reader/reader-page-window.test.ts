import { expect, test } from 'vitest'

import {
  createReaderPageWindow,
  type ReaderPageWindowDisplay,
  type ReaderPageWindowFrameAdapter,
  type ReaderPageWindowTimerAdapter,
} from './reader-page-window.ts'

test('marks only the active display ready without applying until a page-rendered signal', () => {
  const fixture = createFixture({ playbackPages: [] })
  const display = new FakeDisplay([1, 2, 3, 4, 5, 6, 7, 8], 4)
  const staleDisplay = new FakeDisplay([20], 20)

  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.markReady(staleDisplay)
  fixture.pageWindow.afterPageRendered()

  expect(display.evictCalls).toEqual([])

  fixture.pageWindow.markReady(display)
  expect(display.evictCalls).toEqual([])

  fixture.pageWindow.afterPageRendered()

  expect(display.evictCalls).toEqual([[1, 7, 8]])
})

test('builds one policy from viewport, rail target, and bounded playback pages', () => {
  const fixture = createFixture({ playbackPages: [10, 11, 12, 13] })
  const display = new FakeDisplay(pages(1, 12), 4)

  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.setRailTarget(9)
  fixture.pageWindow.markReady(display)
  fixture.pageWindow.afterPageRendered()

  expect(fixture.playbackForwardCounts).toEqual([2])
  expect(display.evictCalls).toEqual([[1, 7, 8]])
})

test('nested navigation holds apply only when the final hold releases', () => {
  const fixture = createFixture({ playbackPages: [] })
  const display = new FakeDisplay(pages(1, 8), 4)
  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.markReady(display)

  const first = fixture.pageWindow.holdNavigation()
  const second = fixture.pageWindow.holdNavigation()
  fixture.pageWindow.afterPageRendered()

  expect(display.evictCalls).toEqual([])

  first.release()
  first.release()
  expect(display.evictCalls).toEqual([])

  second.release()
  expect(display.evictCalls).toEqual([[1, 7, 8]])
})

test('navigation hold uses the bounded timer while an ordinary pause never applies on release', () => {
  const fixture = createFixture({ playbackPages: [] })
  const display = new FakeDisplay(pages(1, 8), 4)
  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.markReady(display)

  const pause = fixture.pageWindow.pauseEviction()
  fixture.pageWindow.afterPageRendered()
  pause.release()

  expect(display.evictCalls).toEqual([])

  const navigation = fixture.pageWindow.holdNavigation()
  navigation.releaseAfterNavigation()
  expect(fixture.timer.delays()).toEqual([1400])
  fixture.timer.runNext()

  expect(display.evictCalls).toEqual([[1, 7, 8]])
})

test('coalesces viewport remount work and refreshes only after current-display completion', async () => {
  const fixture = createFixture({ playbackPages: [] })
  const display = new FakeDisplay([1, 2, 3], 2)
  display.setEvicted([1])
  display.nearViewportPages = [1]
  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.markReady(display)

  fixture.pageWindow.onReaderScroll()
  fixture.pageWindow.onReaderScroll()

  expect(fixture.frame.pendingCount()).toBe(1)
  fixture.frame.runNext()
  await flushMicrotasks()

  expect(display.nearViewportQueries).toEqual([{ marginPx: 200 }])
  expect(display.nearViewportMountCalls).toEqual([{ marginPx: 200 }])
  expect(fixture.effectEvents).toEqual(['refresh-viewport', 'invalidate-position'])
  expect(fixture.frame.pendingCount()).toBe(1)

  display.nearViewportPages = []
  fixture.pageWindow.onReaderScroll()
  fixture.pageWindow.onReaderScroll()
  expect(fixture.frame.pendingCount()).toBe(1)

  fixture.frame.runNext()
  await flushMicrotasks()
  expect(fixture.frame.pendingCount()).toBe(1)

  fixture.frame.runNext()
  expect(fixture.frame.pendingCount()).toBe(0)
})

test('reschedules a paused viewport trim only after the final ordinary pause releases', async () => {
  const fixture = createFixture({ playbackPages: [] })
  const display = new FakeDisplay(pages(1, 8), 4)
  display.setEvicted([1])
  display.nearViewportPages = [1]
  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.markReady(display)
  fixture.pageWindow.onReaderScroll()
  fixture.frame.runNext()
  await flushMicrotasks()

  const firstPause = fixture.pageWindow.pauseEviction()
  const finalPause = fixture.pageWindow.pauseEviction()
  fixture.frame.runNext()

  expect(fixture.frame.pendingCount()).toBe(0)

  firstPause.release()
  expect(fixture.frame.pendingCount()).toBe(0)

  finalPause.release()
  expect(fixture.frame.pendingCount()).toBe(1)

  fixture.frame.runNext()
  expect(display.evictCalls).toEqual([[1, 7, 8]])
})

test('trims remounted pages after reverse traversal and keeps the mounted set bounded', async () => {
  const fixture = createFixture({ playbackPages: [] })
  const display = new FakeDisplay(pages(1, 12), 10)
  display.onPageRendered = () => fixture.pageWindow.afterPageRendered()
  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.markReady(display)
  fixture.pageWindow.afterPageRendered()

  expect(display.getMountedPageNumbers()).toEqual([8, 9, 10, 11, 12])

  let peakMountedPageCount = display.getMountedPageNumbers().length
  for (const pageNumber of [7, 6, 5, 4, 3, 2, 1]) {
    display.setViewportPageNumber(pageNumber)
    display.nearViewportPages = [pageNumber]
    fixture.pageWindow.onReaderScroll()
    fixture.frame.runNext()
    await flushMicrotasks()

    peakMountedPageCount = Math.max(
      peakMountedPageCount,
      display.getMountedPageNumbers().length
    )
    expect(fixture.frame.pendingCount()).toBe(1)
    fixture.frame.runNext()
    expect(display.getMountedPageNumbers().length).toBeLessThanOrEqual(5)
  }

  expect(peakMountedPageCount).toBe(6)
  expect(display.getMountedPageNumbers()).toEqual([1, 2, 3])
})

test('keeps a pending remount pause across display replacement and ignores its stale completion', async () => {
  const fixture = createFixture({ playbackPages: [] })
  const oldDisplay = new FakeDisplay([1, 2, 3], 2)
  oldDisplay.setEvicted([1])
  oldDisplay.nearViewportPages = [1]
  const pendingRemount = deferred<number[]>()
  oldDisplay.nearViewportMountResult = pendingRemount.promise
  fixture.pageWindow.replaceDisplay(oldDisplay)
  fixture.pageWindow.markReady(oldDisplay)
  fixture.pageWindow.onReaderScroll()
  fixture.frame.runNext()
  await flushMicrotasks()

  const newDisplay = new FakeDisplay(pages(10, 17), 13)
  fixture.pageWindow.replaceDisplay(newDisplay)
  fixture.pageWindow.markReady(newDisplay)
  fixture.pageWindow.afterPageRendered()

  expect(newDisplay.evictCalls).toEqual([])

  pendingRemount.resolve([1])
  await flushMicrotasks()

  expect(fixture.effectEvents).toEqual([])

  fixture.pageWindow.afterPageRendered()
  expect(newDisplay.evictCalls).toEqual([[10, 16, 17]])
})

test('destroy cancels scheduled remount trim and navigation timer idempotently', async () => {
  const fixture = createFixture({ playbackPages: [] })
  const display = new FakeDisplay([1, 2, 3], 2)
  display.setEvicted([1])
  display.nearViewportPages = [1]
  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.markReady(display)
  fixture.pageWindow.onReaderScroll()
  fixture.frame.runNext()
  await flushMicrotasks()
  expect(fixture.frame.pendingCount()).toBe(1)
  fixture.pageWindow.holdNavigation().releaseAfterNavigation()

  fixture.pageWindow.destroy()
  fixture.pageWindow.destroy()

  expect(fixture.frame.pendingCount()).toBe(0)
  expect(fixture.timer.pendingCount()).toBe(0)
  fixture.pageWindow.afterPageRendered()
  expect(display.evictCalls).toEqual([])
})

test('destroy cancels a viewport trim rescheduled by ordinary pause release', async () => {
  const fixture = createFixture({ playbackPages: [] })
  const display = new FakeDisplay(pages(1, 8), 4)
  display.setEvicted([1])
  display.nearViewportPages = [1]
  fixture.pageWindow.replaceDisplay(display)
  fixture.pageWindow.markReady(display)
  fixture.pageWindow.onReaderScroll()
  fixture.frame.runNext()
  await flushMicrotasks()

  const pause = fixture.pageWindow.pauseEviction()
  fixture.frame.runNext()
  expect(fixture.frame.pendingCount()).toBe(0)

  pause.release()
  expect(fixture.frame.pendingCount()).toBe(1)

  fixture.pageWindow.destroy()

  expect(fixture.frame.pendingCount()).toBe(0)
  expect(display.evictCalls).toEqual([])
})

function createFixture({
  playbackPages,
  search = '?virtualizePages=1',
}: {
  playbackPages: number[]
  search?: string
}) {
  const frame = createFrameAdapter()
  const timer = createTimerAdapter()
  const playbackForwardCounts: number[] = []
  const effectEvents: string[] = []
  const pageWindow = createReaderPageWindow({
    search,
    frame,
    timer,
    getPlaybackProtectedPageNumbers(forwardPageCount) {
      playbackForwardCounts.push(forwardPageCount)
      return playbackPages
    },
    refreshViewport() {
      effectEvents.push('refresh-viewport')
    },
    invalidateReaderPosition() {
      effectEvents.push('invalidate-position')
    },
  })

  return {
    pageWindow,
    frame,
    timer,
    playbackForwardCounts,
    effectEvents,
  }
}

class FakeDisplay implements ReaderPageWindowDisplay {
  readonly root = { clientHeight: 100 }
  readonly evictCalls: number[][] = []
  readonly nearViewportQueries: Array<{ marginPx: number }> = []
  readonly nearViewportMountCalls: Array<{ marginPx: number }> = []
  readonly states = new Map<number, 'mounted' | 'evicted'>()
  nearViewportPages: number[] = []
  nearViewportMountResult: Promise<number[]> | null = null
  onPageRendered: (() => void) | null = null

  constructor(
    pageNumbers: number[],
    private viewportPageNumber: number | null
  ) {
    pageNumbers.forEach((pageNumber) => this.states.set(pageNumber, 'mounted'))
  }

  setEvicted(pageNumbers: number[]) {
    pageNumbers.forEach((pageNumber) => this.states.set(pageNumber, 'evicted'))
  }

  setViewportPageNumber(pageNumber: number | null) {
    this.viewportPageNumber = pageNumber
  }

  getMountedPageNumbers() {
    return [...this.states]
      .filter(([, state]) => state === 'mounted')
      .map(([pageNumber]) => pageNumber)
      .sort((left, right) => left - right)
  }

  getViewportAnchorPageNumber() {
    return this.viewportPageNumber
  }

  evictPages(pageNumbers: number[]) {
    this.evictCalls.push([...pageNumbers])
    return pageNumbers.filter((pageNumber) => {
      if (this.states.get(pageNumber) !== 'mounted') return false
      this.states.set(pageNumber, 'evicted')
      return true
    })
  }

  getEvictedPageNumbersNearViewport(options: { marginPx: number }) {
    this.nearViewportQueries.push(options)
    return this.nearViewportPages.filter(
      (pageNumber) => this.states.get(pageNumber) === 'evicted'
    )
  }

  async ensureEvictedPagesMountedNearViewport(options: { marginPx: number }) {
    this.nearViewportMountCalls.push(options)
    if (this.nearViewportMountResult) return this.nearViewportMountResult
    const remountedPages = this.nearViewportPages.filter(
      (pageNumber) => this.states.get(pageNumber) === 'evicted'
    )
    remountedPages.forEach((pageNumber) => {
      this.states.set(pageNumber, 'mounted')
      this.onPageRendered?.()
    })
    return remountedPages
  }
}

function createFrameAdapter() {
  let nextHandle = 1
  const callbacks = new Map<number, (timestamp: number) => void>()
  const adapter: ReaderPageWindowFrameAdapter & {
    pendingCount(): number
    runNext(): void
  } = {
    request(callback) {
      const handle = nextHandle
      nextHandle += 1
      callbacks.set(handle, callback)
      return handle
    },
    cancel(handle) {
      callbacks.delete(handle)
    },
    pendingCount: () => callbacks.size,
    runNext() {
      const entry = callbacks.entries().next().value as
        | [number, (timestamp: number) => void]
        | undefined
      if (!entry) throw new Error('No frame is scheduled')
      callbacks.delete(entry[0])
      entry[1](0)
    },
  }
  return adapter
}

function createTimerAdapter() {
  let nextHandle = 1
  const callbacks = new Map<number, { callback: () => void; delayMs: number }>()
  const adapter: ReaderPageWindowTimerAdapter & {
    pendingCount(): number
    delays(): number[]
    runNext(): void
  } = {
    set(callback, delayMs) {
      const handle = nextHandle
      nextHandle += 1
      callbacks.set(handle, { callback, delayMs })
      return handle
    },
    clear(handle) {
      callbacks.delete(handle)
    },
    pendingCount: () => callbacks.size,
    delays: () => [...callbacks.values()].map(({ delayMs }) => delayMs),
    runNext() {
      const entry = callbacks.entries().next().value as
        | [number, { callback: () => void; delayMs: number }]
        | undefined
      if (!entry) throw new Error('No timer is scheduled')
      callbacks.delete(entry[0])
      entry[1].callback()
    },
  }
  return adapter
}

function pages(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}
