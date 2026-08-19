import { HDate } from '@hebcal/hdate'
import { describe, expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { createReadingSearch } from './reading-search.ts'

const settings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}
const generator = new LeiningGenerator(settings)
const leinings = generator
  .forEntireChumash(new HDate(new Date(2026, 7, 10)))
  .flatMap((date) => date.leinings)
const search = createReadingSearch(leinings)

describe('reading search adapter', () => {
  test('finds canonical, Hebrew, nikkud, alias, and typo forms', () => {
    expect(search.search('beresheet')[0]?.href).toBe(
      '#/torah/parsha/beresheet'
    )
    expect(search.search('בראשית')[0]?.href).toBe(
      '#/torah/parsha/beresheet'
    )
    expect(search.search('בְּרֵאשִׁית')[0]?.href).toBe(
      '#/torah/parsha/beresheet'
    )
    expect(search.search('Noah')[0]?.href).toBe('#/torah/parsha/noach')
    expect(search.search('Bereshhet')[0]?.href).toBe(
      '#/torah/parsha/beresheet'
    )
  })

  test('exposes the alias that produced a result', () => {
    const result = search.search('beresheet')[0]

    expect(result?.englishLabel).toContain('Bereshit')
    expect(result?.matchedAlias).toBe('beresheet')
  })

  test('resolves structured aliyah and reference queries', () => {
    expect(search.search('Noach 3')[0]).toMatchObject({
      href: '#/torah/parsha/noach/1-7-17',
      englishLabel: 'Parshat Noach',
      hebrewLabel: 'נח',
      detailLabel: 'Aliyah 3 · נח',
    })
    expect(search.search('נח ג׳')[0]?.href).toBe(
      '#/torah/parsha/noach/1-7-17'
    )
    expect(search.search('Genesis 6:9')[0]).toMatchObject({
      id: 'reference.1.6.9',
      href: '#/r/1-6-9',
      englishLabel: 'Genesis 6:9',
      detailLabel: 'בראשית 6:9',
    })
    expect(search.search('Genesis 999:1')).toEqual([])
  })

  test('resolves Maftir only to readings that contain it', () => {
    const results = search.search('Maftir')

    expect(results.length).toBeGreaterThan(0)
    expect(results.every(({ href }) => /\/\d+-\d+-\d+$/.test(href))).toBe(true)
  })

  test('finds double portions and holiday service aliases', () => {
    expect(search.search('Vayakhel Pekudei')[0]?.englishLabel).toMatch(
      /Vayakhel.*Pekudei/i
    )
    const fastDay = search.search('Tishah B’Av 3')[0]
    expect(fastDay?.englishLabel).toMatch(/Tish.*B.*Av/i)
    expect(fastDay?.href).toMatch(/^#\/run\/.+\/\d+-\d+-\d+$/)
  })

  test('keeps routing metadata out of visible regular-reading labels', () => {
    const result = search.search('Noach')[0]

    expect(result?.hebrewLabel).toBe('נח')
    expect(result?.detailLabel).toBe('נח')
    expect(`${result?.englishLabel} ${result?.detailLabel}`).not.toMatch(
      /shacharit|שחרית/i
    )
  })

  test('handles hostile punctuation and empty input safely', () => {
    expect(() => search.search('[')).not.toThrow()
    expect(search.search('[')).toEqual([])
    expect(search.search('')).toEqual([])
    expect(search.search('not-a-real-reading-name')).toEqual([])
  })
})
