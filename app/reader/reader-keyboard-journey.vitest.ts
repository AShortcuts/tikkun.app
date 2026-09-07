import { afterEach, expect, test, vi } from 'vitest'
import {
  locators,
  page,
  server,
  userEvent,
  type FrameLocator,
  type Locator,
} from 'vitest/browser'

import {
  CUE_AUTHORING_PANEL_OPEN_KEY,
  CUE_AUTHORING_UNLOCKED_KEY,
} from '../admin/access.ts'

const FRAME_TITLE = 'Tikkun Reader keyboard journey'
const KEYBOARD_TARGET_ATTRIBUTE = 'data-keyboard-journey-target'
const READER_PREFERENCES_STORAGE_KEY = 'tikkun.reader-preferences'

declare module 'vitest/browser' {
  interface LocatorSelectors {
    getByKeyboardJourneyTarget(value: string): Locator
  }
}

locators.extend({
  getByKeyboardJourneyTarget(value) {
    return `[${KEYBOARD_TARGET_ATTRIBUTE}="${value}"]`
  },
})

let frame: HTMLIFrameElement | null = null
let restoreFrameErrors: (() => void) | null = null
let applicationFrame: FrameLocator | null = null
let keyboardTargetRevision = 0
let originalReaderPreferences: string | null | undefined

afterEach(() => {
  restoreFrameErrors?.()
  restoreFrameErrors = null
  applicationFrame = null

  const frameWindow = frame?.contentWindow
  frameWindow?.sessionStorage.removeItem(CUE_AUTHORING_UNLOCKED_KEY)
  frameWindow?.sessionStorage.removeItem(CUE_AUTHORING_PANEL_OPEN_KEY)
  frameWindow
    ?.document.querySelector<HTMLAudioElement>('[data-target-id="reader-audio"]')
    ?.pause()
  frame?.remove()
  frame = null

  if (originalReaderPreferences !== undefined) {
    if (originalReaderPreferences === null) {
      localStorage.removeItem(READER_PREFERENCES_STORAGE_KEY)
    } else {
      localStorage.setItem(
        READER_PREFERENCES_STORAGE_KEY,
        originalReaderPreferences
      )
    }
    originalReaderPreferences = undefined
  }
})

