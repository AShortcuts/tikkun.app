import { afterEach, expect, test, vi } from 'vitest'
import { commands, page } from 'vitest/browser'
import type { ThemeMode } from '../reader-preferences.ts'

interface AccessibilityMediaOptions {
  forcedColors?: 'active' | 'none' | null
  reducedMotion?: 'reduce' | 'no-preference' | null
}

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    emulateAccessibilityMedia(
      options: AccessibilityMediaOptions
    ): Promise<void>
  }
}

const WIDTHS = [
  320,
  350,
  390,
  550,
  551,
  715,
  716,
  870,
  871,
  920,
  921,
  1280,
] as const
const THEMES: readonly ThemeMode[] = [
  'automatic',
  'light',
  'sepia',
  'dark',
  'custom',
]
const FRAME_TITLE = 'Tikkun Reader responsive layout matrix'

let frame: HTMLIFrameElement | null = null
let errorCapture: FrameErrorCapture | null = null
let originalLocalStorage: Map<string, string> | null = null

afterEach(async () => {
  await commands.emulateAccessibilityMedia({
    forcedColors: null,
    reducedMotion: null,
  })
  errorCapture?.restore()
  errorCapture = null
  frame
    ?.contentDocument?.querySelector<HTMLAudioElement>(
      '[data-target-id="reader-audio"]'
    )
    ?.pause()
  frame?.remove()
  frame = null

  if (originalLocalStorage) {
    restoreStorage(localStorage, originalLocalStorage)
    originalLocalStorage = null
  }
})

test('keeps the real Reader reachable across responsive widths, themes, and accessibility modes', async () => {
  await page.viewport(1440, 1000)
  originalLocalStorage = snapshotStorage(localStorage)
  localStorage.clear()

  frame = document.createElement('iframe')
  frame.title = FRAME_TITLE
  frame.style.display = 'block'
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.style.border = '0'
  frame.src =
    `/reader/?responsive-layout=${Date.now()}` +
    '#/torah/parsha/vezos-haberacha'
  document.body.appendChild(frame)

  await vi.waitFor(
    () => {
      const appRoot = frame?.contentDocument?.querySelector<HTMLElement>(
        '[data-target-id="app-root"]'
      )
      expect(appRoot?.dataset.readerBootState).toBe('ready')
      expect(
        frame?.contentDocument?.querySelector(
          '[data-target-id="tikkun-book"] [data-page-number]'
        )
      ).not.toBeNull()
      expect(
        frame?.contentDocument
          ?.querySelector('[data-target-id="parsha-title"]')
          ?.textContent?.trim()
      ).toContain('וזאת הברכה')
    },
    { timeout: 15_000, interval: 50 }
  )

  const view = requiredFrameWindow(frame)
  const frameDocument = requiredFrameDocument(frame)
  errorCapture = captureFrameErrors(view)
  await frameDocument.fonts.ready

  for (const [themeIndex, theme] of THEMES.entries()) {
    const settingsWidth = themeIndex % 2 === 0 ? 350 : 1280
    await setFrameWidth(frame, settingsWidth)
    await selectTheme(frameDocument, view, theme, settingsWidth)

    for (const width of WIDTHS) {
      await setFrameWidth(frame, width)
      assertReaderLayout(frameDocument, view, `${theme} theme at ${width}px`)
      expect(
        errorCapture.errors,
        `Runtime errors during ${theme} theme at ${width}px`
      ).toEqual([])
    }
  }

  await exerciseReadingIndex(frame, 350)
  await exerciseReadingIndex(frame, 1280)
  await exerciseAccessibilityModes(frame, view, frameDocument, errorCapture)

  expect(errorCapture.errors, 'Responsive Reader runtime errors').toEqual([])
}, 90_000)

