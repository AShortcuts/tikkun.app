import { expect, test } from 'vitest'
import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { upcomingPrintReadings } from './upcoming-print-readings.ts'
import { normalizeRanges, passageTitle, validateRanges } from './print-model.ts'
import { verseRangeLabel } from '../components/verse-range-label.ts'

const generator = (israel = false) => new LeiningGenerator({ israel, includeModernHolidays: false, ashkenazi: true })

test('lists ten dated Torah readings from today, with exact combined ranges including additional scrolls', () => {
  const today = new Date(2026, 8, 29, 15)
  const readings = upcomingPrintReadings(generator(), today)
  expect(readings).toHaveLength(10)
  expect(new Set(readings.map(reading => reading.id)).size).toBe(10)
  expect(readings[0].date).toEqual(new Date(2026, 8, 29))
  for (const [index, reading] of readings.entries()) {
    expect(reading.date.getTime()).toBeGreaterThanOrEqual(index ? readings[index - 1].date.getTime() : new Date(2026, 8, 29).getTime())
    const ranges = normalizeRanges(reading.context.aliyot)
    expect(() => validateRanges(ranges)).not.toThrow()
    expect(reading.rangeLabel).toBe(passageTitle(ranges))
    const source = generator().createLeiningDate(new HDate(reading.date))!
    const leining = source.leinings.find(leining => `${source.id}:${leining.id}` === reading.id)!
    expect(reading.context.aliyot.map(aliyah => ({ start: aliyah.start, end: aliyah.end }))).toEqual(leining.runs.filter(run => run.scroll === 'torah').flatMap(run => run.aliyot).map(({ start, end }) => ({ start, end })))
  }
  expect(readings.some(reading => new Set(reading.context.aliyot.map(aliyah => aliyah.start.b)).size > 1)).toBe(true)
})

test('crosses the Hebrew year boundary and respects Israel calendar settings', () => {
  const yearBoundary = upcomingPrintReadings(generator(), new Date(2026, 8, 5))
  expect(new HDate(yearBoundary[0].date).getFullYear()).toBeLessThan(new HDate(yearBoundary[9].date).getFullYear())
  const today = new Date(2026, 8, 29)
  const diaspora = upcomingPrintReadings(generator(), today)
  const israel = upcomingPrintReadings(generator(true), today)
  expect(israel).toHaveLength(10)
  expect(israel.map(reading => reading.id)).not.toEqual(diaspora.map(reading => reading.id))
})

test('print references reuse mobile aliyah chapter and verse formatting', () => {
  expect(verseRangeLabel({ start: { c: 6, v: 9 }, end: { c: 11, v: 32 } })).toBe('ו:ט-יא:לב')
  expect(verseRangeLabel({ start: { c: 7, v: 17 }, end: { c: 7, v: 24 } })).toBe('ז:יז-כד')
})
