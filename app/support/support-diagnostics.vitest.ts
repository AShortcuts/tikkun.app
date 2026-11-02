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

test('copies and downloads the same report only after explicit action', async () => {
  vi.useFakeTimers()
  const diagnostics = createSupportDiagnostics({
    buildIdentifier: 'release-42',
    releaseVersion: 'v2026.11-r3',
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
    releaseVersion: 'v2026.11-r3',
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
