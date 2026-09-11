import { expect, test } from 'vitest'
import { scheduleJSON, type SystemReading } from './system-calendar.ts'
import { readingHashFromNativeUrl } from './native-reading-links.ts'

test('system schedule preserves real holiday readings and valid app links', () => {
  const readings: SystemReading[] = JSON.parse(scheduleJSON('2026-09-10', false))
  expect(readings[0].day).toBe('2026-09-12')
  expect(readings[0].name).toContain('Rosh Hashana')
  expect(readings[0].references[0]).toContain('Genesis 21:')
  for (const reading of readings) {
    expect(readingHashFromNativeUrl(`tikkunreader://reader/${reading.hash}`)).toBe(reading.hash)
    expect(reading.references.length).toBeGreaterThan(0)
  }
})

test('system schedule follows the app Israel/Diaspora setting', () => {
  const israel: SystemReading[] = JSON.parse(scheduleJSON('2026-05-23', true))
  const diaspora: SystemReading[] = JSON.parse(scheduleJSON('2026-05-23', false))
  expect(israel[0].name).not.toBe(diaspora[0].name)
  expect(israel[0].day).toBe(diaspora[0].day)
})

test('widget links reject credentials, unrelated destinations and malformed references', () => {
  for (const url of ['tikkunreader://evil/#/torah/page/1', 'tikkunreader://user@reader/#/torah/page/1', 'tikkunreader://reader:42/#/torah/page/1', 'tikkunreader://reader/#/about', 'tikkunreader://reader/extra/#/torah/page/1']) {
    expect(readingHashFromNativeUrl(url)).toBeNull()
  }
})
