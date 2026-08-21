import { expect, test, vi } from 'vitest'

import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { ScrollDisplay } from '../components/ScrollDisplay.ts'
import type {
  RenderedEntry,
  ScrollViewModel,
} from '../view-model/scroll-view-model.ts'
import {
  createReaderDisplaySession,
  type ReaderDisplayBackgroundTaskAdapter,
  type ReaderDisplaySessionEffects,
} from './reader-display-session.ts'
import type {
  ReaderPageWindowFrameAdapter,
  ReaderPageWindowTimerAdapter,
} from './reader-page-window.ts'

test('replaces one display generation in the original lifecycle order and ignores stale settlement', async () => {
  const fixture = createFixture()
  const first = fixture.displays[0]
  const firstRendering = fixture.session.render(first.viewModel)
  const firstLease = fixture.session.capture()

  expect(fixture.events).toEqual([
    'effect:before-replacement',
    'effect:reset-resources',
    'effect:after-reset',
    'root:visibility:hidden',
    'root:busy',
    'factory:display:1',
    'effect:display-created:1',
  ])
  expect(firstLease?.generation).toBe(1)
  expect(firstRendering.isCurrent()).toBe(true)

  const second = fixture.addDisplay()
  fixture.session.render(second.viewModel)

  expect(fixture.events.slice(7)).toEqual([
    'display:1:destroy',
    'effect:before-replacement',
    'effect:reset-resources',
    'effect:after-reset',
    'root:visibility:hidden',
    'root:busy',
    'factory:display:2',
    'effect:display-created:2',
  ])
  expect(firstLease?.signal.aborted).toBe(true)
  expect(firstLease?.isCurrent()).toBe(false)
  expect(firstRendering.isCurrent()).toBe(false)

  first.resolveScrolled()
  await flushMicrotasks()
  expect(fixture.frame.pendingCount()).toBe(0)

  second.resolveScrolled()
  await flushMicrotasks()
  expect(fixture.frame.pendingCount()).toBe(1)
  expect(fixture.frame.requestCount()).toBe(1)
  fixture.frame.runNext()
  expect(fixture.frame.pendingCount()).toBe(1)
  expect(fixture.frame.requestCount()).toBe(2)
  fixture.frame.runNext()
  await flushMicrotasks()
  expect(fixture.frame.pendingCount()).toBe(0)
  expect(fixture.frame.requestCount()).toBe(2)

  expect(fixture.events.slice(-2)).toEqual([
    'root:visibility:',
    'root:not-busy',
  ])
  expect(fixture.viewport.refresh).toHaveBeenCalledOnce()
})

test('owns page indexing, policy, presentation invalidation, and eviction cleanup in event order', async () => {
  const fixture = createFixture({ search: '?virtualizePages=1' })
  const display = fixture.displays[0]
  display.mountedPages = [1, 2, 3, 4, 5, 6, 7, 8]
  display.viewportPageNumber = 4
  fixture.session.render(display.viewModel)
  display.resolveScrolled()
  await flushMicrotasks()
  fixture.frame.runNext()
  fixture.frame.runNext()
  fixture.events.length = 0

  const pageRoot = createPageRoot(fixture.events, 1)
  fixture.session.pageRendered(pageRoot, () => {
    fixture.events.push('decorate')
  })

  expect(fixture.events).toEqual([
    'index:lines',
    'index:markers',
    'decorate',
    'display:1:evict:1,7,8',
  ])
  expect(
    (await fixture.session.ensureAliyahDomTargetRendered('run-1', 1))?.marker,
  ).not.toBeNull()
  expect(fixture.frame.pendingCount()).toBe(1)

  fixture.session.pageEvicted(1)
  expect(
    await fixture.session.ensureAliyahDomTargetRendered('run-1', 1),
  ).toBeNull()
})

