import { expect, test } from 'vitest'
import { createWaveformSummary } from '../audio/waveform-summary.ts'
import {
  cueWaveformTimeRatio,
  getCenteredCueWaveformWindow,
  getCueWaveformWindowColumns,
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

test('maps visible timestamps including recordings shorter than one second', () => {
  const window = { start: 10, end: 30, zoomed: true }
  expect(cueWaveformTimeRatio(10, window)).toBe(0)
  expect(cueWaveformTimeRatio(20, window)).toBe(0.5)
  expect(cueWaveformTimeRatio(30, window)).toBe(1)
  expect(cueWaveformTimeRatio(31, window)).toBeNull()
  expect(cueWaveformTimeRatio(0.25, { start: 0, end: 0.5, zoomed: false })).toBe(0.5)
  expect(cueWaveformTimeRatio(NaN, window)).toBeNull()
})

test('keeps a brief onset at the same time across overview, zoom, and longer media metadata', () => {
  const samples = new Float32Array(4000)
  samples[2000] = 1
  samples[2001] = -0.75
  const summary = createWaveformSummary({ audioId: 'onset', sampleRate: 1000, channelData: [samples] })
  const overview = getCueWaveformWindowColumns(summary, { start: 0, end: 4, zoomed: false }, 40)
  expect(overview[19]).toEqual({ min: 0, max: 0 })
  expect(overview[20]).toEqual({ min: -0.75, max: 1 })
  expect(overview[21]).toEqual({ min: 0, max: 0 })
  const zoom = getCueWaveformWindowColumns(summary, { start: 1, end: 3, zoomed: true }, 200)
  expect(zoom[100]).toEqual({ min: -0.75, max: 1 })
  const longerTimeline = getCueWaveformWindowColumns(summary, { start: 0, end: 8, zoomed: false }, 80)
  expect(longerTimeline[20]).toEqual({ min: -0.75, max: 1 })
  expect(longerTimeline.slice(40).every(column => column.min === 0 && column.max === 0)).toBe(true)
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
