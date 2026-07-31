import { expect, test } from 'vitest'
import {
  cueWaveformTimeRatio,
  getCenteredCueWaveformWindow,
  getCueWaveformWindowBars,
  getFollowedCueWaveformWindow,
} from './cue-waveform.ts'

test('centers, follows, and clamps the visible waveform window', () => {
  expect(getCenteredCueWaveformWindow(50, 100)).toEqual({
    start: 38,
    end: 62,
    zoomed: true,
  })
  expect(getCenteredCueWaveformWindow(2, 100)).toEqual({
    start: 0,
    end: 24,
    zoomed: true,
  })

  const previousWindow = { start: 20, end: 44, zoomed: true }
  expect(
    getFollowedCueWaveformWindow({
      previousWindow,
      focusTime: 32,
      duration: 100,
    })
  ).toBe(previousWindow)
  expect(
    getFollowedCueWaveformWindow({
      previousWindow,
      focusTime: 43,
      duration: 100,
    })
  ).toEqual({ start: 29, end: 53, zoomed: true })
})

test('maps visible time and summary samples into stable waveform bars', () => {
  const window = { start: 10, end: 30, zoomed: true }
  expect(cueWaveformTimeRatio(10, window)).toBe(0)
  expect(cueWaveformTimeRatio(20, window)).toBe(0.5)
  expect(cueWaveformTimeRatio(30, window)).toBe(1)
  expect(cueWaveformTimeRatio(31, window)).toBeNull()

  const bars = getCueWaveformWindowBars(
    {
      audioId: 'recording',
      duration: 40,
      buckets: [0, 0.25, 0.75, 1],
    },
    window,
    40
  )
  expect(bars).toHaveLength(160)
  expect(bars.every((bar) => Number.isFinite(bar))).toBe(true)
  expect(Math.min(...bars)).toBeGreaterThanOrEqual(0)
  expect(Math.max(...bars)).toBeLessThanOrEqual(1)
  expect(getCueWaveformWindowBars(
    { audioId: 'empty', duration: 0, buckets: [] },
    window,
    40
  )).toEqual([])
})