test('cancels stale prewarm work and clears audio when the display generation changes', async () => {
  const fixture = createFixture()
  const first = fixture.displays[0]
  const run = createRun()
  first.viewModel = createViewModel(run)
  const pageFetch = deferred<RenderedEntry | null>()
  first.viewModel.fetchPageByPageNumber = vi.fn(() => pageFetch.promise)
  fixture.session.render(first.viewModel)
  fixture.session.syncAudioPreload('/audio/first.mp3')
  fixture.session.scheduleResourcePrewarm([{ run, aliyahIndex: 1 }], 'first')
  fixture.session.scheduleResourcePrewarm([{ run, aliyahIndex: 1 }], 'first')

  first.resolveScrolled()
  await flushMicrotasks()
  expect(fixture.background.pendingCount()).toBe(1)
  fixture.background.runNext()
  await flushMicrotasks()
  expect(first.viewModel.fetchPageByPageNumber).toHaveBeenCalledOnce()

  const second = fixture.addDisplay()
  fixture.session.render(second.viewModel)
  pageFetch.resolve(null)
  await flushMicrotasks()

  expect(fixture.effects.prewarmCueData).not.toHaveBeenCalled()
  expect(fixture.audio.pause).toHaveBeenCalledOnce()
  expect(fixture.audio.removeAttribute).toHaveBeenCalledWith('src')
  expect(fixture.audio.load).toHaveBeenCalledTimes(2)
})

test('cannot repopulate the current location cache from a stale resolver', async () => {
  const fixture = createFixture()
  const first = fixture.displays[0]
  const run = createRun()
  const resolver = deferred<{
    physicalLocationFromRef(): { pageNumber: number; lineNumber: number }
  }>()
  first.viewModel = {
    ...createViewModel(run),
    resolver: resolver.promise,
  } as unknown as ScrollViewModel
  fixture.session.render(first.viewModel)
  fixture.session.scheduleResourcePrewarm(
    [{ run, aliyahIndex: 1 }],
    'stale-resolver',
  )
  first.resolveScrolled()
  await flushMicrotasks()
  fixture.background.runNext()
  await flushMicrotasks()

  const second = fixture.addDisplay()
  fixture.session.render(second.viewModel)
  resolver.resolve({
    physicalLocationFromRef: () => ({ pageNumber: 99, lineNumber: 1 }),
  })
  await flushMicrotasks()

  expect(first.viewModel.fetchPageByPageNumber).not.toHaveBeenCalled()
  expect(fixture.effects.prewarmCueData).not.toHaveBeenCalled()
})

test('deactivation and teardown cancel owned work idempotently', async () => {
  const fixture = createFixture()
  const display = fixture.displays[0]
  fixture.session.render(display.viewModel)
  fixture.session.syncAudioPreload('/audio/current.mp3')
  fixture.session.scheduleResourcePrewarm(
    [{ run: createRun(), aliyahIndex: 1 }],
    'pending',
  )
  display.resolveScrolled()
  await flushMicrotasks()

  expect(fixture.frame.pendingCount()).toBe(1)
  expect(fixture.background.pendingCount()).toBe(1)

  fixture.session.deactivate()
  expect(fixture.events.slice(-3)).toEqual([
    'effect:display-deactivating',
    'display:1:destroy',
    'effect:reset-resources',
  ])
  expect(fixture.session.capture()).toBeNull()
  expect(fixture.background.pendingCount()).toBe(0)

  fixture.session.destroy()
  fixture.session.destroy()
  fixture.frame.runAll()

  expect(fixture.viewport.release).toHaveBeenCalledOnce()
  expect(fixture.viewport.destroy).toHaveBeenCalledOnce()
  expect(fixture.effects.present).not.toHaveBeenCalled()
})

test('records native User Timing entries only for an opted-in Reader session', () => {
  const entryNames = [
    'tikkun:reader:progress-anchor-rebuild',
    'tikkun:reader:presentation',
    'tikkun:reader:page-rendered',
    'tikkun:reader:page-evicted',
  ]
  const clearEntries = () => {
    for (const name of entryNames) {
      performance.clearMarks(name)
      performance.clearMeasures(name)
    }
  }
  const exercise = (search = '') => {
    const fixture = createFixture({ search })
    fixture.session.progressSnapshot()
    fixture.session.invalidatePresentation('reader-position')
    fixture.frame.runNext()
    fixture.session.pageRendered(createPageRoot(fixture.events, 1), () => {})
    fixture.session.pageEvicted(1)
    fixture.session.destroy()
  }

  clearEntries()
  exercise()
  expect(
    performance
      .getEntries()
      .filter(({ name }) => name.startsWith('tikkun:reader:')),
  ).toEqual([])

  exercise('?debugPerformance=1')
  expect(
    performance
      .getEntries()
      .filter(({ name }) => name.startsWith('tikkun:reader:'))
      .map(({ name }) => name),
  ).toEqual(expect.arrayContaining(entryNames))
  expect(
    performance.getEntriesByName('tikkun:reader:progress-anchor-rebuild'),
  ).toHaveLength(1)

  clearEntries()
})

