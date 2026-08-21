export const BUILD_IDENTIFIER = __TIKKUN_BUILD_ID__

export type SupportIncidentCode =
  | 'client-navigation-error'
  | 'console-error'
  | 'uncaught-error'
  | 'unhandled-rejection'

type SupportSurface = 'reader' | 'public-site'
type SupportBrowser = 'chromium' | 'firefox' | 'safari' | 'other'
type SupportPlatform =
  | 'android'
  | 'ios'
  | 'linux'
  | 'macos'
  | 'windows'
  | 'other'
type SupportErrorType =
  | 'Error'
  | 'NonError'
  | 'NotAllowedError'
  | 'QuotaExceededError'
  | 'RangeError'
  | 'ReferenceError'
  | 'SecurityError'
  | 'SyntaxError'
  | 'TypeError'
  | 'UnknownError'

export interface SupportRecentError {
  readonly occurredAt: string
  readonly code: SupportIncidentCode
  readonly errorType: SupportErrorType
}

export interface SupportReport {
  readonly format: 'tikkun.support-diagnostics'
  readonly buildIdentifier: string
  readonly generatedAt: string
  readonly environment: {
    readonly browser: SupportBrowser
    readonly platform: SupportPlatform
    readonly viewport: 'compact' | 'wide'
    readonly displayMode: 'browser' | 'standalone'
    readonly online: boolean
    readonly surface: SupportSurface
  }
  readonly recentErrors: readonly SupportRecentError[]
  readonly droppedErrors: number
  readonly privacy: {
    readonly localOnly: true
    readonly capturedContent: false
  }
}

export interface SupportDiagnostics {
  readonly buildIdentifier: string
  start(options: { view: Window; console?: Console }): () => void
  record(code: SupportIncidentCode, error?: unknown): void
  snapshot(view?: Window): SupportReport
  copy(view?: Window): Promise<void>
  download(view?: Window): void
}

interface ActiveCapture {
  readonly view: Window
  readonly console: Console
  readonly originalConsoleError: Console['error']
  readonly capturedConsoleError: Console['error']
  readonly handleError: (event: ErrorEvent) => void
  readonly handleRejection: (event: PromiseRejectionEvent) => void
}

type DownloadWindow = Window & {
  Blob?: typeof Blob
  URL?: typeof URL
}

const DEFAULT_RECENT_ERROR_LIMIT = 20
const SAFE_ERROR_TYPES = new Set<SupportErrorType>([
  'Error',
  'NotAllowedError',
  'QuotaExceededError',
  'RangeError',
  'ReferenceError',
  'SecurityError',
  'SyntaxError',
  'TypeError',
])

