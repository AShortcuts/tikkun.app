import { afterEach, expect, test, vi } from 'vitest'
import {
  CUE_AUTHORING_PANEL_OPEN_KEY,
  CUE_AUTHORING_UNLOCKED_KEY,
} from './admin/access.ts'

let frame: HTMLIFrameElement | null = null

afterEach(() => {
  const frameWindow = frame?.contentWindow
  frameWindow?.sessionStorage.removeItem(CUE_AUTHORING_UNLOCKED_KEY)
  frameWindow?.sessionStorage.removeItem(CUE_AUTHORING_PANEL_OPEN_KEY)
  frame?.remove()
  frame = null
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
  const frameErrors = captureFrameErrors(frameWindow)

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
  frameDocument.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  await vi.waitFor(
    () =>
      expect(
        frameDocument.querySelector('[data-target-id="parsha-picker-root"]')
      ).toBeNull(),
    { timeout: 5_000, interval: 50 }
  )

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
  if (!password) throw new Error('Admin access dialog requires its password input')
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
      expect(frameWindow.sessionStorage.getItem(CUE_AUTHORING_UNLOCKED_KEY)).toBe(
        '1'
      )
    },
    { timeout: 10_000, interval: 50 }
  )

  frameWindow.location.hash = '#/torah/parsha/vayetzei/1-29-18'
  await vi.waitFor(
    () => {
      expect(frameWindow.location.hash).toBe(
        '#/torah/parsha/vayetzei/1-29-18'
      )
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

  click(frameDocument, '.aliyah-audio-button[data-aliyah-index="3"]')
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
        frameDocument
          .querySelector<HTMLElement>('[data-target-id="admin-resume-wrap"]')
          ?.hidden
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

function captureFrameErrors(view: Window) {
  const errors: string[] = []
  view.addEventListener('error', (event) => {
    errors.push(
      event.error instanceof Error
        ? event.error.stack ?? event.error.message
        : event.message
    )
  })
  view.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    errors.push(
      reason instanceof Error ? reason.stack ?? reason.message : String(reason)
    )
  })
  const frameConsole = (view as Window & { console: Console }).console
  const originalError = frameConsole.error.bind(frameConsole)
  frameConsole.error = (...values: unknown[]) => {
    errors.push(values.map(formatDiagnosticValue).join(' '))
    originalError(...values)
  }
  return errors
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
  if (value instanceof Error) return value.stack ?? value.message
  return typeof value === 'string' ? value : JSON.stringify(value)
}
