import { describe, expect, test } from 'vitest'
import { readingCoverage } from '$lib/readings'
import { createReadingCoverageSearch } from './reading-coverage-search.ts'

const search = createReadingCoverageSearch(readingCoverage)

describe('public reading coverage search adapter', () => {
  test('preserves catalog order for empty queries', () => {
    expect(
      search
        .search('', 'all')
        .map(({ document }) => document.item.parshaName)
    ).toEqual(readingCoverage.map(({ parshaName }) => parshaName))
  })

  test('finds English, Hebrew, nikkud, aliases, and typos', () => {
    for (const query of [
      'beresheet',
      'בראשית',
      'בְּרֵאשִׁית',
      'bereshhet',
    ]) {
      expect(search.search(query, 'all')[0]?.document.item.parshaSlug).toBe(
        'beresheet'
      )
    }
    expect(search.search('Noah', 'all')[0]?.document.item.parshaSlug).toBe(
      'noach'
    )
  })

  test('composes status filters with ranked search', () => {
    expect(
      search
        .search('', 'audio')
        .every(({ document }) => document.item.availableAliyot.length > 0)
    ).toBe(true)
    expect(search.search('Noach', 'planned')).toEqual([])
    expect(search.search('Noach', 'audio')[0]?.document.item.parshaSlug).toBe(
      'noach'
    )
  })

  test('handles arbitrary punctuation without throwing', () => {
    expect(() => search.search('[', 'all')).not.toThrow()
    expect(search.search('[', 'all')).toEqual([])
  })
})
