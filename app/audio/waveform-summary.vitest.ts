import { expect, test } from 'vitest'
import { createWaveformSummary } from './waveform-summary.ts'

test('retains opposite-phase stereo peaks instead of cancelling the channels', () => {
  const summary = createWaveformSummary({
    audioId: 'stereo',
    sampleRate: 200,
    channelData: [
      Float32Array.from([0.5, 0.25, 1, 0]),
      Float32Array.from([-0.5, -0.25, -1, 0]),
    ],
  })

  expect([...summary.min]).toEqual([-0.5, -1])
  expect([...summary.max]).toEqual([0.5, 1])
})