function createFixture({ search = '' }: { search?: string } = {}) {
  const events: string[] = []
  const frame = createFrameHarness()
  const timer = createTimerHarness()
  const background = createBackgroundHarness()
  const root = createRoot(events)
  const viewport = createViewportHarness()
  const audio = {
    preload: '',
    src: '',
    pause: vi.fn(),
    removeAttribute: vi.fn(),
    load: vi.fn(),
  }
  const effects = {
    beforeDisplayReplacement: vi.fn(() =>
      events.push('effect:before-replacement'),
    ),
    resetDisplayResources: vi.fn(() => events.push('effect:reset-resources')),
    afterDisplayReplacementReset: vi.fn(() =>
      events.push('effect:after-reset'),
    ),
    displayCreated: vi.fn((display: ScrollDisplay) =>
      events.push(`effect:display-created:${fakeDisplay(display).id}`),
    ),
    displayDeactivating: vi.fn(() =>
      events.push('effect:display-deactivating'),
    ),
    resolveRun: vi.fn(() => null),
    getPlaybackProtectedPageNumbers: vi.fn(() => []),
    isPlaybackActive: vi.fn(() => false),
    prewarmCueData: vi.fn(async () => undefined),
    present: vi.fn(),
    reportError: vi.fn(),
  } satisfies ReaderDisplaySessionEffects
  const displays: FakeDisplay[] = []

  const addDisplay = () => {
    const display = new FakeDisplay(displays.length + 1, root, events)
    displays.push(display)
    return display
  }
  addDisplay()

  let nextDisplayIndex = 0
  const session = createReaderDisplaySession({
    document: {
      querySelector: () => null,
    } as unknown as Document,
    view: {
      location: { href: 'https://example.test/reader/' },
      performance,
    } as unknown as Window,
    root,
    search,
    frame,
    timer,
    background,
    effects,
    factories: {
      display: () => {
        const display = displays[nextDisplayIndex++]
        if (!display) throw new Error('Missing queued fake display')
        events.push(`factory:display:${display.id}`)
        return display as unknown as ScrollDisplay
      },
      viewport: () => viewport,
      audio: () => audio as unknown as HTMLAudioElement,
    },
  })

  return {
    session,
    effects,
    events,
    frame,
    timer,
    background,
    root,
    viewport,
    audio,
    displays,
    addDisplay,
  }
}

class FakeDisplay {
  viewModel: ScrollViewModel
  readonly rendered: Promise<HTMLElement>
  readonly scrolled: Promise<void>
  readonly knownPages = new Set<number>()
  mountedPages = [1, 2, 3]
  viewportPageNumber = 2
  private readonly scrolledDeferred = deferred<void>()

  constructor(
    readonly id: number,
    readonly root: HTMLElement,
    private readonly events: string[],
  ) {
    this.viewModel = createViewModel()
    this.rendered = Promise.resolve(root)
    this.scrolled = this.scrolledDeferred.promise
    this.mountedPages.forEach((pageNumber) => this.knownPages.add(pageNumber))
  }

  resolveScrolled() {
    this.scrolledDeferred.resolve()
  }

  destroy() {
    this.events.push(`display:${this.id}:destroy`)
  }

  getMountedPageNode() {
    return null
  }

  async ensurePageMounted(pageNumber: number) {
    this.knownPages.add(pageNumber)
    if (!this.mountedPages.includes(pageNumber))
      this.mountedPages.push(pageNumber)
    return null
  }

  async ensurePageMountedForNavigation(pageNumber: number) {
    return this.ensurePageMounted(pageNumber)
  }

  async ensureNextContentMounted() {
    return null
  }

  getMountedPageNumbers() {
    return [...this.mountedPages].sort((left, right) => left - right)
  }

  getViewportAnchorPageNumber() {
    return this.viewportPageNumber
  }

  evictPages(pageNumbers: number[]) {
    this.events.push(`display:${this.id}:evict:${pageNumbers.join(',')}`)
    const evicted = pageNumbers.filter((pageNumber) =>
      this.mountedPages.includes(pageNumber),
    )
    this.mountedPages = this.mountedPages.filter(
      (pageNumber) => !evicted.includes(pageNumber),
    )
    return evicted
  }

