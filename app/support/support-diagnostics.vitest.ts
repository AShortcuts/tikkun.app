import { afterEach, expect, test, vi } from 'vitest'
import {
  createSupportDiagnostics,
  type SupportDiagnostics,
} from './support-diagnostics.ts'

let stopCapture: (() => void) | null = null
let clipboardDescriptor: PropertyDescriptor | undefined

afterEach(() => {
  stopCapture?.()
  stopCapture = null
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
  clipboardDescriptor = undefined
})

test('keeps only bounded privacy-safe error categories', () => {
  let timestamp = 0
  const diagnostics = createSupportDiagnostics({
    buildIdentifier: 'test-build',
    recentErrorLimit: 2,
    now: () => new Date(timestamp++ * 1_000),
  })

  diagnostics.record('console-error', new Error('PRIVATE TORAH TEXT'))
  diagnostics.record(
    'unhandled-rejection',
    new DOMException('SECRET AUDIO ID', 'NotAllowedError')
  )
  diagnostics.record('client-navigation-error', {
    draft: 'PRIVATE CUE AUTHORING PAYLOAD',
  })

  const report = diagnostics.snapshot(window)
  const serialized = JSON.stringify(report)
  expect(report.recentErrors).toEqual([
    {
      occurredAt: '1970-01-01T00:00:01.000Z',
      code: 'unhandled-rejection',
      errorType: 'NotAllowedError',
    },
    {
      occurredAt: '1970-01-01T00:00:02.000Z',
      code: 'client-navigation-error',
      errorType: 'NonError',
    },
  ])
  expect(report.droppedErrors).toBe(1)
  expect(report.privacy).toEqual({
    localOnly: true,
    capturedContent: false,
  })
  expect(serialized).not.toContain('PRIVATE')
  expect(serialized).not.toContain('SECRET')
  expect(serialized).not.toContain(navigator.userAgent)
})

test('captures browser and console failures until released', () => {
  const originalConsoleError = vi.fn()
  const consoleAdapter = { error: originalConsoleError } as unknown as Console
  const target = new EventTarget()
  const view = Object.assign(target, {
    location: { pathname: '/reader/' },
  }) as unknown as Window
  const diagnostics = createSupportDiagnostics({
    buildIdentifier: 'capture-test',
  })
  stopCapture = diagnostics.start({ view, console: consoleAdapter })

  consoleAdapter.error('private prefix', new TypeError('private message'))
  target.dispatchEvent(
    new ErrorEvent('error', { error: new ReferenceError('private stack') })
  )
  target.dispatchEvent(
    new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: 'private rejection',
    })
  )

  expect(originalConsoleError).toHaveBeenCalledOnce()
  expect(diagnostics.snapshot(window).recentErrors).toMatchObject([
    { code: 'console-error', errorType: 'TypeError' },
    { code: 'uncaught-error', errorType: 'ReferenceError' },
    { code: 'unhandled-rejection', errorType: 'NonError' },
  ])

  stopCapture()
  stopCapture = null
  expect(consoleAdapter.error).toBe(originalConsoleError)
  target.dispatchEvent(new ErrorEvent('error', { error: new Error('ignored') }))
  expect(diagnostics.snapshot(window).recentErrors).toHaveLength(3)
})

test.each([
  [
    'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 CriOS/125.0 Safari/604.1',
    'chromium',
    'ios',
  ],
  [
    'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 FxiOS/126.0 Safari/605.1.15',
    'firefox',
    'ios',
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
    'safari',
    'ios',
  ],
] as const)('classifies coarse browser and platform facts', (userAgent, browser, platform) => {
  const diagnostics = createSupportDiagnostics({ buildIdentifier: 'ua-test' })
  const report = diagnostics.snapshot({
    navigator: { onLine: true, userAgent },
    innerWidth: 390,
    location: { pathname: '/reader/' },
    matchMedia: () => ({ matches: false }),
  } as unknown as Window)

  expect(report.environment).toMatchObject({
    browser,
    platform,
    viewport: 'compact',
    surface: 'reader',
  })
  expect(JSON.stringify(report)).not.toContain(userAgent)
})

test('copies and downloads the same report only after explicit action', async () => {
  vi.useFakeTimers()
  const diagnostics = createSupportDiagnostics({
    buildIdentifier: 'release-42',
    now: () => new Date('2026-08-19T12:00:00.000Z'),
  })
  const writeText = vi.fn(async () => {})
  clipboardDescriptor = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'clipboard'
  )
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:support-report')
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})

  await diagnostics.copy(window)
  diagnostics.download(window)

  const copied = readCopiedReport(writeText)
  expect(copied).toMatchObject({
    format: 'tikkun.support-diagnostics',
    buildIdentifier: 'release-42',
  })
  expect(createObjectURL).toHaveBeenCalledOnce()
  expect(click).toHaveBeenCalledOnce()
  await vi.runAllTimersAsync()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:support-report')
})

function readCopiedReport(writeText: ReturnType<typeof vi.fn>) {
  const serialized = writeText.mock.calls[0]?.[0]
  if (typeof serialized !== 'string') {
    throw new Error('Expected a serialized support report')
  }
  return JSON.parse(serialized) as ReturnType<SupportDiagnostics['snapshot']>
}
