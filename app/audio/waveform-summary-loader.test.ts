import { expect, test, vi } from 'vitest'
import type { WaveformSummary } from './waveform-summary.ts'
import { WaveformSummaryLoader } from './waveform-summary-loader.ts'

const summary: WaveformSummary = {
  audioId: 'recording',
  duration: 10,
  sampleRate: 100,
  sampleCount: 1000,
  stepSamples: 1,
  min: new Float32Array(1000),
  max: new Float32Array(1000),
}

test('deduplicates a pending waveform load and caches success', async () => {
  let resolve: (value: WaveformSummary) => void = () => {
    throw new Error('Waveform load was not started')
  }
  const load = vi.fn(() => new Promise<WaveformSummary>((done) => {
    resolve = done
  }))
  const loader = new WaveformSummaryLoader(load)

  const first = loader.load('recording:v1')
  const second = loader.load('recording:v1')
  resolve(summary)

  await expect(first).resolves.toBe(summary)
  await expect(second).resolves.toBe(summary)
  await expect(loader.load('recording:v1')).resolves.toBe(summary)
  expect(load).toHaveBeenCalledTimes(1)
})

test('retains failure until an explicit retry', async () => {
  const load = vi.fn()
    .mockRejectedValueOnce(new Error('decode failed'))
    .mockResolvedValueOnce(summary)
  const loader = new WaveformSummaryLoader(load)

  await expect(loader.load('recording:v1')).resolves.toBeNull()
  await expect(loader.load('recording:v1')).resolves.toBeNull()
  expect(load).toHaveBeenCalledTimes(1)
  expect(loader.state('recording:v1').status).toBe('failed')

  await expect(loader.retry('recording:v1')).resolves.toBe(summary)
  expect(load).toHaveBeenCalledTimes(2)
})

test('cancels obsolete pending work', async () => {
  let aborted = false
  const loader = new WaveformSummaryLoader((signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => {
      aborted = true
      resolve(summary)
    })
  }))

  const pending = loader.load('recording:v1')
  loader.cancelExcept('recording:v2')

  await expect(pending).resolves.toBeNull()
  expect(aborted).toBe(true)
  expect(loader.state('recording:v1')).toEqual({ status: 'idle' })
})

test('a cancelled request cannot erase its replacement while it is loading', async () => {
  const first = Promise.withResolvers<WaveformSummary>()
  const replacement = Promise.withResolvers<WaveformSummary>()
  const load = vi.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(replacement.promise)
  const loader = new WaveformSummaryLoader(load)
  const cancelled = loader.load('recording:v1')
  const retry = loader.retry('recording:v1')
  first.reject(new DOMException('Cancelled', 'AbortError'))
  await expect(cancelled).resolves.toBeNull()
  expect(loader.state('recording:v1')).toEqual({ status: 'loading' })
  expect(loader.load('recording:v1')).toBe(retry)
  replacement.resolve(summary)
  await expect(retry).resolves.toBe(summary)
  expect(load).toHaveBeenCalledTimes(2)
})