  getEvictedPageNumbersNearViewport() {
    return []
  }

  async ensureEvictedPagesMountedNearViewport() {
    return []
  }
}

function fakeDisplay(display: ScrollDisplay) {
  return display as unknown as FakeDisplay
}

function createViewModel(run?: LeiningRun) {
  return {
    relevantRuns: run ? [run] : [],
    resolver: Promise.resolve({
      physicalLocationFromRef: () => ({ pageNumber: 7, lineNumber: 1 }),
    }),
    fetchPageByPageNumber: vi.fn(async () => null),
  } as unknown as ScrollViewModel
}

function createRun() {
  const ref = { book: 'Genesis', chapter: 1, verse: 1 }
  return {
    id: 'run-1',
    aliyot: [{ index: 1, start: ref, end: ref }],
  } as unknown as LeiningRun
}

function createRoot(events: string[]) {
  const style = {} as CSSStyleDeclaration
  Object.defineProperty(style, 'visibility', {
    get: () => '',
    set: (value: string) => events.push(`root:visibility:${value}`),
  })
  return {
    style,
    clientHeight: 600,
    scrollTop: 0,
    ownerDocument: {
      defaultView: { performance: { now: () => 0 } },
    },
    setAttribute: (name: string) => {
      if (name === 'aria-busy') events.push('root:busy')
    },
    removeAttribute: (name: string) => {
      if (name === 'aria-busy') events.push('root:not-busy')
    },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0 }),
  } as unknown as HTMLElement
}

function createPageRoot(events: string[], pageNumber: number) {
  const page = {
    dataset: { pageNumber: String(pageNumber) },
  }
  const line = {
    dataset: { pageNumber: String(pageNumber), lineIndex: '0' },
    isConnected: true,
    closest: () => page,
  }
  const marker = {
    dataset: { runId: 'run-1', aliyahIndex: '1' },
    isConnected: true,
    closest: () => page,
  }
  return {
    querySelectorAll(selector: string) {
      if (selector.includes('data-class="line"')) {
        events.push('index:lines')
        return [line]
      }
      events.push('index:markers')
      return [marker]
    },
  } as unknown as ParentNode
}

function createFrameHarness(): ReaderPageWindowFrameAdapter & {
  pendingCount(): number
  requestCount(): number
  runNext(): void
  runAll(): void
} {
  let nextHandle = 1
  let totalRequests = 0
  const callbacks = new Map<number, (timestamp: number) => void>()
  return {
    request(callback) {
      totalRequests += 1
      const handle = nextHandle++
      callbacks.set(handle, callback)
      return handle
    },
    cancel(handle) {
      callbacks.delete(handle)
    },
    pendingCount: () => callbacks.size,
    requestCount: () => totalRequests,
    runNext() {
      const entry = callbacks.entries().next().value as
        | [number, (timestamp: number) => void]
        | undefined
      if (!entry) return
      callbacks.delete(entry[0])
      entry[1](0)
    },
    runAll() {
      while (callbacks.size) this.runNext()
    },
  }
}

function createTimerHarness(): ReaderPageWindowTimerAdapter {
  let nextHandle = 1
  const callbacks = new Map<number, () => void>()
  return {
    set(callback) {
      const handle = nextHandle++
      callbacks.set(handle, callback)
      return handle
    },
    clear(handle) {
      callbacks.delete(handle)
    },
  }
}

function createBackgroundHarness(): ReaderDisplayBackgroundTaskAdapter & {
  pendingCount(): number
  runNext(): void
} {
  let nextHandle = 1
  const callbacks = new Map<number, () => void>()
  const request = (callback: () => void) => {
    const handle = nextHandle++
    callbacks.set(handle, callback)
    return handle
  }
  return {
    request,
    delay: request,
    cancel(handle) {
      callbacks.delete(handle)
    },
    pendingCount: () => callbacks.size,
    runNext() {
      const entry = callbacks.entries().next().value as
        | [number, () => void]
        | undefined
      if (!entry) return
      callbacks.delete(entry[0])
      entry[1]()
    },
  }
}

function createViewportHarness() {
  const release = vi.fn()
  return {
    refresh: vi.fn(),
    destroy: vi.fn(),
    release,
    on: vi.fn(() => release),
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
