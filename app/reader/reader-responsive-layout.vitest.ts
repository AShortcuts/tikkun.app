import { afterEach, expect, test, vi } from 'vitest'
import { commands, page } from 'vitest/browser'
import type { ThemeMode } from '../reader-preferences.ts'
import { getFirstGraphemeRect } from '../reading/aliyah-start-marker.ts'

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

test.each(['match', 'reading'] as const)('anchors mobile aliyah overlays to their first letter in %s after scrolling and resizing', async (readerTextLayout) => {
  await page.viewport(1280, 1000)
  originalLocalStorage = snapshotStorage(localStorage)
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({
    readerTextLayout,
    readerSideMode: 'one',
  }))
  frame = document.createElement('iframe')
  frame.title = `Mobile ${readerTextLayout} aliyah overlay`
  frame.style.cssText = 'display:block;width:390px;height:844px;border:0'
  frame.src = `/reader/?aliyah-overlay=${Date.now()}#/torah/parsha/beshalach/2-14-26`
  document.body.append(frame)
  await vi.waitFor(() => {
    expect(frame?.contentDocument?.querySelector('[data-reader-boot-state="ready"]')).not.toBeNull()
    expect(frame?.contentDocument?.querySelector('.aliyah-start-marker')).not.toBeNull()
  }, { timeout: 15_000, interval: 50 })

  const doc = requiredFrameDocument(frame)
  const view = requiredFrameWindow(frame)
  const book = required<HTMLElement>(doc, '[data-target-id="tikkun-book"]')
  expect(book.dataset.readerLayout).toBe(readerTextLayout)
  expect(book.dataset.readerSides).toBe('one')
  errorCapture = captureFrameErrors(view)
  await doc.fonts.ready
  const assertAnchors = () => {
    const markers = [...book.querySelectorAll<HTMLButtonElement>('.aliyah-start-marker')]
    expect(markers.length).toBeGreaterThan(0)
    for (const marker of markers) {
      const word = required<HTMLElement>(
        marker.parentElement!,
        `.word[data-token-key="${marker.dataset.tokenKey}"]:not([hidden])`
      )
      const letter = getFirstGraphemeRect(word)
      expect(letter).not.toBeNull()
      if (!letter) continue
      const rect = marker.getBoundingClientRect()
      const transform = new DOMMatrixReadOnly(view.getComputedStyle(marker).transform)
      expect(rect.width).toBe(44)
      expect(rect.height).toBe(44)
      const context = `${readerTextLayout} ${view.innerWidth}px ${marker.dataset.tokenKey}`
      expect(
        Math.abs(rect.left + rect.width / 2 - letter.left - letter.width / 2),
        `${context} horizontal anchor`
      ).toBeLessThan(1)
      expect(
        Math.abs(rect.top - transform.m42 - letter.top),
        `${context} vertical anchor`
      ).toBeLessThan(1)
    }
  }
  for (const width of [390, 320, 550, 390]) {
    await setFrameWidth(frame, width)
    await vi.waitFor(assertAnchors, { timeout: 3_000, interval: 50 })
    for (const distance of [-120, 240]) {
      book.scrollTop += distance
      await settle(view)
      await vi.waitFor(assertAnchors, { timeout: 3_000, interval: 50 })
    }
  }
  book.scrollTop = 0
  await vi.waitFor(() => {
    expect(book.querySelector('[data-page-number="76"]')).not.toBeNull()
  }, { timeout: 8_000, interval: 50 })
  await vi.waitFor(assertAnchors, { timeout: 3_000, interval: 50 })
  expect(errorCapture.errors).toEqual([])
}, 25_000)

