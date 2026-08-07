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
  expect(host.preparePicker).toHaveBeenCalledOnce()

  route.closePicker()

  expect(state.view).toBe('optional')
  expect(state.pickerOpen).toBe(false)
  expect(route.snapshot().pickerOpen).toBe(false)
  expect(document.body.textContent).toContain('Page Not Found')
  expect(document.querySelector('[data-target-id="parsha-picker-root"]')).toBeNull()
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