export function createSupportDiagnostics({
  buildIdentifier,
  recentErrorLimit = DEFAULT_RECENT_ERROR_LIMIT,
  now = () => new Date(),
}: {
  buildIdentifier: string
  recentErrorLimit?: number
  now?: () => Date
}): SupportDiagnostics {
  if (!buildIdentifier) throw new Error('A build identifier is required')
  if (!Number.isInteger(recentErrorLimit) || recentErrorLimit < 1) {
    throw new Error('The recent error limit must be a positive integer')
  }

  const recentErrors: SupportRecentError[] = []
  let droppedErrors = 0
  let activeCapture: ActiveCapture | null = null

  const currentView = (requested?: Window) => {
    const view =
      requested ??
      activeCapture?.view ??
      (typeof window === 'undefined' ? null : window)
    if (!view) throw new Error('A browser window is required')
    return view
  }

  const record = (code: SupportIncidentCode, error?: unknown) => {
    recentErrors.push({
      occurredAt: now().toISOString(),
      code,
      errorType: classifyError(error),
    })
    if (recentErrors.length > recentErrorLimit) {
      recentErrors.shift()
      droppedErrors += 1
    }
  }

  const stopCapture = (capture: ActiveCapture) => {
    capture.view.removeEventListener('error', capture.handleError)
    capture.view.removeEventListener(
      'unhandledrejection',
      capture.handleRejection
    )
    if (capture.console.error === capture.capturedConsoleError) {
      capture.console.error = capture.originalConsoleError
    }
    if (activeCapture === capture) activeCapture = null
  }

  const diagnostics: SupportDiagnostics = {
    buildIdentifier,

    start({ view, console: consoleAdapter = globalThis.console }) {
      if (activeCapture) stopCapture(activeCapture)

      const originalConsoleError = consoleAdapter.error
      const capturedConsoleError: Console['error'] = (...data: unknown[]) => {
        record('console-error', findError(data))
        Reflect.apply(originalConsoleError, consoleAdapter, data)
      }
      const capture: ActiveCapture = {
        view,
        console: consoleAdapter,
        originalConsoleError,
        capturedConsoleError,
        handleError: (event) => record('uncaught-error', event.error),
        handleRejection: (event) =>
          record('unhandled-rejection', event.reason),
      }
      activeCapture = capture
      view.addEventListener('error', capture.handleError)
      view.addEventListener('unhandledrejection', capture.handleRejection)
      consoleAdapter.error = capturedConsoleError

      let released = false
      return () => {
        if (released) return
        released = true
        stopCapture(capture)
      }
    },

    record,

    snapshot(requestedView) {
      const view = currentView(requestedView)
      return {
        format: 'tikkun.support-diagnostics',
        buildIdentifier,
        generatedAt: now().toISOString(),
        environment: readEnvironment(view),
        recentErrors: recentErrors.map((entry) => ({ ...entry })),
        droppedErrors,
        privacy: {
          localOnly: true,
          capturedContent: false,
        },
      }
    },

    async copy(requestedView) {
      const view = currentView(requestedView)
      if (!view.navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable')
      }
      await view.navigator.clipboard.writeText(
        serialize(diagnostics.snapshot(view))
      )
    },

    download(requestedView) {
      const view = currentView(requestedView)
      const downloadView = view as DownloadWindow
      if (
        typeof downloadView.Blob !== 'function' ||
        typeof downloadView.URL?.createObjectURL !== 'function' ||
        typeof downloadView.URL.revokeObjectURL !== 'function'
      ) {
        throw new Error('File downloads are unavailable')
      }

      const objectUrl = downloadView.URL.createObjectURL(
        new downloadView.Blob([serialize(diagnostics.snapshot(view))], {
          type: 'application/json',
        })
      )
      const link = view.document.createElement('a')
      link.href = objectUrl
      link.download = `tikkun-support-${safeFilePart(buildIdentifier)}.json`
      link.hidden = true
      view.document.body.append(link)
      link.click()
      link.remove()
      view.setTimeout(() => downloadView.URL?.revokeObjectURL(objectUrl), 0)
    },
  }

  return diagnostics
}

function serialize(report: SupportReport) {
  return `${JSON.stringify(report, null, 2)}\n`
}

function safeFilePart(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80)
}

function findError(values: readonly unknown[]) {
  return values.find(
    (value) => value instanceof Error || value instanceof DOMException
  )
}

function classifyError(error: unknown): SupportErrorType {
  if (!(error instanceof Error) && !(error instanceof DOMException)) {
    return error == null ? 'UnknownError' : 'NonError'
  }
  const name = error.name as SupportErrorType
  return SAFE_ERROR_TYPES.has(name) ? name : 'UnknownError'
}

function readEnvironment(view: Window): SupportReport['environment'] {
  const userAgent = view.navigator.userAgent
  return {
    browser: classifyBrowser(userAgent),
    platform: classifyPlatform(userAgent),
    viewport: view.innerWidth <= 870 ? 'compact' : 'wide',
    displayMode: safeMediaMatch(view, '(display-mode: standalone)')
      ? 'standalone'
      : 'browser',
    online: view.navigator.onLine,
    surface: view.location.pathname.includes('/reader/')
      ? 'reader'
      : 'public-site',
  }
}

function safeMediaMatch(view: Window, query: string) {
  try {
    return view.matchMedia(query).matches
  } catch {
    return false
  }
}

function classifyBrowser(userAgent: string): SupportBrowser {
  if (/FxiOS\/|Firefox\//i.test(userAgent)) return 'firefox'
  if (/EdgiOS\/|EdgA\/|Edg\/|CriOS\/|Chrome\/|Chromium\//i.test(userAgent)) {
    return 'chromium'
  }
  if (/Safari\//i.test(userAgent)) return 'safari'
  return 'other'
}

function classifyPlatform(userAgent: string): SupportPlatform {
  if (/Android/i.test(userAgent)) return 'android'
  if (/iPhone|iPad|iPod|Macintosh.*Mobile\//i.test(userAgent)) return 'ios'
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos'
  if (/Windows/i.test(userAgent)) return 'windows'
  if (/Linux/i.test(userAgent)) return 'linux'
  return 'other'
}

export const supportDiagnostics = createSupportDiagnostics({
  buildIdentifier: BUILD_IDENTIFIER,
})
