import { expect, test } from 'vitest'
import {
  availableReadings,
  coverageSummary,
  filterReadingCoverage,
  getReadingAvailabilitySummary,
  getRequiredReading,
  readingCoverage,
} from './readings.ts'

test('builds public coverage from generated recordings and cue data', () => {
  expect(readingCoverage).toHaveLength(56)
  expect(coverageSummary).toEqual({
    readingsWithAudio: 10,
    availableAliyot: 70,
    syncedReadings: 5,
  })
  expect(availableReadings.every((reading) => reading.availableAliyot.length > 0)).toBe(
    true
  )
  expect(availableReadings.every((reading) => reading.aliyot.length === 7)).toBe(true)
  expect(
    readingCoverage
      .filter((reading) => reading.statusKind === 'ready')
      .every((reading) =>
        reading.aliyot.every(
          (aliyah) => aliyah.audioId !== null && aliyah.cueStatus === 'cued'
        )
      )
  ).toBe(true)
})

test('projects published cue states and canonical aliyah links without cue payloads', () => {
  const beresheet = getRequiredReading('beresheet')
  const behalotecha = getRequiredReading('behalotecha')

  expect(beresheet.aliyot[0]).toMatchObject({
    audioId: 'beresheet-1',
    cueStatus: 'cued',
  })
  expect(behalotecha.aliyot[0]).toMatchObject({
    audioId: 'behalotecha-1',
    cueStatus: 'missing',
  })
  expect(beresheet.aliyot.every((aliyah) =>
    /^#\/torah\/parsha\/beresheet\/\d+-\d+-\d+$/.test(aliyah.readerHash)
  )).toBe(true)
})

test('filters coverage by practical status and English or Hebrew name', () => {
  expect(filterReadingCoverage(readingCoverage, 'beresh', 'all')).toHaveLength(1)
  expect(filterReadingCoverage(readingCoverage, 'בראשית', 'all')).toHaveLength(1)
  expect(
    filterReadingCoverage(readingCoverage, '', 'audio').every(
      (reading) => reading.availableAliyot.length > 0
    )
  ).toBe(true)
  expect(
    filterReadingCoverage(readingCoverage, '', 'active').every((reading) =>
      ['progress', 'review'].includes(reading.statusKind)
    )
  ).toBe(true)
})

test('uses manual rows only for active work while generated cues decide readiness', () => {
  expect(getRequiredReading('beresheet').statusLabel).toBe('Word sync ready')
  expect(getRequiredReading('vayetzei').statusLabel).toBe('Sync in progress')
  expect(getRequiredReading('nasso').statusLabel).toBe('Recording review')
  expect(getRequiredReading('behalotecha').statusLabel).toBe('Audio available')
  expect(getRequiredReading('vayelech').statusLabel).toBe('Audio available')
  expect(readingCoverage.map((reading) => reading.statusLabel)).not.toContain(
    'Needs review'
  )
})

test('derives featured-reading copy from generated availability and cue truth', () => {
  expect(getReadingAvailabilitySummary(getRequiredReading('beresheet'))).toEqual({
    aliyahLabel: 'All seven aliyot available',
    statusLabel: 'All aliyot ready',
  })
  expect(
    getReadingAvailabilitySummary(getRequiredReading('behalotecha'))
  ).toEqual({
    aliyahLabel: 'All seven aliyot available',
    statusLabel: 'Audio available',
  })
})

test('fails the build-facing lookup when a featured reading is absent', () => {
  expect(() => getRequiredReading('not-a-reading')).toThrow(
    'Public reading catalog is missing not-a-reading'
  )
})
