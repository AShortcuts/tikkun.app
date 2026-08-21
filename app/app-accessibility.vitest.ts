import axe, { type Result as AxeViolation } from 'axe-core'
import { afterEach, expect, test, vi } from 'vitest'
import {
  CUE_AUTHORING_PANEL_OPEN_KEY,
  CUE_AUTHORING_UNLOCKED_KEY,
} from './admin/access.ts'

let frame: HTMLIFrameElement | null = null

type AccessibilityState =
  | 'initial Reader'
  | 'reading picker with search open'
  | 'Reader settings'
  | 'Cue Authoring access dialog'
  | 'Cue Authoring panel'

afterEach(() => {
  const frameWindow = frame?.contentWindow
  frameWindow?.sessionStorage.removeItem(CUE_AUTHORING_UNLOCKED_KEY)
  frameWindow?.sessionStorage.removeItem(CUE_AUTHORING_PANEL_OPEN_KEY)
  frame?.remove()
  frame = null
})

test('keeps critical Reader states free of automated non-color WCAG A and AA violations', async () => {
  frame = document.createElement('iframe')
  frame.title = 'Tikkun application accessibility test'
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src = `/reader/?app-accessibility=${Date.now()}#/torah/parsha/beresheet`
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

  await expectAccessible(frameDocument, 'initial Reader')

  click(frameDocument, '[data-target-id="parsha-title"]')
  await vi.waitFor(
    () =>
      expect(
        frameDocument.querySelector('[data-target-id="parsha-picker-root"]')
      ).not.toBeNull(),
    { timeout: 10_000, interval: 50 }
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
      const search = frameDocument.querySelector<HTMLInputElement>(
        '[data-search-presentation="embedded"] [data-target-id="reader-search-input"]'
      )
      expect(frameDocument.activeElement).toBe(search)
      expect(search?.getAttribute('aria-expanded')).toBe('true')
      expect(
        frameDocument.querySelector(
          '[data-search-presentation="embedded"] [data-target-id="reader-search-results"]'
        )
      ).not.toBeNull()
    },
    { timeout: 10_000, interval: 50 }
  )
  await expectAccessible(frameDocument, 'reading picker with search open')

  const pickerSearch = frameDocument.querySelector<HTMLInputElement>(
    '[data-search-presentation="embedded"] [data-target-id="reader-search-input"]'
  )
  if (!pickerSearch) throw new Error('Expected embedded Reader search')
  pickerSearch.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    })
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
      expect(settings?.classList.contains('u-hidden')).toBe(false)
      expect(
        frameDocument.querySelector(
          '[data-target-id="settings-offline-status"]'
        )?.textContent
      ).not.toContain('Checking')
    },
    { timeout: 10_000, interval: 50 }
  )
  const offlineDownloadButton = frameDocument.querySelector<HTMLButtonElement>(
    '[data-target-id="settings-offline-download"]'
  )
  if (offlineDownloadButton?.textContent?.includes('Try download again')) {
    await vi.waitFor(
      () =>
        expect(frameWindow.getComputedStyle(offlineDownloadButton).opacity).toBe(
          '1'
        ),
      { timeout: 2_000, interval: 25 }
    )
  }
  await expectAccessible(frameDocument, 'Reader settings')
  click(frameDocument, '[data-target-id="settings-close"]')

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
      expect(dialog?.classList.contains('u-hidden')).toBe(false)
      expect(frameDocument.activeElement).toBe(
        frameDocument.querySelector('[data-target-id="admin-access-password"]')
      )
    },
    { timeout: 10_000, interval: 50 }
  )
  await expectAccessible(frameDocument, 'Cue Authoring access dialog')

  const password = frameDocument.querySelector<HTMLInputElement>(
    '[data-target-id="admin-access-password"]'
  )
  if (!password) throw new Error('Expected Cue Authoring password field')
  password.value = 'admin'
  password.dispatchEvent(new InputEvent('input', { bubbles: true }))
  click(frameDocument, '[data-target-id="admin-access-submit"]')
  await vi.waitFor(
    () => {
      const panel = frameDocument.querySelector<HTMLElement>(
        '[data-target-id="admin-panel"]'
      )
      expect(panel?.classList.contains('u-hidden')).toBe(false)
      expect(
        frameWindow.sessionStorage.getItem(CUE_AUTHORING_UNLOCKED_KEY)
      ).toBe('1')
    },
    { timeout: 10_000, interval: 50 }
  )
  await expectAccessible(frameDocument, 'Cue Authoring panel')
}, 60_000)

async function expectAccessible(document: Document, state: AccessibilityState) {
  await settleDocument(document)
  const frameAxe = getFrameAxe(document)
  const results = await frameAxe.run(document, {
    resultTypes: ['violations', 'passes'],
    // The incumbent palette is an explicit product decision and is guarded by
    // visual/style regressions. Do not encode its dynamic DOM as an axe allowlist.
    rules: { 'color-contrast': { enabled: false } },
    runOnly: {
      type: 'tag',
      values: [
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
        'wcag22a',
        'wcag22aa',
      ],
    },
  })
  expect(
    results.passes.length,
    `${state} accessibility scan returned no passing rules`
  ).toBeGreaterThan(0)
  expect(
    results.violations,
    `${state} accessibility violations:\n${formatViolations(results.violations)}`
  ).toEqual([])
}

function getFrameAxe(document: Document) {
  const view = document.defaultView as (Window & { axe?: typeof axe }) | null
  if (!view) throw new Error('Application document has no window')
  if (!view.axe) {
    const script = document.createElement('script')
    script.textContent = axe.source
    document.head.appendChild(script)
    script.remove()
  }
  if (!view.axe) throw new Error('Failed to install axe in application frame')
  return view.axe
}

async function settleDocument(document: Document) {
  const view = document.defaultView
  if (!view) throw new Error('Application document has no window')
  await document.fonts.ready
  await new Promise<void>((resolve) => {
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(() => resolve())
    })
  })
}

function formatViolations(violations: AxeViolation[]) {
  if (!violations.length) return 'none'
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map(
          (node) =>
            `  ${node.target.join(' > ')}\n    ${node.failureSummary ?? ''}`
        )
        .join('\n')
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n${nodes}`
    })
    .join('\n\n')
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

function click(document: Document, selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) {
    throw new Error(`Application accessibility test requires ${selector}`)
  }
  element.click()
}