test.each([
  { layout: 'reading', width: 390 },
  { layout: 'reading', width: 1000 },
  { layout: 'match', width: 390 },
  { layout: 'match', width: 1000 },
])('keeps verse numbers and the focal word through nekud toggles: $layout at $width', async ({ layout, width }) => {
  await page.viewport(1440, 1000)
  originalLocalStorage = snapshotStorage(localStorage)
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({
    readerTextLayout: layout,
    readerSideMode: 'one',
  }))
  frame = document.createElement('iframe')
  frame.title = 'Reader nekud position regression'
  frame.style.cssText = `position:fixed;inset:0;width:${width}px;height:844px;border:0`
  frame.src = `/reader/?nekud-position=${Date.now()}#/torah/parsha/vezos-haberacha`
  document.body.append(frame)
  await vi.waitFor(() => {
    expect(frame?.contentDocument?.querySelector('[data-reader-boot-state="ready"]')).not.toBeNull()
  }, { timeout: 15_000, interval: 50 })
  const doc = requiredFrameDocument(frame)
  const view = requiredFrameWindow(frame)
  const book = required<HTMLElement>(doc, '[data-target-id="tikkun-book"]')
  const toggle = required<HTMLButtonElement>(doc, '[data-test-id="annotations-toggle"]')
  errorCapture = captureFrameErrors(view)
  await doc.fonts.ready
  await settle(view)
  book.scrollTop += 160
  await settle(view)
  const centerY = () => book.getBoundingClientRect().top + book.clientHeight / 2
  const offset = (word: HTMLElement) => {
    const rect = word.getBoundingClientRect()
    return (rect.top + rect.bottom) / 2 - centerY()
  }
  const word = [...book.querySelectorAll<HTMLElement>('[data-reader-canonical="true"] .word:not([hidden])')]
    .filter((candidate) => candidate.getClientRects().length > 0)
    .sort((a, b) => Math.abs(offset(a)) - Math.abs(offset(b)))[0]
  expect(word).toBeDefined()
  const before = offset(word)
  const labels = [...book.querySelectorAll<HTMLElement>('.location-indicator.mod-verses')]
    .filter((label) => label.textContent?.trim())
  expect(labels.length).toBeGreaterThan(0)
  for (const enabled of [false, true, false, true]) {
    toggle.click()
    await settle(view)
    expect(toggle.getAttribute('aria-pressed')).toBe(String(enabled))
    expect(word.isConnected).toBe(true)
    expect(word.hidden).toBe(false)
    expect(Math.abs(offset(word) - before), `${layout} ${width}px ${word.dataset.tokenKey}`).toBeLessThan(2)
    for (const label of labels) {
      expect(view.getComputedStyle(label).display).not.toBe('none')
      expect(label.getBoundingClientRect().width).toBeGreaterThan(0)
    }
  }
  if (width === 390) {
    const bookRect = book.getBoundingClientRect()
    const x = bookRect.left + 12
    const y = bookRect.top + book.clientHeight / 2
    const gap = doc.elementFromPoint(x, y)!
    expect(book.contains(gap)).toBe(true)
    expect(gap.closest('.reader-text-side')).toBeNull()
    expect(gap.closest('.word')).toBeNull()
    const main = required<HTMLElement>(doc, '[data-target-id="reader-shell"]')
    const mainRect = main.getBoundingClientRect()
    const reader = page.frameLocator(page.elementLocator(frame)).getByRole('main', { name: 'Torah reader' })
    for (const enabled of [false, true]) {
      await reader.click({ position: { x: x - mainRect.left, y: y - mainRect.top } })
      await settle(view)
      expect(toggle.getAttribute('aria-pressed'), 'tap in the blank reading margin').toBe(String(enabled))
      expect(Math.abs(offset(word) - before)).toBeLessThan(2)
    }

    const pointer = (type: string, clientY = y) => gap.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY,
    }))
    pointer('pointerdown')
    pointer('pointermove', y + 30)
    pointer('pointerup', y + 30)
    gap.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle(view)
    expect(toggle.getAttribute('aria-pressed'), 'dragging through a gap must not toggle').toBe('true')

    gap.setAttribute('data-reader-no-form-toggle', 'true')
    pointer('pointerdown')
    pointer('pointerup')
    gap.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle(view)
    gap.removeAttribute('data-reader-no-form-toggle')
    expect(toggle.getAttribute('aria-pressed'), 'excluded surfaces must not toggle').toBe('true')
  }
  expect(errorCapture.errors).toEqual([])
}, 25_000)

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
  await showSettingsCategory(pane, view, 'appearance')

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

async function showSettingsCategory(
  pane: HTMLElement,
  view: Window,
  category: 'reading' | 'appearance' | 'playback' | 'more'
) {
  const button = required<HTMLButtonElement>(
    pane,
    `[data-settings-category="${category}"]`
  )
  button.click()
  await vi.waitFor(
    () => {
      expect(button.getAttribute('aria-pressed')).toBe('true')
      expect(
        isRendered(
          view,
          required(pane, `#reader-settings-${category}-panel`)
        )
      ).toBe(true)
    },
    { timeout: 5_000, interval: 25 }
  )
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
  await showSettingsCategory(pane, view, 'appearance')

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
    const titleRange = document.createRange()
    titleRange.selectNodeContents(title)
    const textRect = titleRange.getBoundingClientRect()
    expect(textRect.left, `${context} title text left edge`).toBeGreaterThanOrEqual(titleRect.left - 1)
    expect(textRect.right, `${context} title text right edge`).toBeLessThanOrEqual(titleRect.right + 1)
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

    const bookmarkIcon = required<SVGElement>(bookmark, '.ui-icon')
    const settingsIcon = required<SVGElement>(settings, '.ui-icon')
    expect(bookmarkIcon.getBoundingClientRect().width, `${context} Bookmark icon size`)
      .toBe(settingsIcon.getBoundingClientRect().width)
    const about = required<HTMLButtonElement>(document, '[data-target-id="about-link"]')
    expect(view.getComputedStyle(about).fontSize, `${context} About text size`).toBe('16px')
    const aboutText = document.createRange()
    aboutText.selectNodeContents(about)
    expect(
      Math.abs(aboutText.getBoundingClientRect().left +
        settingsIcon.getBoundingClientRect().right - view.innerWidth),
      `${context} About text and Settings icon have mirrored inner edges`
    ).toBeLessThanOrEqual(1)
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
