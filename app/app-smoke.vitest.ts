import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import {
  CUE_AUTHORING_PANEL_OPEN_KEY,
  CUE_AUTHORING_UNLOCKED_KEY,
} from './admin/access.ts'
import { CALENDAR_SETTINGS_STORAGE_KEY } from './calendar-settings.ts'
import { BOOKMARKS_STORAGE_KEY } from './reader/bookmarks.ts'
import { LAST_READING_STORAGE_KEY } from './reading/last-reading.ts'

const READER_PREFERENCES_STORAGE_KEY = 'tikkun.reader-preferences'
const CORRUPTED_BOOT_STORAGE_KEYS = [
  READER_PREFERENCES_STORAGE_KEY,
  CALENDAR_SETTINGS_STORAGE_KEY,
  BOOKMARKS_STORAGE_KEY,
  LAST_READING_STORAGE_KEY,
] as const
const HASH_ROUTE_BOOT_STORAGE_KEYS = [
  READER_PREFERENCES_STORAGE_KEY,
  CALENDAR_SETTINGS_STORAGE_KEY,
  BOOKMARKS_STORAGE_KEY,
] as const

let frame: HTMLIFrameElement | null = null
let auxiliaryFrames: HTMLIFrameElement[] = []
let frameErrorCapture: FrameErrorCapture | null = null
let persistedStorageSnapshot: Map<string, string> | null = null

afterEach(() => {
  frameErrorCapture?.restore()
  frameErrorCapture = null
  const frameWindow = frame?.contentWindow
  frameWindow?.sessionStorage.removeItem(CUE_AUTHORING_UNLOCKED_KEY)
  frameWindow?.sessionStorage.removeItem(CUE_AUTHORING_PANEL_OPEN_KEY)
  frame?.remove()
  frame = null
  for (const auxiliaryFrame of auxiliaryFrames) auxiliaryFrame.remove()
  auxiliaryFrames = []
  if (persistedStorageSnapshot) {
    restoreStoragePrefixes(localStorage, persistedStorageSnapshot)
    persistedStorageSnapshot = null
  }
})