async function exerciseAccessibilityModes(
  targetFrame: HTMLIFrameElement,
  view: Window,
  frameDocument: Document,
  capturedErrors: FrameErrorCapture
) {
  const modes = [
    {
      label: 'reduced motion',
      width: 1280,
      media: {
        forcedColors: 'none',
        reducedMotion: 'reduce',
      },
      query: '(prefers-reduced-motion: reduce)',
    },
    {
      label: 'forced colors',
      width: 390,
      media: {
        forcedColors: 'active',
        reducedMotion: 'no-preference',
      },
      query: '(forced-colors: active)',
    },
    {
      label: '200% zoom reflow',
      // 1280 physical px at 200% browser zoom exposes 640 CSS px.
      width: 640,
      media: {
        forcedColors: 'none',
        reducedMotion: 'no-preference',
      },
      query: null,
    },
  ] as const satisfies readonly {
    label: string
    width: number
    media: AccessibilityMediaOptions
    query: string | null
  }[]

  for (const mode of modes) {
    await commands.emulateAccessibilityMedia(mode.media)
    await setFrameWidth(targetFrame, mode.width)
    if (mode.query) {
      await vi.waitFor(
        () => expect(view.matchMedia(mode.query).matches).toBe(true),
        { timeout: 5_000, interval: 25 }
      )
    }

    const context = `${mode.label} at ${mode.width}px`
    assertReaderLayout(frameDocument, view, context)
    if (mode.label === 'reduced motion') {
      const title = required<HTMLButtonElement>(
        frameDocument,
        '[data-target-id="parsha-title"]'
      )
      expect(
        maximumCssTimeInMilliseconds(
          view.getComputedStyle(title).transitionDuration
        ),
        `${context} control transition duration`
      ).toBeLessThanOrEqual(0.01)
    }

    await exerciseAccessibilityModeControls(
      targetFrame,
      mode.width,
      context,
      mode.label === 'reduced motion'
    )
    expect(
      capturedErrors.errors,
      `Runtime errors during ${context}`
    ).toEqual([])
  }

  expect(
    capturedErrors.errors,
    'Accessibility-mode Reader runtime errors'
  ).toEqual([])
}

async function selectTheme(
  document: Document,
  view: Window,
  theme: ThemeMode,
  width: number
) {
  await openSettings(document, view, width)
  const pane = required<HTMLElement>(document, '[data-target-id="settings-pane"]')
  assertNoDocumentOverflow(document, view, `${width}px open Reader Settings`)
  assertFullyReachable(pane, view, `${width}px Reader Settings`)

  const themeButtons = Array.from(
    pane.querySelectorAll<HTMLButtonElement>('[data-theme-mode]')
  )
  expect(themeButtons).toHaveLength(THEMES.length)
  for (const button of themeButtons) {
    assertFullyReachable(
      button,
      view,
      `${width}px ${button.dataset.themeMode ?? 'unknown'} theme control`
    )
  }

  const target = required<HTMLButtonElement>(
    pane,
    `[data-theme-mode="${theme}"]`
  )
  target.scrollIntoView({ block: 'center' })
  target.click()
  await vi.waitFor(
    () => {
      expect(document.documentElement.dataset.readerTheme).toBe(theme)
      expect(target.getAttribute('aria-pressed')).toBe('true')
    },
    { timeout: 5_000, interval: 25 }
  )

  required<HTMLButtonElement>(document, '[data-target-id="settings-close"]').click()
  await vi.waitFor(
    () => expect(isRendered(view, pane)).toBe(false),
    { timeout: 5_000, interval: 25 }
  )
  assertReaderLayout(document, view, `${theme} theme after closing Settings`)
}

async function openSettings(document: Document, view: Window, width: number) {
  let returnFocus: HTMLButtonElement
  const directToggle = required<HTMLButtonElement>(
    document,
    '[data-target-id="settings-toggle"]'
  )
  if (isRendered(view, directToggle)) {
    assertFullyReachable(directToggle, view, `${width}px Reader Settings button`)
    returnFocus = directToggle
    directToggle.click()
  } else {
    const overflowToggle = required<HTMLButtonElement>(
      document,
      '[data-target-id="toolbar-overflow-toggle"]'
    )
    assertFullyReachable(overflowToggle, view, `${width}px Reader controls button`)
    returnFocus = overflowToggle
    overflowToggle.click()
    const settingsAction = required<HTMLButtonElement>(
      document,
      '[data-toolbar-overflow-action="settings"]'
    )
    await vi.waitFor(
      () => expect(isRendered(view, settingsAction)).toBe(true),
      { timeout: 5_000, interval: 25 }
    )
    assertFullyReachable(settingsAction, view, `${width}px Settings menu action`)
    settingsAction.click()
  }

  await vi.waitFor(
    () => {
      const pane = document.querySelector<HTMLElement>(
        '[data-target-id="settings-pane"]'
      )
      expect(pane).not.toBeNull()
      expect(pane ? isRendered(view, pane) : false).toBe(true)
    },
    { timeout: 10_000, interval: 50 }
  )
  return returnFocus
}

