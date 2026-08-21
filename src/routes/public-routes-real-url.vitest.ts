import { afterEach, expect, test, vi } from 'vitest'

let frame: HTMLIFrameElement | null = null
let errorCapture: FrameErrorCapture | null = null

afterEach(() => {
  errorCapture?.restore()
  errorCapture = null
  frame?.remove()
  frame = null
})

test('loads the real Home route and keeps navigation operable', async () => {
  const route = await loadRoute(
    '/',
    '#home-title',
    'Tikkun Korim — Torah reading practice in sync'
  )
  errorCapture = captureRouteErrors(route.view, 'Home')

  expect(required(route.document, '#home-title').textContent).toContain(
    'Your aliyah.'
  )
  expect(primaryNavHrefs(route.document)).toEqual([
    '/readings/',
    '/tidbits/',
    '/about/',
  ])

  const mobileMenu = required<HTMLDetailsElement>(
    route.document,
    '.site-mobile-menu'
  )
  click(route.document, '.site-mobile-menu > summary')
  await vi.waitFor(() => expect(mobileMenu.open).toBe(true))
  route.document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  await vi.waitFor(() => expect(mobileMenu.open).toBe(false))
  await assertRouteHealthy(route.document, errorCapture)
})

test('loads the real Readings route and filters published coverage', async () => {
  const route = await loadRoute(
    '/readings/',
    '#readings-title',
    'Readings & coverage — Tikkun Korim'
  )
  errorCapture = captureRouteErrors(route.view, 'Readings')

  const search = required<HTMLInputElement>(
    route.document,
    '.coverage-search input[type="search"]'
  )
  search.value = 'Beresheet'
  search.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await vi.waitFor(
    () => {
      expect(
        required(
          route.document,
          '.coverage-result-count'
        ).textContent?.trim()
      ).toBe('Showing 1 of 56 readings')
      expect(
        Array.from(
          route.document.querySelectorAll('.coverage-name'),
          (item) => item.textContent?.trim()
        )
      ).toEqual(['Beresheet'])
    },
    { timeout: 5_000, interval: 25 }
  )
  await assertRouteHealthy(route.document, errorCapture)
})

test('loads the real Tidbits route with its honest empty state', async () => {
  const route = await loadRoute(
    '/tidbits/',
    '#tidbits-title',
    'Tidbits — Tikkun Korim'
  )
  errorCapture = captureRouteErrors(route.view, 'Tidbits')

  expect(required(route.document, '#tidbits-empty-title').textContent).toBe(
    'No tidbits published yet.'
  )
  await assertRouteHealthy(route.document, errorCapture)
})

test('loads the real About route with support and project status', async () => {
  const route = await loadRoute(
    '/about/',
    '#about-title',
    'About — Tikkun Korim'
  )
  errorCapture = captureRouteErrors(route.view, 'About')

  expect(required(route.document, '#support-title').textContent).toBe('Support')
  expect(required(route.document, '#taskboard-title').textContent).toBe(
    'Taskboard'
  )
  await assertRouteHealthy(route.document, errorCapture)
})

async function loadRoute(pathname: string, readySelector: string, title: string) {
  frame = document.createElement('iframe')
  frame.title = `Tikkun public route: ${pathname}`
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src = `${pathname}?public-routes=${Date.now()}`
  document.body.appendChild(frame)

  await vi.waitFor(
    () => {
      const view = requiredFrameWindow(frame)
      const routeDocument = requiredFrameDocument(frame)
      expect(view.location.pathname).toBe(pathname)
      expect(routeDocument.querySelector(readySelector)).not.toBeNull()
      expect(routeDocument.title).toBe(title)
      expect(routeDocument.querySelector('[data-vite-error-overlay]')).toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )

  const routeDocument = requiredFrameDocument(frame)
  await settleDocument(routeDocument)
  return {
    document: routeDocument,
    view: requiredFrameWindow(frame),
  }
}

async function assertRouteHealthy(
  document: Document,
  capture: FrameErrorCapture
) {
  await settleDocument(document)
  expect(capture.errors, 'Public route runtime errors').toEqual([])
}

async function settleDocument(document: Document) {
  const view = document.defaultView
  if (!view) throw new Error('Public route document has no window')
  await document.fonts.ready
  await new Promise<void>((resolve) => {
    view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))
  })
}

function click(document: Document, selector: string) {
  required<HTMLElement>(document, selector).click()
}

function primaryNavHrefs(document: Document) {
  const base = document.defaultView?.location.href
  if (!base) throw new Error('Public route document has no location')
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      '.home-nav > a.home-nav-link'
    ),
    (link) => new URL(link.getAttribute('href') ?? '', base).pathname
  )
}

function required<T extends Element = HTMLElement>(
  document: Document,
  selector: string
) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing public route element: ${selector}`)
  return element
}

function requiredFrameWindow(target: HTMLIFrameElement | null) {
  if (!target?.contentWindow) throw new Error('Public route iframe has no window')
  return target.contentWindow
}

function requiredFrameDocument(target: HTMLIFrameElement | null) {
  if (!target?.contentDocument) {
    throw new Error('Public route iframe has no document')
  }
  return target.contentDocument
}

interface FrameErrorCapture {
  errors: string[]
  restore(): void
}

function captureRouteErrors(view: Window, phase: string): FrameErrorCapture {
  const errors: string[] = []
  const capturePageError = (event: ErrorEvent) => {
    errors.push(
      `${phase} page error: ${formatDiagnosticValue(event.error ?? event.message)}`
    )
  }
  const captureUnhandledRejection = (event: PromiseRejectionEvent) => {
    errors.push(
      `${phase} unhandled rejection: ${formatDiagnosticValue(event.reason)}`
    )
  }
  view.addEventListener('error', capturePageError)
  view.addEventListener('unhandledrejection', captureUnhandledRejection)
  const frameConsole = (view as Window & { console: Console }).console
  const originalError = frameConsole.error
  const captureConsoleError: Console['error'] = (...args: unknown[]) => {
    errors.push(
      `${phase} console.error: ${args.map(formatDiagnosticValue).join(' ')}`
    )
    originalError.apply(frameConsole, args)
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
      return summary && !stack.includes(summary) ? `${summary}\n${stack}` : stack
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