test('boots the real app and keeps core routes and lazy tools working', async () => {
  frame = document.createElement('iframe')
  frame.title = 'Tikkun application smoke test'
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src = `/reader/?app-smoke=${Date.now()}#/torah/parsha/beresheet`
  document.body.appendChild(frame)

  await vi.waitFor(
    () => {
      const harnessError = frame?.contentDocument?.querySelector(
        '[data-app-smoke-error]'
      )
      if (harnessError) throw new Error(harnessError.textContent ?? '')
      expect(
        frame?.contentDocument?.querySelector('[data-target-id="app-root"]')
      ).not.toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )

  const frameWindow = requiredFrameWindow(frame)
  const frameDocument = requiredFrameDocument(frame)
  frameErrorCapture = captureFrameErrors(frameWindow)
  const frameErrors = frameErrorCapture.errors

  try {
    await vi.waitFor(
      () => {
        expect(frameWindow.location.hash).toBe('#/torah/parsha/beresheet')
        expect(
          frameDocument.querySelector(
            '[data-target-id="tikkun-book"] [data-page-number]'
          )
        ).not.toBeNull()
        expect(
          frameDocument.querySelector('[data-target-id="parsha-title"]')
            ?.textContent
        ).toContain('בראשית')
      },
      { timeout: 15_000, interval: 50 }
    )
  } catch (error) {
    const cause = error instanceof Error ? error.stack : String(error)
    throw new Error(
      `${describeStartupFailure(frameWindow, frameDocument, frameErrors)}\n${cause}`
    )
  }

  click(frameDocument, '[data-target-id="parsha-title"]')
  await vi.waitFor(
    () =>
      expect(
        frameDocument.querySelector('[data-target-id="parsha-picker-root"]')
      ).not.toBeNull(),
    { timeout: 10_000, interval: 50 }
  )
  const embeddedSearch = frameDocument.querySelector<HTMLInputElement>(
    '[data-search-presentation="embedded"] [data-target-id="reader-search-input"]'
  )
  expect(embeddedSearch).not.toBeNull()
  expect(frameDocument.activeElement).toBe(
    frameDocument.querySelector('[data-target-id="parsha-picker-root"]')
  )
  expect(frameDocument.activeElement).not.toBe(embeddedSearch)
  expect(embeddedSearch?.getAttribute('aria-expanded')).toBe('false')
  expect(
    frameDocument.querySelector(
      '[data-search-presentation="embedded"] [data-target-id="reader-search-results"]'
    )
  ).toBeNull()
  const calendarSettings =
    frameDocument.querySelector<HTMLElement>('.calendar-settings')
  if (!calendarSettings) throw new Error('Expected TOC calendar settings')
  const calendarSettingsTop = calendarSettings.getBoundingClientRect().top
  expect(
    frameDocument.querySelector('[data-target-id="command-palette-open"]')
  ).toBeNull()
  frameDocument.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    })
  )
  expect(frameDocument.activeElement).toBe(embeddedSearch)
  expect(embeddedSearch?.getAttribute('aria-expanded')).toBe('true')
  const embeddedResults = frameDocument.querySelector<HTMLElement>(
    '[data-search-presentation="embedded"] [data-target-id="reader-search-results"]'
  )
  expect(embeddedResults).not.toBeNull()
  expect(frameWindow.getComputedStyle(embeddedResults!).position).toBe(
    'absolute'
  )
  embeddedSearch!.value = 'בראשית'
  embeddedSearch!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await vi.waitFor(
    () => {
      const result = frameDocument.querySelector<HTMLAnchorElement>(
        '[data-search-presentation="embedded"] [role="option"][href="#/torah/parsha/beresheet"]'
      )
      expect(result).not.toBeNull()
      expect(result?.textContent).toContain('בראשית')
    },
    { timeout: 5_000, interval: 50 }
  )
  embeddedSearch!.value = ''
  embeddedSearch!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  expect(calendarSettings.getBoundingClientRect().top).toBeCloseTo(
    calendarSettingsTop,
    1
  )
  expect(
    frameDocument
      .querySelector<HTMLElement>('[data-target-id="command-palette"]')
      ?.classList.contains('u-hidden') ?? true
  ).toBe(true)
  embeddedSearch?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  )
  await vi.waitFor(
    () =>
      expect(
        frameDocument.querySelector('[data-target-id="parsha-picker-root"]')
      ).toBeNull(),
    { timeout: 5_000, interval: 50 }
  )

  frameDocument.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    })
  )
  await vi.waitFor(
    () => {
      const overlay = frameDocument.querySelector<HTMLElement>(
        '[data-target-id="command-palette"]'
      )
      const overlaySearch = frameDocument.querySelector<HTMLInputElement>(
        '[data-search-presentation="overlay"] [data-target-id="reader-search-input"]'
      )
      expect(overlay?.classList.contains('u-hidden')).toBe(false)
      expect(frameDocument.activeElement).toBe(overlaySearch)
    },
    { timeout: 10_000, interval: 50 }
  )
  const overlaySearch = frameDocument.querySelector<HTMLInputElement>(
    '[data-search-presentation="overlay"] [data-target-id="reader-search-input"]'
  )
  if (!overlaySearch) throw new Error('Expected the overlay search input')
  overlaySearch.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  )
  expect(
    frameDocument
      .querySelector<HTMLElement>('[data-target-id="command-palette"]')
      ?.classList.contains('u-hidden')
  ).toBe(true)

  click(frameDocument, '[data-target-id="settings-toggle"]')
  await vi.waitFor(
    () => {
      const settings = frameDocument.querySelector<HTMLElement>(
        '[data-target-id="settings-pane"]'
      )
      expect(settings).not.toBeNull()
      expect(settings?.classList.contains('u-hidden')).toBe(false)
    },
    { timeout: 10_000, interval: 50 }
  )
  frameDocument.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )

  frameWindow.sessionStorage.removeItem(CUE_AUTHORING_UNLOCKED_KEY)
  frameWindow.sessionStorage.removeItem(CUE_AUTHORING_PANEL_OPEN_KEY)
  frameDocument.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    })
  )
  await vi.waitFor(
    () => {
      const dialog = frameDocument.querySelector<HTMLElement>(
        '[data-target-id="admin-access-dialog"]'
      )
      const password = frameDocument.querySelector<HTMLInputElement>(
        '[data-target-id="admin-access-password"]'
      )
      expect(dialog).not.toBeNull()
      expect(dialog?.classList.contains('u-hidden')).toBe(false)
      expect(frameDocument.activeElement).toBe(password)
    },
    { timeout: 10_000, interval: 50 }
  )
  const password = frameDocument.querySelector<HTMLInputElement>(
    '[data-target-id="admin-access-password"]'
  )
  if (!password)
    throw new Error('Admin access dialog requires its password input')
  password.value = 'admin'
  password.dispatchEvent(new InputEvent('input', { bubbles: true }))
  click(frameDocument, '[data-target-id="admin-access-submit"]')
  await vi.waitFor(
    () => {
      const panel = frameDocument.querySelector<HTMLElement>(
        '[data-target-id="admin-panel"]'
      )
      expect(panel).not.toBeNull()
      expect(panel?.classList.contains('u-hidden')).toBe(false)
      expect(
        frameDocument
          .querySelector<HTMLElement>('[data-target-id="admin-access-dialog"]')
          ?.classList.contains('u-hidden')
      ).toBe(true)
      expect(
        frameWindow.sessionStorage.getItem(CUE_AUTHORING_UNLOCKED_KEY)
      ).toBe('1')
    },
    { timeout: 10_000, interval: 50 }
  )

  frameWindow.location.hash = '#/torah/parsha/vayetzei/1-29-18'
  await vi.waitFor(
    () => {
      expect(frameWindow.location.hash).toBe('#/torah/parsha/vayetzei/1-29-18')
      expect(
        frameDocument.querySelector('[data-target-id="parsha-title"]')
          ?.textContent
      ).toContain('ויצא')
      expect(
        frameDocument.querySelector(
          '.aliyah-audio-button[data-aliyah-index="3"]'
        )
      ).not.toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )

  const appFrame = page.frameLocator(
    page.getByTitle('Tikkun application smoke test')
  )
  const aliyahTable = appFrame.getByRole('table', { name: '32', exact: true })
  await aliyahTable
    .getByRole('button', { name: 'Play שלישי', exact: true })
    .click()
  await vi.waitFor(
    () => {
      expect(
        frameDocument.querySelector('[data-target-id="admin-cue-count"]')
          ?.textContent
      ).toBe('334 / 334 Words - 334')
      expect(
        frameDocument.querySelectorAll('[data-admin-cue-index]')
      ).toHaveLength(334)
      expect(
        frameDocument.querySelector<HTMLElement>(
          '[data-target-id="admin-resume-wrap"]'
        )?.hidden
      ).toBe(true)
      expect(
        frameDocument.querySelector('[data-target-id="admin-status"]')
          ?.textContent
      ).toContain('all 334 Words are timed')
      expect(
        frameDocument.querySelector('[data-admin-problem="published-cue-data"]')
      ).toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )

  const audio = frameDocument.querySelector<HTMLAudioElement>(
    '[data-target-id="reader-audio"]'
  )
  if (!audio) throw new Error('Application smoke test requires reader audio')
  await vi.waitFor(
    () => {
      expect(audio.paused).toBe(false)
      expect(audio.currentTime).toBeGreaterThan(0)
      expect(
        frameDocument
          .querySelector('[data-target-id="floating-play"]')
          ?.getAttribute('aria-label')
      ).toBe('Pause')
    },
    { timeout: 10_000, interval: 50 }
  )
  const firstHighlightedToken = await waitForHighlightedToken(frameDocument)
  await vi.waitFor(
    () => {
      const nextHighlightedToken = activeHighlightedToken(frameDocument)
      expect(nextHighlightedToken).not.toBeNull()
      expect(nextHighlightedToken).not.toBe(firstHighlightedToken)
    },
    { timeout: 6_000, interval: 50 }
  )

  await aliyahTable
    .getByRole('button', { name: 'Pause שלישי', exact: true })
    .click()
  await vi.waitFor(
    () => {
      expect(audio.paused).toBe(true)
      expect(
        frameDocument
          .querySelector('[data-target-id="floating-play"]')
          ?.getAttribute('aria-label')
      ).toBe('Play')
    },
    { timeout: 5_000, interval: 50 }
  )

  frame.style.width = '390px'
  const seek = frameDocument.querySelector<HTMLInputElement>(
    '[data-target-id="mobile-player-seek"]'
  )
  if (!seek) throw new Error('Application smoke test requires audio seek')
  await vi.waitFor(
    () => {
      expect(frameWindow.getComputedStyle(seek).display).not.toBe('none')
      expect(seek.disabled).toBe(false)
      expect(Number.isFinite(audio.duration)).toBe(true)
    },
    { timeout: 5_000, interval: 50 }
  )
  const seekTarget = audio.duration / 2
  await appFrame.getByRole('slider', { name: 'Audio position' }).fill('500')
  await vi.waitFor(
    () => {
      expect(audio.currentTime).toBeCloseTo(seekTarget, 0)
      expect(seek.value).toBe('500')
      expect(audio.paused).toBe(true)
    },
    { timeout: 5_000, interval: 50 }
  )

  expect(frameErrors, 'Unexpected errors from the application frame').toEqual(
    []
  )
}, 40_000)

