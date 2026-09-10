import { expect, test } from 'vitest'
import { createWaveformSummary } from './waveform-summary.ts'

test.each([16_000, 44_100, 48_000])('keeps 10 ms peaks on the %i Hz sample clock', (sampleRate) => {
  const samples = new Float32Array(sampleRate)
  samples[Math.round(sampleRate / 2)] = 1
  const summary = createWaveformSummary({
    audioId: 'beresheet-1',
    sampleRate,
    channelData: [samples],
  })

  expect(summary.duration).toBe(1)
  expect(summary.sampleCount).toBe(sampleRate)
  expect(summary.stepSamples).toBe(sampleRate / 100)
  expect(summary.max).toHaveLength(100)
  expect(summary.max[50]).toBe(1)
  expect(summary.max[49]).toBe(0)
  expect(summary.max[51]).toBe(0)
})

test('preserves sharp onsets and quiet detail without rounding or smoothing', () => {
  const samples = new Float32Array(30).fill(0.0002)
  samples[15] = 1
  samples[19] = -0.75
  const summary = createWaveformSummary({
    audioId: 'transient',
    sampleRate: 1000,
    channelData: [samples],
  })

  expect(summary.max[1]).toBe(1)
  expect(summary.min[1]).toBe(-0.75)
  expect(summary.max[0]).toBeCloseTo(0.0002, 7)
  expect(summary.max[2]).toBeCloseTo(0.0002, 7)
})

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

test('keeps the final partial bin without padding or stretching its duration', () => {
  const summary = createWaveformSummary({
    audioId: 'short-tail',
    sampleRate: 1000,
    channelData: [new Float32Array(10).fill(0.25), new Float32Array(11).fill(0.75)],
  })
  expect(summary.duration).toBe(0.011)
  expect(summary.sampleCount).toBe(11)
  expect([...summary.min]).toEqual([0.25, 0.75])
  expect([...summary.max]).toEqual([0.75, 0.75])
})

test('represents silence and empty audio without invented peaks', () => {
  const silent = createWaveformSummary({
    audioId: 'silent', sampleRate: 1000, channelData: [new Float32Array(20)],
  })
  expect([...silent.min]).toEqual([0, 0])
  expect([...silent.max]).toEqual([0, 0])
  const summary = createWaveformSummary({
    audioId: 'empty',
    sampleRate: 1000,
    channelData: [],
  })
  expect(summary.duration).toBe(0)
  expect(summary.min).toHaveLength(0)
  expect(summary.max).toHaveLength(0)
})

test('rejects invalid sample clocks and non-finite audio explicitly', () => {
  for (const sampleRate of [0, -1, Infinity, NaN]) {
    expect(() => createWaveformSummary({
      audioId: 'invalid', sampleRate, channelData: [],
    })).toThrow('sample rate')
  }
  expect(() => createWaveformSummary({
    audioId: 'invalid', sampleRate: 1000, channelData: [Float32Array.of(NaN)],
  })).toThrow('non-finite sample')
})
