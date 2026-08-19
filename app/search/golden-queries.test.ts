import { describe, expect, test } from 'vitest'
import {
  goldenBehaviorCases,
  goldenRankingQueries,
  goldenSafetyQueries,
  goldenSearchDocuments,
  goldenStructuredQueries,
} from './golden-queries.ts'

describe('search relevance contract', () => {
  test('uses stable result identifiers and includes a duplicate destination', () => {
    const ids = goldenSearchDocuments.map((document) => document.id)
    const destinationIds = goldenSearchDocuments.map(
      (document) => document.destinationId
    )

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(destinationIds).size).toBeLessThan(destinationIds.length)
  })

  test('covers every required relevance category with a valid target', () => {
    const documentIds = new Set(
      goldenSearchDocuments.map((document) => document.id)
    )
    const categories = new Set(
      goldenRankingQueries.map((query) => query.category)
    )

    expect(categories).toEqual(
      new Set([
        'exact-english',
        'exact-hebrew',
        'hebrew-nikkud',
        'separator-variant',
        'transliteration-alias',
        'abbreviation',
        'single-character-typo',
        'structured-aliyah',
        'structured-page',
      ])
    )
    expect(
      goldenRankingQueries.every((query) => documentIds.has(query.expectedId))
    ).toBe(true)
  })

  test('locks structured and hostile-input coverage', () => {
    expect(goldenStructuredQueries.map(({ expected }) => expected.kind)).toEqual([
      'aliyah',
      'aliyah',
      'page',
      'page',
      'reference',
    ])
    expect(goldenSafetyQueries).toContain('[')
    expect(goldenSafetyQueries).toContain('')
    expect(goldenBehaviorCases.map(({ category }) => category)).toEqual([
      'empty-query-order',
      'duplicate-destination',
      'coverage-filter-composition',
      'hostile-input',
    ])
  })
})