test('offers the previous reading after mobile Library navigation', async () => {
  persistedStorageSnapshot = snapshotStoragePrefixes(
    localStorage,
    CORRUPTED_BOOT_STORAGE_KEYS
  )
  localStorage.removeItem(LAST_READING_STORAGE_KEY)

  frame = document.createElement('iframe')
  frame.title = 'Tikkun mobile Library return smoke test'
  frame.style.width = '390px'
  frame.style.height = '844px'
  frame.src = `/reader/?library-return-smoke=${Date.now()}#/torah/parsha/beresheet`
  document.body.appendChild(frame)

  await vi.waitFor(
    () => {
      const document = requiredFrameDocument(frame!)
      expect(
        document
          .querySelector('[data-target-id="app-root"]')
          ?.getAttribute('data-reader-boot-state')
      ).toBe('ready')
      expect(
        document.querySelector('[data-target-id="parsha-title"]')?.textContent
      ).toContain('בראשית')
    },
    { timeout: 15_000, interval: 50 }
  )

  const frameWindow = requiredFrameWindow(frame)
  const frameDocument = requiredFrameDocument(frame)
  frameErrorCapture = captureFrameErrors(frameWindow)

  click(frameDocument, '[data-target-id="parsha-title"]')
  await vi.waitFor(
    () =>
      expect(
        frameDocument.querySelector('[data-mobile-book="1"]')
      ).not.toBeNull(),
    { timeout: 10_000, interval: 50 }
  )
  click(frameDocument, '[data-mobile-book="1"]')
  click(
    frameDocument,
    '.mobile-parsha-card-row > a[href="#/torah/parsha/noach"]'
  )

  await vi.waitFor(
    () => {
      expect(frameWindow.location.hash).toBe('#/torah/parsha/noach')
      expect(
        frameDocument
          .querySelector('[data-target-id="last-reading-prompt"]')
          ?.classList.contains('u-hidden')
      ).toBe(false)
      expect(
        frameDocument.querySelector('[data-target-id="last-reading-copy"]')
          ?.textContent
      ).toContain('Return to')
      expect(
        frameDocument.querySelector('[data-target-id="last-reading-resume"]')
          ?.textContent
      ).toBe('Return')
    },
    { timeout: 15_000, interval: 50 }
  )

  click(frameDocument, '[data-target-id="last-reading-resume"]')
  await vi.waitFor(
    () => {
      expect(frameWindow.location.hash).toContain(
        '#/torah/parsha/beresheet/'
      )
      expect(
        frameDocument.querySelector('[data-target-id="parsha-title"]')?.textContent
      ).toContain('בראשית')
      expect(
        frameDocument
          .querySelector('[data-target-id="last-reading-prompt"]')
          ?.classList.contains('u-hidden')
      ).toBe(true)
    },
    { timeout: 15_000, interval: 50 }
  )

  expect(
    frameErrorCapture.errors,
    'Unexpected errors from the mobile Library return journey'
  ).toEqual([])
}, 40_000)

