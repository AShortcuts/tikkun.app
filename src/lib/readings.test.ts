import { expect, test } from 'vitest'
import {
  availableReadings,
  coverageSummary,
  getRequiredReading,
  readingCoverage,
} from './readings.ts'

test('builds public coverage from the real catalog and maintained tracker', () => {
  expect(readingCoverage).toHaveLength(56)
  expect(coverageSummary).toEqual({
    readingsWithAudio: 10,
    availableAliyot: 70,
    syncedReadings: 7,
  })
  expect(availableReadings.every((reading) => reading.availableAliyot.length > 0)).toBe(
    true
  )
})

test('keeps public status language separate from internal tracker wording', () => {
  expect(getRequiredReading('beresheet').statusLabel).toBe('Word sync ready')
  expect(getRequiredReading('vayetzei').statusLabel).toBe('Sync in progress')
  expect(getRequiredReading('nasso').statusLabel).toBe('Recording review')
  expect(readingCoverage.map((reading) => reading.statusLabel)).not.toContain(
    'Redo, please'
  )
})

test('fails the build-facing lookup when a featured reading is absent', () => {
  expect(() => getRequiredReading('not-a-reading')).toThrow(
    'Public reading catalog is missing not-a-reading'
  )
})
