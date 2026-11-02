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

test('swipe preview leaves the reader visible until committed and closes without changing the reading', async () => {
  const { route, state, host, ready } = mountRoute()
  await ready
  const hash = window.location.hash
  const canceled = await route.preparePickerSwipe()
  expect(canceled).not.toBeNull()
  expect(canceled!.element.inert).toBe(true)
  expect(state.pickerOpen).toBe(false)
  canceled!.cancel()
  expect(route.snapshot().pickerOpen).toBe(false)
  expect(window.location.hash).toBe(hash)

  const committed = await route.preparePickerSwipe()
  expect(committed).not.toBeNull()
  committed!.commit()
  expect(state.pickerOpen).toBe(true)
  expect(committed!.element.inert).toBe(false)
  expect(committed!.element.hasAttribute('aria-hidden')).toBe(false)
  expect(document.activeElement).toBe(committed!.element)
  expect(host.openAbout).not.toHaveBeenCalled()
  route.closePicker()
  expect(window.location.hash).toBe(hash)
})

test('shows arrival only after route positioning and does not replay on scroll checkpoints', async () => {
  const page = document.createElement('section')
  page.className = 'tikkun-page'
  page.innerHTML = '<div class="reader-text-side"><div class="line"><span class="word" data-token-key="1:7:0:0">ויאמר</span> <span class="word" data-token-key="1:7:0:1">אלהים</span></div></div>'
  document.querySelector('[data-target-id="reader-shell"]')!.append(page)
  let settle!: () => void
  const rendering = createRendering(page)
  const host = createHost({
    ...rendering,
    ready: Promise.resolve(page.querySelector('.line')),
    complete: new Promise<void>(resolve => { settle = resolve }),
  })
  const { route, ready } = mountRoute({ host })
  await flushRouteWork()
  expect(page.querySelector('.reader-arrival-cue')).toBeNull()
  settle()
  await ready
  const cue = page.querySelector('.reader-arrival-cue')
  expect(cue).not.toBeNull()
  route.syncScrolledReading('#/torah/parsha/beresheet/1-1-6')
  expect(page.querySelector('.reader-arrival-cue')).toBe(cue)
  route.navigate('#/about')
  await vi.waitFor(() => expect(page.querySelector('.reader-arrival-cue')).toBeNull())
})

beforeEach(() => {
  installFixture()
  setHash()
})

afterEach(() => {
  for (const destroy of mountedRoutes.splice(0)) destroy()
  setHash()
  document.body.replaceChildren()
  document.head.querySelector('meta[name="apple-itunes-app"]')?.remove()
  vi.restoreAllMocks()
})

test('rapid requests render only the latest destination and resolve only its readiness', async () => {
  setHash('#/torah/parsha/beresheet')
  const { host, route, ready } = mountRoute()
  await ready
  vi.mocked(host.renderReader).mockClear()
  const previous = route.navigateAndWait('#/torah/parsha/noach')
  const latest = route.navigateAndWait('#/torah/parsha/beshalach')
  expect(await previous).toBe(false)
  expect(await latest).toBe(true)
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(host.renderReader).toHaveBeenCalledOnce()
  expect(route.snapshot().currentReaderHash).toBe('#/torah/parsha/beshalach')
})

test.each(['#/torah/parsha/beshalach/2-15-1'])('resumes a supplied reading on native hashless startup: %s', async (hash) => {
  const { ready, route, host } = mountRoute({ launch: { resumeHash: hash } })
  await ready
  expect(route.snapshot().currentReaderHash).toBe(hash)
  expect(window.location.hash).toBe(hash)
  expect(host.preparePicker).not.toHaveBeenCalled()
})

test('native resume never replaces an explicit reading link', async () => {
  const hash = '#/torah/parsha/beshalach/2-15-1'
  setHash(hash)
  const { ready, route, host } = mountRoute({ launch: { resumeHash: '#/torah/page/242' } })
  await ready
  expect(route.snapshot().currentReaderHash).toBe(hash)
  expect(host.preparePicker).not.toHaveBeenCalled()
})

test('finishes startup on the not-found screen without waiting for reader content', async () => {
  setHash('#/torah/page/9999')
  const { state, ready, host } = mountRoute()
  await ready
  expect(state.view).toBe('optional')
  expect(host.renderReader).not.toHaveBeenCalled()
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

test('offers a return to the previous reading after picker navigation', async () => {
  setHash('#/torah/parsha/beresheet')
  const previousReading = {
    hash: '#/torah/parsha/beresheet/1-1-1',
    parshaName: 'Beresheet',
    aliyahLabel: 'Aliyah 1',
    savedAt: Date.now(),
  }
  const host = createHost()
  vi.mocked(host.captureReadingPosition)
    .mockReturnValueOnce(previousReading)
    .mockReturnValue({ ...previousReading, hash: '#/torah/parsha/noach/1-6-9', parshaName: 'Noach' })
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

  // Once before leaving, once to confirm the reader landed somewhere else.
  expect(host.captureReadingPosition).toHaveBeenCalledTimes(2)
  expect(host.dismissLastReadingPrompt).toHaveBeenCalledOnce()
  expect(host.saveReadingPosition).toHaveBeenCalledOnce()
})
