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
    dismissLastReadingPrompt: vi.fn(),
    saveReadingPosition: vi.fn(),
  }
  return host
}

function mountRoute({
  host = createHost(),
  calendarSettings = { israel: false },
  loadParshaPicker = async () => ({ default: createParshaPicker }),
}: {
  host?: ReaderRouteHost
  calendarSettings?: CalendarSettings
  loadParshaPicker?: () => Promise<ParshaPickerModule>
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
  route.start()
  return { host, route, state }
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
  expect(host.pickerChanged).toHaveBeenCalledWith(false)
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