test('survives corrupt state and preserves bookmark and resume journeys', async () => {
  persistedStorageSnapshot = snapshotStoragePrefixes(
    localStorage,
    CORRUPTED_BOOT_STORAGE_KEYS
  )
  for (const key of CORRUPTED_BOOT_STORAGE_KEYS) {
    localStorage.setItem(key, '{not-json')
  }

  frame = document.createElement('iframe')
  frame.title = 'Tikkun corrupted storage smoke test'
  frame.style.width = '390px'
  frame.style.height = '844px'
  frame.src = `/reader/?corrupted-storage-smoke=${Date.now()}#/torah/parsha/beresheet`
  document.body.appendChild(frame)

  await vi.waitFor(
    () => {
      const document = requiredFrameDocument(frame!)
      expect(
        document
          .querySelector('[data-target-id="app-root"]')
          ?.getAttribute('data-reader-boot-state')
      ).toBe('ready')
      expect(
        document.querySelector(
          '[data-target-id="tikkun-book"] [data-page-number]'
        )
      ).not.toBeNull()
      expect(document.querySelector('vite-error-overlay')).toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )

  for (const key of HASH_ROUTE_BOOT_STORAGE_KEYS) {
    expect(localStorage.getItem(key)).toBe('{not-json')
  }

  const frameDocument = requiredFrameDocument(frame)
  const bookmarkButton = frameDocument.querySelector<HTMLButtonElement>(
    '[data-target-id="bookmark-current"]'
  )
  if (!bookmarkButton) throw new Error('Reader bookmark control is missing')
  await vi.waitFor(() => expect(bookmarkButton.disabled).toBe(false), {
    timeout: 5_000,
    interval: 50,
  })
  bookmarkButton.click()
  await vi.waitFor(
    () => {
      expect(bookmarkButton.getAttribute('aria-pressed')).toBe('true')
      expect(localStorage.getItem(BOOKMARKS_STORAGE_KEY)).not.toBeNull()
    },
    { timeout: 5_000, interval: 50 }
  )

  const book = frameDocument.querySelector<HTMLElement>(
    '[data-target-id="tikkun-book"]'
  )
  if (!book) throw new Error('Reader scroll surface is missing')
  book.dispatchEvent(new WheelEvent('wheel', { deltaY: 480, bubbles: true }))
  book.scrollTop = Math.min(
    Math.max(480, book.scrollTop + 480),
    Math.max(0, book.scrollHeight - book.clientHeight)
  )
  book.dispatchEvent(new Event('scroll', { bubbles: true }))
  await vi.waitFor(
    () => {
      const checkpoint = localStorage.getItem(LAST_READING_STORAGE_KEY)
      expect(checkpoint).not.toBeNull()
      expect(checkpoint).not.toBe('{not-json')
    },
    { timeout: 5_000, interval: 50 }
  )
  const expectedResumeHash = persistedLastReadingHash(localStorage)

  const resumeFrame = document.createElement('iframe')
  resumeFrame.title = 'Tikkun resume smoke test'
  resumeFrame.style.width = '390px'
  resumeFrame.style.height = '844px'
  resumeFrame.src = `/reader/?resume-smoke=${Date.now()}`
  auxiliaryFrames.push(resumeFrame)
  document.body.appendChild(resumeFrame)
  await vi.waitFor(
    () => {
      const reloadedDocument = requiredFrameDocument(resumeFrame)
      expect(
        reloadedDocument
          .querySelector('[data-target-id="app-root"]')
          ?.getAttribute('data-reader-boot-state')
      ).toBe('ready')
      expect(
        reloadedDocument
          .querySelector('[data-target-id="last-reading-prompt"]')
          ?.classList.contains('u-hidden')
      ).toBe(false)
      expect(
        reloadedDocument.querySelector('[data-target-id="last-reading-copy"]')
          ?.textContent
      ).toContain('Resume')
    },
    { timeout: 15_000, interval: 50 }
  )

  const resumeView = requiredFrameWindow(resumeFrame)
  const reloadedDocument = requiredFrameDocument(resumeFrame)
  const reloadedBook = reloadedDocument.querySelector<HTMLElement>(
    '[data-target-id="tikkun-book"]'
  )
  if (!reloadedBook)
    throw new Error('Reloaded Reader scroll surface is missing')
  const routeChanged = new Promise<void>((resolve) => {
    resumeView.addEventListener('hashchange', () => resolve(), { once: true })
  })
  click(reloadedDocument, '[data-target-id="last-reading-resume"]')
  // Hash updates before Reader page imports settle; keep WebKit's frame alive
  // until the route's own loading state proves rendering is complete.
  await routeChanged
  expect(reloadedBook.getAttribute('aria-busy')).toBe('true')
  await vi.waitFor(
    () => {
      expect(resumeView.location.hash).toBe(expectedResumeHash)
      expect(reloadedBook.getAttribute('aria-busy')).toBeNull()
      expect(reloadedBook.querySelector('[data-page-number]')).not.toBeNull()
      expect(
        reloadedDocument
          .querySelector('[data-target-id="last-reading-prompt"]')
          ?.classList.contains('u-hidden')
      ).toBe(true)
      expect(localStorage.getItem(BOOKMARKS_STORAGE_KEY)).not.toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )
}, 40_000)

function requiredFrameWindow(target: HTMLIFrameElement) {
  if (!target.contentWindow) throw new Error('Application iframe has no window')
  return target.contentWindow
}

function requiredFrameDocument(target: HTMLIFrameElement) {
  if (!target.contentDocument) {
    throw new Error('Application iframe has no document')
  }
  return target.contentDocument
}

function click(document: Document, selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Application smoke test requires ${selector}`)
  element.click()
}

function activeHighlightedToken(document: Document) {
  return (
    document.querySelector<HTMLElement>('.word.is-active-word[data-token-key]')
      ?.dataset.tokenKey ?? null
  )
}

async function waitForHighlightedToken(document: Document) {
  let tokenKey: string | null = null
  await vi.waitFor(
    () => {
      tokenKey = activeHighlightedToken(document)
      expect(tokenKey).not.toBeNull()
    },
    { timeout: 5_000, interval: 50 }
  )
  return tokenKey!
}

function snapshotStoragePrefixes(
  storage: Storage,
  prefixes: readonly string[]
) {
  return new Map(
    storageKeys(storage)
      .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .map((key) => [key, storage.getItem(key)!])
  )
}

function restoreStoragePrefixes(
  storage: Storage,
  snapshot: ReadonlyMap<string, string>
) {
  for (const key of storageKeys(storage)) {
    if (CORRUPTED_BOOT_STORAGE_KEYS.some((prefix) => key.startsWith(prefix))) {
      storage.removeItem(key)
    }
  }
  for (const [key, value] of snapshot) storage.setItem(key, value)
}

function storageKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) =>
    storage.key(index)
  ).filter((key): key is string => key !== null)
}

function persistedLastReadingHash(storage: Storage) {
  const raw = storage.getItem(LAST_READING_STORAGE_KEY)
  if (!raw) throw new Error('Last-reading checkpoint was not persisted')
  const decoded: unknown = JSON.parse(raw)
  if (!decoded || typeof decoded !== 'object' || !('hash' in decoded)) {
    throw new Error('Last-reading checkpoint value is invalid')
  }
  if (typeof decoded.hash !== 'string') {
    throw new Error('Last-reading checkpoint hash is invalid')
  }
  return decoded.hash
}

interface FrameErrorCapture {
  errors: string[]
  restore(): void
}

function captureFrameErrors(view: Window): FrameErrorCapture {
  const errors: string[] = []
  const capturePageError = (event: ErrorEvent) => {
    errors.push(
      `page error: ${formatDiagnosticValue(event.error ?? event.message)}`
    )
  }
  const captureUnhandledRejection = (event: PromiseRejectionEvent) => {
    errors.push(`unhandled rejection: ${formatDiagnosticValue(event.reason)}`)
  }
  view.addEventListener('error', capturePageError)
  view.addEventListener('unhandledrejection', captureUnhandledRejection)
  const frameConsole = (view as Window & { console: Console }).console
  const originalError = frameConsole.error
  const captureConsoleError: Console['error'] = (...values: unknown[]) => {
    errors.push(`console.error: ${values.map(formatDiagnosticValue).join(' ')}`)
    originalError.apply(frameConsole, values)
  }
  frameConsole.error = captureConsoleError

  let restored = false
  return {
    errors,
    restore() {
      if (restored) return
      restored = true
      view.removeEventListener('error', capturePageError)
      view.removeEventListener('unhandledrejection', captureUnhandledRejection)
      if (frameConsole.error === captureConsoleError) {
        frameConsole.error = originalError
      }
    },
  }
}

function describeStartupFailure(
  view: Window,
  document: Document,
  errors: string[]
) {
  const book = document.querySelector<HTMLElement>(
    '[data-target-id="tikkun-book"]'
  )
  const resources = view.performance
    .getEntriesByType('resource')
    .slice(-12)
    .map((entry) => entry.name)
  return `Application startup did not render a reader page: ${JSON.stringify({
    hash: view.location.hash,
    readyState: document.readyState,
    title: document.title,
    readerTitle: document
      .querySelector('[data-target-id="parsha-title"]')
      ?.textContent?.trim(),
    bookExists: Boolean(book),
    bookVisibility: book ? view.getComputedStyle(book).visibility : null,
    bookHtmlLength: book?.innerHTML.length ?? null,
    fontStatus: document.fonts.status,
    serviceWorkerControlled: Boolean(view.navigator.serviceWorker?.controller),
    errors,
    resources,
  })}`
}

function formatDiagnosticValue(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const errorLike = value as {
      message?: unknown
      name?: unknown
      stack?: unknown
    }
    const name = typeof errorLike.name === 'string' ? errorLike.name : ''
    const message =
      typeof errorLike.message === 'string' ? errorLike.message : ''
    const stack = typeof errorLike.stack === 'string' ? errorLike.stack : ''
    if (name || message || stack) {
      const summary = [name, message].filter(Boolean).join(': ')
      if (!stack) return summary
      return summary && !stack.includes(summary)
        ? `${summary}\n${stack}`
        : stack
    }
    try {
      return JSON.stringify(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
  return String(value)
}