async function exerciseAccessibilityModeControls(
  targetFrame: HTMLIFrameElement,
  width: number,
  context: string,
  reducedMotion: boolean
) {
  const view = requiredFrameWindow(targetFrame)
  const document = requiredFrameDocument(targetFrame)
  const returnFocus = await openSettings(document, view, width)
  const pane = required<HTMLElement>(document, '[data-target-id="settings-pane"]')
  const close = required<HTMLButtonElement>(
    document,
    '[data-target-id="settings-close"]'
  )

  await vi.waitFor(() => expect(document.activeElement).toBe(close), {
    timeout: 5_000,
    interval: 25,
  })
  assertNoDocumentOverflow(document, view, `${context} Reader Settings`)
  assertFullyReachable(pane, view, `${context} Reader Settings`)
  assertFullyReachable(close, view, `${context} Settings close control`)

  const automaticTheme = required<HTMLButtonElement>(
    pane,
    '[data-theme-mode="automatic"]'
  )
  if (reducedMotion) {
    expect(
      maximumCssTimeInMilliseconds(
        view.getComputedStyle(automaticTheme).transitionDuration
      ),
      `${context} Settings transition duration`
    ).toBeLessThanOrEqual(0.01)
  }
  automaticTheme.scrollIntoView({ block: 'center' })
  automaticTheme.focus({ preventScroll: true })
  expect(document.activeElement, `${context} settings control focus`).toBe(
    automaticTheme
  )
  assertFullyReachable(
    automaticTheme,
    view,
    `${context} automatic theme control`
  )

  close.click()
  await vi.waitFor(
    () => {
      expect(isRendered(view, pane)).toBe(false)
      expect(document.activeElement).toBe(returnFocus)
    },
    { timeout: 5_000, interval: 25 }
  )
  await exerciseReadingIndex(targetFrame, width, { assertFocus: true })
}

async function exerciseReadingIndex(
  targetFrame: HTMLIFrameElement,
  width: number,
  { assertFocus = false }: { assertFocus?: boolean } = {}
) {
  await setFrameWidth(targetFrame, width)
  const view = requiredFrameWindow(targetFrame)
  const document = requiredFrameDocument(targetFrame)
  const title = required<HTMLButtonElement>(
    document,
    '[data-target-id="parsha-title"]'
  )
  if (assertFocus) {
    title.focus({ preventScroll: true })
    expect(document.activeElement).toBe(title)
  }
  title.click()

  await vi.waitFor(
    () =>
      expect(
        document.querySelector('[data-target-id="parsha-picker-root"]')
      ).not.toBeNull(),
    { timeout: 10_000, interval: 50 }
  )
  const picker = required<HTMLElement>(
    document,
    '[data-target-id="parsha-picker-root"]'
  )
  if (assertFocus) {
    await vi.waitFor(() => expect(document.activeElement).toBe(picker), {
      timeout: 5_000,
      interval: 25,
    })
  }
  assertNoDocumentOverflow(document, view, `${width}px open Reading Index`)
  assertFullyReachable(picker, view, `${width}px Reading Index`)

  const search = required<HTMLInputElement>(
    picker,
    '[data-search-presentation="embedded"] [data-target-id="reader-search-input"]'
  )
  search.focus()
  if (assertFocus) expect(document.activeElement).toBe(search)
  search.value = 'Vezos Haberacha'
  search.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await vi.waitFor(
    () => {
      expect(search.getAttribute('aria-expanded')).toBe('true')
      expect(
        picker.querySelectorAll('[data-target-id="reader-search-results"] [role="option"]')
          .length
      ).toBeGreaterThan(0)
    },
    { timeout: 5_000, interval: 25 }
  )
  const results = required<HTMLElement>(
    picker,
    '[data-target-id="reader-search-results"]'
  )
  assertNoDocumentOverflow(document, view, `${width}px Reading Index search`)
  assertFullyReachable(search, view, `${width}px Reading Index search input`)
  assertFullyReachable(results, view, `${width}px Reading Index search results`)

  search.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  await vi.waitFor(() => expect(search.value).toBe(''), {
    timeout: 5_000,
    interval: 25,
  })
  search.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  await vi.waitFor(
    () => {
      expect(
        document.querySelector('[data-target-id="parsha-picker-root"]')
      ).toBeNull()
      if (assertFocus) expect(document.activeElement).toBe(title)
    },
    { timeout: 5_000, interval: 25 }
  )
  assertReaderLayout(document, view, `${width}px after closing Reading Index`)
}

function maximumCssTimeInMilliseconds(value: string) {
  return Math.max(
    ...value.split(',').map((part) => {
      const duration = part.trim()
      if (duration.endsWith('ms')) return Number.parseFloat(duration)
      if (duration.endsWith('s')) return Number.parseFloat(duration) * 1000
      throw new Error(`Unsupported CSS time ${duration}`)
    })
  )
}

