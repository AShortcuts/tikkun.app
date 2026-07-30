import { expect, test } from 'vitest'
import { createWaveformSummary } from './waveform-summary.ts'

test('downsamples audio samples into RMS volume buckets', () => {
  const summary = createWaveformSummary({
    audioId: 'beresheet-1',
    duration: 4,
    channelData: [
      Float32Array.from([0, -0.5, 0.25, 1, -0.2, 0.1, -0.9, 0.4]),
    ],
    bucketCount: 4,
  })

  expect(summary.buckets).toEqual([0.354, 0.729, 0.158, 0.696])
})

test('does not let one transient make an otherwise quiet bucket look loud', () => {
  const summary = createWaveformSummary({
    audioId: 'transient',
    duration: 1,
    channelData: [Float32Array.from([1, 0, 0, 0])],
    bucketCount: 1,
  })

  expect(summary.buckets).toEqual([0.5])
})

test('includes the volume from every decoded channel', () => {
  const summary = createWaveformSummary({
    audioId: 'stereo',
    duration: 1,
    channelData: [
      Float32Array.from([0, 0]),
      Float32Array.from([1, 1]),
    ],
    bucketCount: 1,
  })

  expect(summary.buckets).toEqual([0.707])
})

test('returns empty buckets for silent or invalid input', () => {
  const summary = createWaveformSummary({
    audioId: 'empty',
    duration: 0,
    channelData: [],
    bucketCount: 3,
  })

  expect(summary.buckets).toEqual([0, 0, 0])
})
