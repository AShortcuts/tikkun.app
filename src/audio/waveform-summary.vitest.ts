import { expect, test } from 'vitest'
import { createWaveformSummary } from './waveform-summary.ts'

test('downsamples audio samples into peak buckets', () => {
  const summary = createWaveformSummary({
    audioId: 'bereshit-1',
    duration: 4,
    samples: Float32Array.from([0, -0.5, 0.25, 1, -0.2, 0.1, -0.9, 0.4]),
    bucketCount: 4,
  })

  expect(summary.buckets).toEqual([0.5, 1, 0.2, 0.9])
})

test('returns empty buckets for silent or invalid input', () => {
  const summary = createWaveformSummary({
    audioId: 'empty',
    duration: 0,
    samples: Float32Array.from([]),
    bucketCount: 3,
  })

  expect(summary.buckets).toEqual([0, 0, 0])
})