function assertReaderLayout(document: Document, view: Window, context: string) {
  assertNoDocumentOverflow(document, view, context)
  const title = required<HTMLButtonElement>(
    document,
    '[data-target-id="parsha-title"]'
  )
  expect(title.textContent?.trim(), `${context} long Reader title`).toContain(
    'וזאת הברכה'
  )
  assertFullyReachable(title, view, `${context} Reader title`)
  const titleRect = title.getBoundingClientRect()
  const titleCenter = titleRect.left + titleRect.width / 2
  expect(
    Math.abs(titleCenter - view.innerWidth / 2),
    `${context} Reader title centered in viewport`
  ).toBeLessThanOrEqual(1)
  if (view.innerWidth <= 550) {
    const titleStyle = view.getComputedStyle(title)
    expect(titleStyle.whiteSpace, `${context} Reader title wrapping`).toBe(
      'nowrap'
    )
    expect(titleStyle.textOverflow, `${context} Reader title truncation`).toBe(
      'clip'
    )
    expect(
      title.scrollWidth,
      `${context} Reader title width ${title.scrollWidth}px exceeds its ${title.clientWidth}px capsule`
    ).toBeLessThanOrEqual(title.clientWidth + 1)
  }

  const visibleToolbarButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.app-toolbar button')
  ).filter((button) => isRendered(view, button))
  expect(
    visibleToolbarButtons.length,
    `${context} visible Reader toolbar controls`
  ).toBeGreaterThanOrEqual(3)
  for (const button of visibleToolbarButtons) {
    assertFullyReachable(
      button,
      view,
      `${context} ${describeElement(button)}`
    )
  }

  const bookmark = required<HTMLButtonElement>(
    document,
    '[data-target-id="bookmark-current"]'
  )
  const overflow = required<HTMLButtonElement>(
    document,
    '[data-target-id="toolbar-overflow-toggle"]'
  )
  const settings = required<HTMLButtonElement>(
    document,
    '[data-target-id="settings-toggle"]'
  )
  const currentAliyahAudio = required<HTMLButtonElement>(
    document,
    '[data-target-id="toolbar-current-aliyah-audio"]'
  )
  expect(
    isRendered(view, currentAliyahAudio),
    `${context} duplicate header play control`
  ).toBe(false)

  if (view.innerWidth <= 550) {
    const home = required<HTMLButtonElement>(
      document,
      '[data-target-id="mobile-library"]'
    )
    const aliyah = required<HTMLButtonElement>(
      document,
      '[data-target-id="mobile-aliyah-picker-toggle"]'
    )
    expect(isRendered(view, home), `${context} mobile Home control`).toBe(true)
    expect(isRendered(view, bookmark), `${context} mobile Bookmark control`).toBe(true)
    expect(isRendered(view, overflow), `${context} mobile Reader controls`).toBe(true)
    expect(isRendered(view, settings), `${context} duplicate mobile Settings`).toBe(
      false
    )

    const homeRect = home.getBoundingClientRect()
    const bookmarkRect = bookmark.getBoundingClientRect()
    const aliyahRect = aliyah.getBoundingClientRect()
    const overflowRect = overflow.getBoundingClientRect()
    expect(homeRect.right, `${context} Home before Bookmark`).toBeLessThanOrEqual(
      bookmarkRect.left + 1
    )
    expect(
      bookmarkRect.right,
      `${context} Bookmark clear of Reader title`
    ).toBeLessThanOrEqual(titleRect.left + 1)
    if (isRendered(view, aliyah)) {
      expect(titleRect.right, `${context} Reader title clear of Aliyah`).toBeLessThanOrEqual(
        aliyahRect.left + 1
      )
      expect(
        aliyahRect.right,
        `${context} Aliyah before Reader controls`
      ).toBeLessThanOrEqual(overflowRect.left + 1)
    } else {
      expect(
        titleRect.right,
        `${context} Reader title clear of Reader controls`
      ).toBeLessThanOrEqual(overflowRect.left + 1)
    }
  } else {
    expect(isRendered(view, bookmark), `${context} desktop Bookmark control`).toBe(true)
    expect(isRendered(view, overflow), `${context} duplicate desktop Reader controls`).toBe(
      false
    )
    expect(isRendered(view, settings), `${context} desktop Settings control`).toBe(true)
  }

  const book = required<HTMLElement>(document, '[data-target-id="tikkun-book"]')
  const bookRect = book.getBoundingClientRect()
  expect(bookRect.width, `${context} Reader surface width`).toBeGreaterThan(0)
  expect(bookRect.right, `${context} Reader surface reaches viewport`).toBeGreaterThan(0)
  expect(bookRect.left, `${context} Reader surface starts before viewport end`).toBeLessThan(
    view.innerWidth
  )
}

