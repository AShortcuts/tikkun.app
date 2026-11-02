import { describe, expect, test } from 'vitest'
import { readingCoverage } from '$lib/readings'
import { createReadingCoverageSearch } from './reading-coverage-search.ts'

const search = createReadingCoverageSearch(readingCoverage)

describe('public reading coverage search adapter', () => {

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
    const planned = search.search('Noach', 'planned')
    expect(planned.map(({ document }) => document.item.parshaSlug)).not.toContain('noach')
    expect(planned.every(({ document }) => document.item.statusKind === 'planned')).toBe(true)
    expect(search.search('Noach', 'audio')[0]?.document.item.parshaSlug).toBe(
      'noach'
    )
  })
})
