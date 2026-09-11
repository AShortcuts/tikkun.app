import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { CalendarSettings } from '../calendar-settings.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import createParshaPicker from '../components/ParshaPicker.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { createMount } from '../lifecycle/mount.ts'
import type { ReaderShell, ReaderShellViewName } from './reader-shell.ts'
import {
  createReaderRoute,
  INITIAL_READER_TITLE,
  type ReaderRoute,
  type ReaderRouteHost,
  type ReaderRouteRendering,
  type ParshaPickerModule,
} from './reader-route.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const mountedRoutes: Array<() => void> = []

type ShellState = {
  view: ReaderShellViewName
  pickerOpen: boolean
  title: string
}

function installFixture() {
  document.body.innerHTML = `
    <section data-target-id="reader-shell">
      <div data-target-id="about-view"></div>
    </section>
  `
}

function setHash(hash = '') {
  if (window.location.hash === hash) return
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${hash}`
  )
}

function createShell() {
  const state: ShellState = {
    view: 'reader',
    pickerOpen: false,
    title: INITIAL_READER_TITLE,
  }
  const shell: ReaderShell = {
    setView: (view) => {
      state.view = view
    },
    setPickerOpen: (open) => {
      state.pickerOpen = open
    },
    setTitle: (title) => {
      state.title = title
    },
    setProgress: () => {},
    setAnnotationsEnabled: () => {},
    focusTitle: () => {},
    isReaderVisible: () => state.view === 'reader',
  }
  return { shell, state }
}

function createRendering(pageNode: HTMLElement | null = null): ReaderRouteRendering {
  return {
    ready: Promise.resolve(),
    complete: Promise.resolve(),
    isCurrent: () => true,
    getMountedPageNode: () => pageNode,
  }
}

function createHost(rendering = createRendering()) {
  const host: ReaderRouteHost = {
    renderReader: vi.fn(() => rendering),
    leaveReader: vi.fn(),
    openAbout: vi.fn(),
    readerRouteChanged: vi.fn(),
    readerReady: vi.fn(),
    preparePicker: vi.fn(),
    pickerChanged: vi.fn(),
    pickerLoadFailed: vi.fn(),
    captureReadingPosition: vi.fn(() => null),
    showReturnToPreviousReading: vi.fn(),
    dismissLastReadingPrompt: vi.fn(),
    saveReadingPosition: vi.fn(),
  }
  return host
}

function mountRoute({
  host = createHost(),
  calendarSettings = { israel: false },
  loadParshaPicker = async () => ({ default: createParshaPicker }),
  launch,
}: {
  host?: ReaderRouteHost
  calendarSettings?: CalendarSettings
  loadParshaPicker?: () => Promise<ParshaPickerModule>
  launch?: { resumeHash: string | null }
} = {}) {
  const { shell, state } = createShell()
  const mount = createMount()
  let route!: ReaderRoute
  const destroy = mount((scope) => {
    route = createReaderRoute(scope, {
      document,
      view: window,
      shell,
      host,
      createGenerator: () => new LeiningGenerator(testSettings),
      getCalendarSettings: () => calendarSettings,
      updateCalendarSettings: (settings) => {
        calendarSettings = settings
      },
      loadParshaPicker,
    })
  })
  mountedRoutes.push(destroy)
  const ready = route.start(launch)
  return { host, route, state, ready }
}

async function flushRouteWork() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  installFixture()
  setHash()
})

afterEach(() => {
  for (const destroy of mountedRoutes.splice(0)) destroy()
  setHash()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

test('canonicalizes hashless startup before completing the first reader render', async () => {
  const { host, route, state } = mountRoute()

  expect(window.location.hash).toBe('#/next')
  expect(route.snapshot().currentReaderHash).toBe('#/next')
  expect(state.view).toBe('reader')
  expect(host.renderReader).toHaveBeenCalledOnce()

  await flushRouteWork()

  expect(host.readerReady).toHaveBeenCalledOnce()
  expect(host.pickerChanged).not.toHaveBeenCalled()
})

test.each([
  '#/torah/parsha/beshalach/2-15-1',
  '#/r/2-15-1',
  '#/torah/page/242',
])('resumes a supplied reading on native hashless startup: %s', async (hash) => {
  const { ready, route, host } = mountRoute({ launch: { resumeHash: hash } })
  await ready
  expect(route.snapshot().currentReaderHash).toBe(hash)
  expect(window.location.hash).toBe(hash)
  expect(host.preparePicker).not.toHaveBeenCalled()
})

test.each([null, '#/not-a-reading'])('opens Reading Index when native resume is unavailable: %s', async (resumeHash) => {
  const { ready, route, host } = mountRoute({ launch: { resumeHash } })
  await ready
  expect(host.preparePicker).toHaveBeenCalledOnce()
  expect(route.snapshot().pickerOpen).toBe(true)
})

test('native resume never replaces an explicit reading link', async () => {
  const hash = '#/torah/parsha/beshalach/2-15-1'
  setHash(hash)
  const { ready, route, host } = mountRoute({ launch: { resumeHash: '#/torah/page/242' } })
  await ready
  expect(route.snapshot().currentReaderHash).toBe(hash)
  expect(host.preparePicker).not.toHaveBeenCalled()
})

test('sets the requested title before rendering and waits for positioning at startup', async () => {
  setHash('#/torah/parsha/beshalach/2-15-1')
  let finishPositioning!: () => void
  const complete = new Promise<void>((resolve) => { finishPositioning = resolve })
  const host = createHost({ ...createRendering(), complete })
  const { state, ready } = mountRoute({ host })
  let settled = false
  void ready.then(() => { settled = true })

  expect(state.title).toBe('בשלח')
  expect(host.renderReader).toHaveBeenCalledOnce()
  await flushRouteWork()
  expect(host.readerReady).toHaveBeenCalledOnce()
  expect(settled).toBe(false)

  finishPositioning()
  await ready
  expect(settled).toBe(true)
})

test('uses a neutral title for physical-page routes until the viewport resolves it', async () => {
  setHash('#/torah/page/242')
  const { state, ready } = mountRoute()
  expect(state.title).toBe('תיקון קוראים')
  await ready
})

test('rejects startup when the current reading cannot finish positioning', async () => {
  const failure = new Error('target positioning failed')
  let rejectPositioning!: (error: unknown) => void
  const complete = new Promise<void>((_resolve, reject) => {
    rejectPositioning = reject
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { ready } = mountRoute({ host: createHost({ ...createRendering(), complete }) })
  const rejection = expect(ready).rejects.toBe(failure)
  rejectPositioning(failure)
  await rejection
})

test('ignores a superseded startup failure and waits for the current reading', async () => {
  setHash('#/torah/parsha/beshalach/2-15-1')
  let rejectPrevious!: (error: unknown) => void
  let finishCurrent!: () => void
  const previous = createRendering()
  const current = createRendering()
  const host = createHost({
    ...previous,
    complete: new Promise<void>((_resolve, reject) => { rejectPrevious = reject }),
  })
  const { route, state, ready } = mountRoute({ host })
  vi.mocked(host.renderReader).mockReturnValue({
    ...current,
    complete: new Promise<void>((resolve) => { finishCurrent = resolve }),
  })
  route.navigate('#/torah/parsha/haazinu/5-32-1')
  await vi.waitFor(() => expect(host.renderReader).toHaveBeenCalledTimes(2))
  rejectPrevious(new Error('superseded load failed'))
  let settled = false
  void ready.then(() => { settled = true })
  await flushRouteWork()
  expect(settled).toBe(false)
  expect(state.title).toBe('האזינו')
  finishCurrent()
  await ready
})

test('finishes startup on the not-found screen without waiting for reader content', async () => {
  setHash('#/torah/page/9999')
  const { state, ready, host } = mountRoute()
  await ready
  expect(state.view).toBe('optional')
  expect(host.renderReader).not.toHaveBeenCalled()
})

test('keeps a picker opened during rendering until picker navigation begins', async () => {
  setHash('#/next')
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const host = createHost({
    ...createRendering(),
    ready,
  })
  const { route, state } = mountRoute({ host })

  route.togglePicker({ animate: true })
  await flushRouteWork()
  expect(state.pickerOpen).toBe(true)

  resolveReady()
  await flushRouteWork()
  expect(host.readerReady).toHaveBeenCalledOnce()
  expect(state.pickerOpen).toBe(true)

  route.navigate('#/next')
  expect(state.pickerOpen).toBe(false)
})

test('canonicalizes reader aliases without starting a second render', () => {
  setHash('#/torah/parsha/Bereshit')
  const { host, route } = mountRoute()

  expect(window.location.hash).toBe('#/torah/parsha/beresheet')
  expect(route.snapshot().currentReaderHash).toBe(
    '#/torah/parsha/beresheet'
  )
  expect(host.renderReader).toHaveBeenCalledOnce()
})

test('replaces the scrolled reading hash without rerendering or adding history', () => {
  setHash('#/torah/parsha/beresheet')
  const { host, route } = mountRoute()
  const historyLength = window.history.length

  expect(
    route.syncScrolledReading('#/torah/parsha/beresheet/1-2-4')
  ).toBe(true)

  expect(window.location.hash).toBe('#/torah/parsha/beresheet/1-2-4')
  expect(route.snapshot().currentReaderHash).toBe(
    '#/torah/parsha/beresheet/1-2-4'
  )
  expect(window.history.length).toBe(historyLength)
  expect(host.renderReader).toHaveBeenCalledOnce()
  expect(host.readerRouteChanged).not.toHaveBeenCalled()
  expect(
    route.syncScrolledReading('#/torah/parsha/beresheet/1-2-4')
  ).toBe(false)
})

test('keeps the public parsha route while adopting an internal run reference', () => {
  setHash('#/torah/parsha/haazinu/5-32-1')
  const { host, route } = mountRoute()
  const historyLength = window.history.length

  expect(
    route.syncScrolledReading(
      '#/run/2026-09-05:shacharis,main/5-31-28'
    )
  ).toBe(true)

  expect(window.location.hash).toBe('#/torah/parsha/haazinu/5-31-28')
  expect(route.snapshot().currentReaderHash).toBe(
    '#/torah/parsha/haazinu/5-31-28'
  )
  expect(window.history.length).toBe(historyLength)
  expect(host.renderReader).toHaveBeenCalledOnce()
  expect(host.readerRouteChanged).not.toHaveBeenCalled()
})

test('promotes scroll sync into a combined parsha route', () => {
  setHash('#/torah/parsha/ki-tavo/5-29-6')
  const { host, route } = mountRoute()
  const historyLength = window.history.length

  expect(
    route.syncScrolledReading(
      '#/torah/parsha/nitzavim-vayelech/5-29-9'
    )
  ).toBe(true)

  expect(window.location.hash).toBe(
    '#/torah/parsha/nitzavim-vayelech/5-29-9'
  )
  expect(route.snapshot().currentReaderHash).toBe(
    '#/torah/parsha/nitzavim-vayelech/5-29-9'
  )
  expect(window.history.length).toBe(historyLength)
  expect(host.renderReader).toHaveBeenCalledOnce()
})

test('ignores scroll hash synchronization outside the reader', () => {
  setHash('#/about/playback-analytics')
  const { route } = mountRoute()

  expect(
    route.syncScrolledReading('#/torah/parsha/beresheet/1-2-4')
  ).toBe(false)
  expect(window.location.hash).toBe('#/about/playback-analytics')
})

test('sends About to the public page without mutating the reader hash', async () => {
  setHash('#/next')
  const { host, route } = mountRoute()
  await flushRouteWork()

  route.toggleAbout()

  expect(window.location.hash).toBe('#/next')
  expect(host.openAbout).toHaveBeenCalledOnce()
  expect(host.leaveReader).not.toHaveBeenCalled()
  expect(host.renderReader).toHaveBeenCalledOnce()
})

test('opens and destroys the Parsha Picker from the not-found action', async () => {
  setHash('#/torah/page/999')
  const { host, route, state } = mountRoute()

  expect(state.view).toBe('optional')
  expect(document.body.textContent).toContain('Page Not Found')

  document
    .querySelector<HTMLButtonElement>('[data-target-id="open-reading-index"]')
    ?.click()
  await flushRouteWork()

  expect(state.view).toBe('reader')
  expect(state.pickerOpen).toBe(true)
  expect(route.snapshot().pickerOpen).toBe(true)
  expect(document.querySelector('[data-target-id="parsha-picker-root"]')).not.toBeNull()
  expect(document.querySelector('.parsha-picker.mod-animate-open')).not.toBeNull()
  expect(host.preparePicker).toHaveBeenCalledOnce()

  route.closePicker()

  expect(state.view).toBe('optional')
  expect(state.pickerOpen).toBe(false)
  expect(route.snapshot().pickerOpen).toBe(false)
  expect(document.body.textContent).toContain('Page Not Found')
  expect(document.querySelector('[data-target-id="parsha-picker-root"]')).toBeNull()
})

test('keeps shortcut TOC opening instant and opts pointer opening into motion', async () => {
  setHash('#/next')
  const pickerOptions: Array<Parameters<ParshaPickerModule['default']>[1]> = []
  const createPicker = vi.fn<ParshaPickerModule['default']>(
    (_generator, options) => {
      pickerOptions.push(options)
      return {
        node: document.createElement('div'),
        onMount: vi.fn(),
        focusSearch: vi.fn(),
        refreshSearch: vi.fn(),
        destroy: vi.fn(),
      }
    }
  )
  const { route } = mountRoute({
    loadParshaPicker: async () => ({ default: createPicker }),
  })
  await flushRouteWork()

  route.togglePicker()
  await vi.waitFor(() => expect(createPicker).toHaveBeenCalledTimes(1))
  expect(pickerOptions[0]?.animateOnOpen).toBe(false)

  route.closePicker()
  route.togglePicker({ animate: true })
  await vi.waitFor(() => expect(createPicker).toHaveBeenCalledTimes(2))
  expect(pickerOptions[1]?.animateOnOpen).toBe(true)
})

test('moves focus into the picker and restores the activating control', async () => {
  setHash('#/next')
  const opener = document.createElement('button')
  opener.textContent = 'Open reading index'
  document.body.appendChild(opener)
  opener.focus()

  const pickerNode = document.createElement('div')
  pickerNode.tabIndex = -1
  const focusSearch = vi.fn()
  const createPicker = vi.fn<ParshaPickerModule['default']>(() => ({
    node: pickerNode,
    onMount: vi.fn(),
    focusSearch,
    refreshSearch: vi.fn(),
    destroy: vi.fn(() => pickerNode.remove()),
  }))
  const { route } = mountRoute({
    loadParshaPicker: async () => ({ default: createPicker }),
  })
  await flushRouteWork()

  route.togglePicker()
  await flushRouteWork()
  expect(focusSearch).toHaveBeenCalledOnce()

  route.closePicker()
  expect(document.activeElement).toBe(opener)
})

test('focuses the picker region without opening a soft keyboard for pointer opens', async () => {
  setHash('#/next')
  const pickerNode = document.createElement('div')
  pickerNode.tabIndex = -1
  const focusSearch = vi.fn()
  const createPicker = vi.fn<ParshaPickerModule['default']>(() => ({
    node: pickerNode,
    onMount: vi.fn(),
    focusSearch,
    refreshSearch: vi.fn(),
    destroy: vi.fn(() => pickerNode.remove()),
  }))
  const { route } = mountRoute({
    loadParshaPicker: async () => ({ default: createPicker }),
  })
  await flushRouteWork()

  route.togglePicker({ animate: true })
  await flushRouteWork()

  expect(focusSearch).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(pickerNode)
})

test('upgrades a loading pointer-open picker to focus search on Cmd-K intent', async () => {
  setHash('#/next')
  let resolvePicker!: (module: ParshaPickerModule) => void
  const focusSearch = vi.fn()
  const pickerNode = document.createElement('div')
  pickerNode.tabIndex = -1
  const { route } = mountRoute({
    loadParshaPicker: () =>
      new Promise<ParshaPickerModule>((resolve) => {
        resolvePicker = resolve
      }),
  })
  await flushRouteWork()

  route.togglePicker({ animate: true })
  expect(route.focusPickerSearch()).toBe(true)
  resolvePicker({
    default: () => ({
      node: pickerNode,
      onMount: vi.fn(),
      focusSearch,
      refreshSearch: vi.fn(),
      destroy: vi.fn(),
    }),
  })
  await flushRouteWork()

  expect(focusSearch).toHaveBeenCalledOnce()
  expect(document.activeElement).not.toBe(pickerNode)
})

test('closing while the Parsha Picker module loads cancels the pending mount', async () => {
  setHash('#/torah/page/999')
  let resolvePicker!: (module: ParshaPickerModule) => void
  const loadParshaPicker = vi.fn(
    () =>
      new Promise<ParshaPickerModule>((resolve) => {
        resolvePicker = resolve
      })
  )
  const { route, state } = mountRoute({ loadParshaPicker })

  document
    .querySelector<HTMLButtonElement>('[data-target-id="open-reading-index"]')
    ?.click()
  expect(route.snapshot().pickerOpen).toBe(true)
  expect(state.view).toBe('optional')
  expect(state.pickerOpen).toBe(false)

  route.closePicker()
  resolvePicker({ default: createParshaPicker })
  await flushRouteWork()

  expect(state.view).toBe('optional')
  expect(route.snapshot().pickerOpen).toBe(false)
  expect(document.querySelector('[data-target-id="parsha-picker-root"]')).toBeNull()
})

test('reports Parsha Picker load failures and restores the not-found page', async () => {
  setHash('#/torah/page/999')
  const failure = new Error('picker unavailable')
  const host = createHost()
  const { route, state } = mountRoute({
    host,
    loadParshaPicker: () => Promise.reject(failure),
  })

  document
    .querySelector<HTMLButtonElement>('[data-target-id="open-reading-index"]')
    ?.click()
  await flushRouteWork()

  expect(state.view).toBe('optional')
  expect(route.snapshot().pickerOpen).toBe(false)
  expect(host.pickerLoadFailed).toHaveBeenCalledWith(failure)
  expect(document.body.textContent).toContain('Page Not Found')
})

test('retries the Parsha Picker after a load failure', async () => {
  setHash('#/torah/page/999')
  const failure = new Error('picker unavailable')
  const loadParshaPicker = vi
    .fn<() => Promise<ParshaPickerModule>>()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({ default: createParshaPicker })
  const host = createHost()
  const { route, state } = mountRoute({ host, loadParshaPicker })

  const openPicker = () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-target-id="open-reading-index"]'
      )
      ?.click()

  openPicker()
  await flushRouteWork()
  expect(host.pickerLoadFailed).toHaveBeenCalledWith(failure)
  expect(state.view).toBe('optional')

  openPicker()
  await flushRouteWork()

  expect(loadParshaPicker).toHaveBeenCalledTimes(2)
  expect(state.view).toBe('reader')
  expect(state.pickerOpen).toBe(true)
  expect(route.snapshot().pickerOpen).toBe(true)
})

test('rebuilds the Parsha Picker after calendar settings change', async () => {
  setHash('#/torah/page/999')
  const destroyed: Array<ReturnType<typeof vi.fn>> = []
  const pickerOptions: Array<Parameters<ParshaPickerModule['default']>[1]> = []
  const createPicker = vi.fn<ParshaPickerModule['default']>(
    (_generator, options) => {
      const destroy = vi.fn()
      const node = document.createElement('div')
      destroyed.push(destroy)
      pickerOptions.push(options)
      return {
        node,
        onMount: vi.fn(),
        focusSearch: vi.fn(),
        refreshSearch: vi.fn(),
        destroy,
      }
    }
  )
  const { route } = mountRoute({
    loadParshaPicker: async () => ({ default: createPicker }),
  })

  document
    .querySelector<HTMLButtonElement>('[data-target-id="open-reading-index"]')
    ?.click()
  await flushRouteWork()
  pickerOptions[0]?.onCalendarSettingsChange({ israel: true })
  await flushRouteWork()

  expect(createPicker).toHaveBeenCalledTimes(2)
  expect(destroyed[0]).toHaveBeenCalledOnce()
  expect(pickerOptions[1]?.calendarSettings).toEqual({ israel: true })
  expect(route.snapshot().pickerOpen).toBe(true)
})

test('focuses and refreshes the embedded search only while its picker is active', async () => {
  setHash('#/torah/page/999')
  const focusSearch = vi.fn()
  const refreshSearch = vi.fn()
  const createPicker = vi.fn<ParshaPickerModule['default']>(() => ({
    node: document.createElement('div'),
    onMount: vi.fn(),
    focusSearch,
    refreshSearch,
    destroy: vi.fn(),
  }))
  const { route } = mountRoute({
    loadParshaPicker: async () => ({ default: createPicker }),
  })

  expect(route.focusPickerSearch()).toBe(false)
  document
    .querySelector<HTMLButtonElement>('[data-target-id="open-reading-index"]')
    ?.click()
  await flushRouteWork()

  expect(route.focusPickerSearch()).toBe(true)
  expect(focusSearch).toHaveBeenCalledOnce()
  route.refreshPickerSearch()
  expect(refreshSearch).toHaveBeenCalledOnce()

  route.closePicker()
  expect(route.focusPickerSearch()).toBe(false)
})

test('rerenders the same hash and saves only after that render completes', async () => {
  setHash('#/next')
  const { host, route } = mountRoute()
  await flushRouteWork()
  vi.mocked(host.saveReadingPosition).mockClear()

  route.navigate('#/next', { saveReadingAfterRender: true })
  await flushRouteWork()

  expect(host.renderReader).toHaveBeenCalledTimes(2)
  expect(host.readerRouteChanged).not.toHaveBeenCalled()
  expect(host.dismissLastReadingPrompt).toHaveBeenCalledOnce()
  expect(host.saveReadingPosition).toHaveBeenCalledOnce()
})

test('offers a return to the previous reading after picker navigation', async () => {
  setHash('#/torah/parsha/beresheet')
  const previousReading = {
    hash: '#/torah/parsha/beresheet/1-1-1',
    parshaName: 'Beresheet',
    aliyahLabel: 'Aliyah 1',
    savedAt: Date.now(),
  }
  const host = createHost()
  vi.mocked(host.captureReadingPosition).mockReturnValue(previousReading)
  const pickerOptions: Array<Parameters<ParshaPickerModule['default']>[1]> = []
  const createPicker = vi.fn<ParshaPickerModule['default']>(
    (_generator, options) => {
      pickerOptions.push(options)
      const node = document.createElement('div')
      return {
        node,
        onMount: vi.fn(),
        focusSearch: vi.fn(),
        refreshSearch: vi.fn(),
        destroy: vi.fn(() => node.remove()),
      }
    }
  )
  const { route } = mountRoute({
    host,
    loadParshaPicker: async () => ({ default: createPicker }),
  })
  await flushRouteWork()

  route.togglePicker()
  await vi.waitFor(() => expect(createPicker).toHaveBeenCalledOnce())
  pickerOptions[0]?.navigate('#/torah/parsha/noach')
  await vi.waitFor(() =>
    expect(window.location.hash).toBe('#/torah/parsha/noach')
  )
  await vi.waitFor(() =>
    expect(host.showReturnToPreviousReading).toHaveBeenCalledWith(
      previousReading
    )
  )

  expect(host.captureReadingPosition).toHaveBeenCalledOnce()
  expect(host.dismissLastReadingPrompt).toHaveBeenCalledOnce()
  expect(host.saveReadingPosition).toHaveBeenCalledOnce()
})

test('reveals the absolute page number after a direct page route renders', async () => {
  setHash('#/torah/page/12')
  const pageNode = document.createElement('div')
  const marker = document.createElement('span')
  marker.className = 'tikkun-page-number'
  pageNode.append(marker)
  const host = createHost(createRendering(pageNode))

  mountRoute({ host })
  await flushRouteWork()

  expect(marker.classList.contains('mod-route-reveal')).toBe(true)
})