function assertNoDocumentOverflow(
  document: Document,
  view: Window,
  context: string
) {
  const scrollWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth
  )
  const overflowDetails =
    scrollWidth > view.innerWidth + 1
      ? Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(
            ({ element, rect }) =>
              isRendered(view, element) &&
              (rect.left < -1 || rect.right > view.innerWidth + 1)
          )
          .sort(
            (left, right) =>
              right.rect.right - view.innerWidth - (left.rect.right - view.innerWidth)
          )
          .slice(0, 5)
          .map(
            ({ element, rect }) =>
              `${describeElement(element)} [${rect.left.toFixed(1)}, ${rect.right.toFixed(1)}]`
          )
          .join(', ')
      : ''
  expect.soft(
    scrollWidth,
    `${context} document width ${scrollWidth}px exceeds ${view.innerWidth}px viewport` +
      (overflowDetails ? `; overflow: ${overflowDetails}` : '')
  ).toBeLessThanOrEqual(view.innerWidth + 1)
}

function assertFullyReachable(
  element: Element,
  view: Window,
  context: string
) {
  const rect = element.getBoundingClientRect()
  expect(rect.width, `${context} width`).toBeGreaterThan(0)
  expect(rect.height, `${context} height`).toBeGreaterThan(0)
  expect(rect.left, `${context} clipped on left`).toBeGreaterThanOrEqual(-1)
  expect(rect.right, `${context} clipped on right`).toBeLessThanOrEqual(
    view.innerWidth + 1
  )
}

async function setFrameWidth(target: HTMLIFrameElement, width: number) {
  target.style.width = `${width}px`
  const view = requiredFrameWindow(target)
  await vi.waitFor(() => expect(view.innerWidth).toBe(width), {
    timeout: 5_000,
    interval: 25,
  })
  await settle(view)
}

function settle(view: Window) {
  return new Promise<void>((resolve) => {
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(() => resolve())
    })
  })
}

function isRendered(view: Window, element: Element) {
  const style = view.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    rect.width > 0 &&
    rect.height > 0
  )
}

function requiredFrameWindow(target: HTMLIFrameElement) {
  if (!target.contentWindow) throw new Error('Responsive Reader frame has no window')
  return target.contentWindow
}

function requiredFrameDocument(target: HTMLIFrameElement) {
  if (!target.contentDocument) {
    throw new Error('Responsive Reader frame has no document')
  }
  return target.contentDocument
}

function required<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Responsive Reader requires ${selector}`)
  return element
}

function describeElement(element: Element) {
  const classes =
    typeof element.className === 'string' ? element.className.trim() : ''
  return (
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.getAttribute('data-target-id') ??
    (element.id || null) ??
    (classes
      ? `${element.tagName.toLocaleLowerCase()}.${classes.replace(/\s+/g, '.')}`
      : null) ??
    element.tagName.toLocaleLowerCase()
  )
}

function snapshotStorage(storage: Storage) {
  const snapshot = new Map<string, string>()
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key !== null) snapshot.set(key, storage.getItem(key) ?? '')
  }
  return snapshot
}

function restoreStorage(storage: Storage, snapshot: Map<string, string>) {
  const currentKeys = Array.from(
    { length: storage.length },
    (_, index) => storage.key(index)
  ).filter((key): key is string => key !== null)
  for (const key of currentKeys) storage.removeItem(key)
  for (const [key, value] of snapshot) storage.setItem(key, value)
}

interface FrameErrorCapture {
  errors: string[]
  restore(): void
}

function captureFrameErrors(view: Window): FrameErrorCapture {
  const errors: string[] = []
  const capturePageError = (event: ErrorEvent) => {
    errors.push(`page error: ${formatError(event.error ?? event.message)}`)
  }
  const captureUnhandledRejection = (event: PromiseRejectionEvent) => {
    errors.push(`unhandled rejection: ${formatError(event.reason)}`)
  }
  view.addEventListener('error', capturePageError)
  view.addEventListener('unhandledrejection', captureUnhandledRejection)

  const frameConsole = (view as Window & { console: Console }).console
  const originalConsoleError = frameConsole.error
  const captureConsoleError: Console['error'] = (...values: unknown[]) => {
    errors.push(`console.error: ${values.map(formatError).join(' ')}`)
    originalConsoleError.apply(frameConsole, values)
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
        frameConsole.error = originalConsoleError
      }
    },
  }
}

function formatError(value: unknown) {
  if (value instanceof Error) return value.stack ?? value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