test('supports the critical Reader journey with only the keyboard', async () => {
  originalReaderPreferences = localStorage.getItem(
    READER_PREFERENCES_STORAGE_KEY
  )
  localStorage.removeItem(READER_PREFERENCES_STORAGE_KEY)

  frame = document.createElement('iframe')
  frame.title = FRAME_TITLE
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src = `/reader/?keyboard-journey=${Date.now()}#/torah/parsha/beresheet`
  document.body.appendChild(frame)

  await vi.waitFor(
    () => {
      const harnessError = frame?.contentDocument?.querySelector(
        '[data-app-smoke-error]'
      )
      if (harnessError) throw new Error(harnessError.textContent ?? '')
      expect(
        frame?.contentDocument?.querySelector(
          '[data-target-id="tikkun-book"] [data-page-number]'
        )
      ).not.toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )

  const frameWindow = requiredFrameWindow(frame)
  const frameDocument = requiredFrameDocument(frame)
  const frameErrors = captureFrameErrors(frameWindow)
  restoreFrameErrors = frameErrors.restore
  const appFrame = page.frameLocator(page.getByTitle(FRAME_TITLE))
  applicationFrame = appFrame

  const title = required<HTMLButtonElement>(
    frameDocument,
    '[data-target-id="parsha-title"]'
  )
  expect(title.getClientRects().length).toBeGreaterThan(0)
  const keyboardEntry = required<HTMLButtonElement>(
    frameDocument,
    '[data-target-id="about-link"]'
  )
  // Seed the nested test frame; every Reader transition below stays keyboard-driven.
  keyboardEntry.focus({ preventScroll: true })
  expect(frameDocument.activeElement).toBe(keyboardEntry)
  await tabUntilFocused(frameDocument, title, { maxTabs: 3 })
  expect(frameDocument.activeElement).toBe(title)

  await pressFocused(frameDocument, '{Enter}')
  const readingIndex = appFrame.getByRole('region', { name: 'Reading index' })
  await expect.element(readingIndex).toBeVisible()
  await vi.waitFor(
    () =>
      expect(frameDocument.activeElement).toBe(
        required(frameDocument, '[data-target-id="parsha-picker-root"]')
      ),
    { timeout: 10_000, interval: 50 }
  )

  const search = appFrame.getByRole('combobox', {
    name: 'Search readings and commands',
  })
  await pressTab(frameDocument)
  await expect.element(search).toHaveFocus()
  await pressFocused(frameDocument, 'Noach 3')
  await expect.element(search).toHaveValue('Noach 3')

  const noachResult = appFrame.getByRole('option', {
    name: /Parshat Noach.*Aliyah 3/i,
  })
  await expect.element(noachResult).toBeVisible()
  await expect.element(noachResult).toHaveAttribute('aria-selected', 'true')
  await pressFocused(frameDocument, '{Enter}')

  await vi.waitFor(
    () => {
      expect(frameWindow.location.hash).toBe('#/torah/parsha/noach/1-7-17')
      expect(
        frameDocument.querySelector('[data-target-id="parsha-title"]')
          ?.textContent
      ).toContain('נח')
      expect(
        frameDocument.querySelector('[data-target-id="parsha-picker-root"]')
      ).toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )

  const settingsToggle = appFrame.getByRole('button', {
    name: 'Reader settings',
  })
  const settingsToggleElement = required<HTMLButtonElement>(
    frameDocument,
    '[data-target-id="settings-toggle"]'
  )
  await tabUntilFocused(frameDocument, settingsToggleElement, { maxTabs: 24 })
  await expect.element(settingsToggle).toHaveFocus()
  await pressFocused(frameDocument, '{Enter}')

  await vi.waitFor(
    () => {
      if (frameErrors.errors.length) {
        throw new Error(frameErrors.errors.join('\n'))
      }
      expect(
        required<HTMLElement>(
          frameDocument,
          '[data-target-id="settings-pane"]'
        ).classList.contains('u-hidden')
      ).toBe(false)
    },
    { timeout: 10_000, interval: 50 }
  )
  const settingsClose = appFrame.getByRole('button', {
    name: 'Close reader settings',
  })
  await expect.element(settingsClose).toHaveFocus()

  required<HTMLButtonElement>(
    frameDocument,
    '[data-settings-category="playback"]'
  ).click()

  const autoScroll = appFrame.getByRole('checkbox', {
    name: /Auto-scroll with playback/,
  })
  const autoScrollElement = required<HTMLInputElement>(
    frameDocument,
    '[data-target-id="settings-auto-scroll"]'
  )
  await tabUntilFocused(frameDocument, autoScrollElement, { maxTabs: 32 })
  await expect.element(autoScroll).toHaveFocus()
  expect(autoScrollElement.checked).toBe(true)
  await pressFocused(frameDocument, '{Space}')
  await vi.waitFor(
    () => {
      expect(autoScrollElement.checked).toBe(false)
      expect(readPersistedReaderPreferences(frameWindow.localStorage)).toMatchObject({
        autoScrollWithPlayback: false,
      })
    },
    { timeout: 5_000, interval: 50 }
  )
  await expect.element(autoScroll).toHaveFocus()

  await pressFocused(frameDocument, '{Escape}')
  await vi.waitFor(
    () =>
      expect(
        required<HTMLElement>(
          frameDocument,
          '[data-target-id="settings-pane"]'
        ).classList.contains('u-hidden')
      ).toBe(true),
    { timeout: 5_000, interval: 50 }
  )
  await expect.element(settingsToggle).toHaveFocus()

  const playCurrentAliyah = appFrame
    .getByRole('main', { name: 'Torah reader', exact: true })
    .getByRole('button', {
      name: 'Play שלישי',
      exact: true,
    })
  const playCurrentAliyahElement = required<HTMLButtonElement>(
    frameDocument,
    'button[data-audio-button="true"][aria-label="Play שלישי"]'
  )
  expect(
    settingsToggleElement.compareDocumentPosition(playCurrentAliyahElement) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  await tabUntilFocused(
    frameDocument,
    playCurrentAliyahElement,
    { maxTabs: 20 }
  )
  await expect.element(playCurrentAliyah).toHaveFocus()
  await pressFocused(frameDocument, '{Enter}')

  await vi.waitFor(
    () => {
      const player = frameDocument.querySelector<HTMLElement>(
        '[data-target-id="floating-player"]'
      )
      const audio = required<HTMLAudioElement>(
        frameDocument,
        '[data-target-id="reader-audio"]'
      )
      expect(player?.classList.contains('u-hidden')).toBe(false)
      expect(
        frameDocument
          .querySelector('[data-target-id="floating-play"]')
          ?.getAttribute('aria-label')
      ).toBe('Pause')
      expect(audio.paused).toBe(false)
      expect(audio.currentTime).toBeGreaterThan(0)
    },
    { timeout: 15_000, interval: 50 }
  )

  const audio = required<HTMLAudioElement>(
    frameDocument,
    '[data-target-id="reader-audio"]'
  )
  const pausePlayback = appFrame.getByRole('button', {
    name: 'Pause',
    exact: true,
  })
  const pausePlaybackElement = required<HTMLButtonElement>(
    frameDocument,
    '[data-target-id="floating-play"]'
  )
  await tabUntilFocused(frameDocument, pausePlaybackElement, {
    maxTabs: 4,
    shift: true,
  })
  await expect.element(pausePlayback).toHaveFocus()
  await pressFocused(frameDocument, '{Enter}')
  await vi.waitFor(
    () => {
      expect(audio.paused).toBe(true)
      expect(playCurrentAliyahElement.getAttribute('aria-label')).toBe(
        'Play שלישי'
      )
      expect(
        required(frameDocument, '[data-target-id="floating-play"]').getAttribute(
          'aria-label'
        )
      ).toBe('Play')
      expect(frameDocument.activeElement).toBe(
        required(frameDocument, '[data-target-id="tikkun-book"]')
      )
    },
    { timeout: 5_000, interval: 50 }
  )

  frame.style.width = '390px'
  const expandPlayer = appFrame.getByRole('button', {
    name: 'Expand audio player',
  })
  const expandPlayerElement = required<HTMLButtonElement>(
    frameDocument,
    '[data-target-id="floating-mobile-expand"]'
  )
  await vi.waitFor(
    () => {
      expect(frameWindow.getComputedStyle(expandPlayerElement).display).not.toBe(
        'none'
      )
      expect(expandPlayerElement.disabled).toBe(false)
    },
    { timeout: 5_000, interval: 50 }
  )
  await tabUntilFocused(frameDocument, expandPlayerElement, {
    maxTabs: 20,
    shift: true,
  })
  await expect.element(expandPlayer).toHaveFocus()
  await pressFocused(frameDocument, '{Enter}')

  const playerDialog = appFrame.getByRole('dialog', {
    name: 'Expanded audio player',
  })
  const closePlayer = playerDialog.getByRole('button', {
    name: 'Close expanded player',
  })
  await expect.element(playerDialog).toBeVisible()
  await expect.element(closePlayer).toHaveFocus()

  const speedToggleElement = required<HTMLButtonElement>(
    frameDocument,
    '[data-target-id="floating-speed-toggle"]'
  )
  await tabUntilFocused(frameDocument, speedToggleElement, { maxTabs: 8 })
  await expect.element(
    appFrame.getByRole('button', { name: 'Playback speed, 1x' })
  ).toHaveFocus()
  await pressFocused(frameDocument, '{Enter}')

  const speedSlider = appFrame.getByRole('slider', { name: 'Playback speed' })
  const speedSliderElement = required<HTMLInputElement>(
    frameDocument,
    '[data-target-id="floating-speed-slider"]'
  )
  await expect.element(speedSlider).toHaveFocus()
  expect(speedSliderElement.value).toBe('1')
  await pressFocused(frameDocument, '{End}')
  await vi.waitFor(
    () => {
      expect(speedSliderElement.value).toBe('3')
      expect(
        required<HTMLAudioElement>(
          frameDocument,
          '[data-target-id="reader-audio"]'
        ).playbackRate
      ).toBe(3)
      expect(speedToggleElement.getAttribute('aria-label')).toBe(
        'Playback speed, 3x'
      )
    },
    { timeout: 5_000, interval: 50 }
  )
  await expect.element(speedSlider).toHaveFocus()
  await pressTab(frameDocument, { shift: true })
  await expect.element(
    appFrame.getByRole('button', { name: 'Playback speed, 3x' })
  ).toHaveFocus()
  await pressFocused(frameDocument, '{Enter}')
  expect(speedToggleElement.getAttribute('aria-expanded')).toBe('false')

  const seek = appFrame.getByRole('slider', { name: 'Audio position' })
  const seekElement = required<HTMLInputElement>(
    frameDocument,
    '[data-target-id="mobile-player-seek"]'
  )
  await vi.waitFor(
    () => {
      expect(seekElement.disabled).toBe(false)
      expect(Number.isFinite(audio.duration)).toBe(true)
      expect(audio.duration).toBeGreaterThan(0)
    },
    { timeout: 10_000, interval: 50 }
  )
  await tabUntilFocused(frameDocument, seekElement, { maxTabs: 3 })
  await expect.element(seek).toHaveFocus()
  const previousSeekValue = Number.parseInt(seekElement.value, 10)
  const expectedSeekValue = Math.min(1000, previousSeekValue + 1)
  await pressFocused(frameDocument, '{ArrowRight}')
  await vi.waitFor(
    () => {
      expect(Number.parseInt(seekElement.value, 10)).toBe(expectedSeekValue)
      expect(
        Math.abs(
          audio.currentTime - audio.duration * (expectedSeekValue / 1000)
        )
      ).toBeLessThan(0.25)
    },
    { timeout: 5_000, interval: 50 }
  )
  await expect.element(seek).toHaveFocus()

  await pressFocused(frameDocument, '{Escape}')
  await expect.element(playerDialog).not.toBeInTheDocument()
  await expect.element(expandPlayer).toHaveFocus()

  frameWindow.sessionStorage.removeItem(CUE_AUTHORING_UNLOCKED_KEY)
  frameWindow.sessionStorage.removeItem(CUE_AUTHORING_PANEL_OPEN_KEY)
  await pressFocused(
    frameDocument,
    '{Control>}{Shift>}a{/Shift}{/Control}'
  )

  const unlockCode = appFrame.getByLabelText('Local unlock code')
  const cancelAuthoring = appFrame.getByRole('button', { name: 'Cancel' })
  await vi.waitFor(
    () => {
      if (frameErrors.errors.length) {
        throw new Error(frameErrors.errors.join('\n'))
      }
      const dialog = required<HTMLElement>(
        frameDocument,
        '[data-target-id="admin-access-dialog"]'
      )
      expect(dialog.classList.contains('u-hidden')).toBe(false)
      expect(dialog.getAttribute('role')).toBe('dialog')
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(frameDocument.activeElement).toBe(
        required(frameDocument, '[data-target-id="admin-access-password"]')
      )
    },
    { timeout: 10_000, interval: 50 }
  )
  await expect.element(unlockCode).toHaveFocus()

  await pressTab(frameDocument, { shift: true })
  await expect.element(cancelAuthoring).toHaveFocus()
  await pressTab(frameDocument)
  await expect.element(unlockCode).toHaveFocus()
  await pressFocused(frameDocument, '{Escape}')
  await vi.waitFor(
    () =>
      expect(
        required<HTMLElement>(
          frameDocument,
          '[data-target-id="admin-access-dialog"]'
        ).classList.contains('u-hidden')
      ).toBe(true),
    { timeout: 5_000, interval: 50 }
  )
  await expect.element(expandPlayer).toHaveFocus()

  expect(frameErrors.errors, 'Unexpected Reader errors during keyboard journey').toEqual(
    []
  )
}, 60_000)

async function tabUntilFocused(
  document: Document,
  target: HTMLElement,
  {
    maxTabs,
    shift = false,
  }: {
    maxTabs: number
    shift?: boolean
  }
) {
  if (document.activeElement === target) return

  const visited: string[] = []
  for (let tabCount = 0; tabCount < maxTabs; tabCount += 1) {
    await pressTab(document, { shift })
    visited.push(describeFocusedElement(document.activeElement))
    if (document.activeElement === target) return
  }
  throw new Error(
    `Keyboard could not reach ${describeFocusedElement(target)} after ${maxTabs} ${shift ? 'Shift+Tab' : 'Tab'} presses. Visited: ${visited.join(' -> ')}`
  )
}

async function pressTab(
  document: Document,
  { shift = false }: { shift?: boolean } = {}
) {
  const tab = shift ? '{Shift>}{Tab}{/Shift}' : '{Tab}'
  const keys = server.browser === 'webkit' ? `{Alt>}${tab}{/Alt}` : tab
  await pressFocused(document, keys)
}

async function pressFocused(document: Document, keys: string) {
  const activeElement = document.activeElement
  if (!activeElement) {
    throw new Error(
      `Keyboard journey has no focus target before ${keys}`
    )
  }
  const appFrame = applicationFrame
  if (!appFrame) throw new Error('Keyboard journey has no application frame')

  const target = `keyboard-target-${++keyboardTargetRevision}`
  activeElement.setAttribute(KEYBOARD_TARGET_ATTRIBUTE, target)
  try {
    await userEvent.type(appFrame.getByKeyboardJourneyTarget(target), keys, {
      skipClick: true,
    })
  } finally {
    activeElement.removeAttribute(KEYBOARD_TARGET_ATTRIBUTE)
  }
}

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

function required<ElementType extends Element>(
  document: Document,
  selector: string
) {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Keyboard journey requires ${selector}`)
  return element
}

function readPersistedReaderPreferences(storage: Storage) {
  const raw = storage.getItem(READER_PREFERENCES_STORAGE_KEY)
  if (!raw) throw new Error('Reader preferences were not persisted')

  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Persisted Reader preferences are malformed')
  }
  return parsed
}

function describeFocusedElement(element: Element | null) {
  if (!element) return 'none'
  const name =
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40) ??
    ''
  const targetId = element.getAttribute('data-target-id')
  return `${element.tagName.toLowerCase()}${targetId ? `[${targetId}]` : ''}${name ? `(${name})` : ''}`
}

interface FrameErrorCapture {
  errors: string[]
  restore(): void
}

function captureFrameErrors(view: Window): FrameErrorCapture {
  const errors: string[] = []
  const capturePageError = (event: ErrorEvent) => {
    errors.push(event.error instanceof Error ? event.error.message : event.message)
  }
  const captureUnhandledRejection = (event: PromiseRejectionEvent) => {
    errors.push(
      event.reason instanceof Error ? event.reason.message : String(event.reason)
    )
  }
  view.addEventListener('error', capturePageError)
  view.addEventListener('unhandledrejection', captureUnhandledRejection)
  const frameConsole = (view as Window & { console: Console }).console
  const originalConsoleError = frameConsole.error
  const captureConsoleError: Console['error'] = (...values: unknown[]) => {
    errors.push(values.map(formatErrorValue).join(' '))
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

function formatErrorValue(value: unknown) {
  if (value instanceof Error) return value.stack ?? value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
