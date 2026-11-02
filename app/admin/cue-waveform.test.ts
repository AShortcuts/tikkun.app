import { expect, test } from 'vitest'
import { createWaveformSummary } from '../audio/waveform-summary.ts'
import { getCenteredCueWaveformWindow, getCueWaveformWindowColumns, getFollowedCueWaveformWindow } from './cue-waveform.ts'

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

test('includes all bins under a pixel without interpolation or missing the last sample', () => {
  const samples = new Float32Array(103)
  samples[12] = 0.5
  samples[42] = -1
  samples[102] = 0.75
  const summary = createWaveformSummary({ audioId: 'peaks', sampleRate: 1000, channelData: [samples] })
  expect(getCueWaveformWindowColumns(summary, { start: 0, end: 0.2, zoomed: false }, 2))
    .toEqual([{ min: -1, max: 0.5 }, { min: 0, max: 0.75 }])
  expect(getCueWaveformWindowColumns(summary, { start: 0.103, end: 0.2, zoomed: true }, 1))
    .toEqual([{ min: 0, max: 0 }])
  expect(getCueWaveformWindowColumns(summary, { start: 0, end: 1, zoomed: false }, 0)).toEqual([])
})
