import { describe, expect, test } from 'vitest'
import {
  goldenRankingQueries,
  goldenSafetyQueries,
  goldenSearchDocuments,
} from './golden-queries.ts'
import { normalizeSearchText } from './normalize.ts'
import {
  createSearchIndex,
  type SearchDocument,
  type StructuredSearchIntent,
} from './index.ts'

const documents: readonly SearchDocument<string>[] = goldenSearchDocuments.map(
  (document) => ({
    ...document,
    item: document.id,
    emptyPriority: 0,
  })
)

function canonicalReading(value: string | null) {
  if (!value) return null
  const normalized = normalizeSearchText(value).replace(/ /g, '-')
  return normalized === 'noah' ? 'noach' : normalized
}

function intentMatches(
  document: SearchDocument<string>,
  intent: StructuredSearchIntent
) {
  if (intent.kind === 'page') {
    return document.destinationId === `page.${intent.scroll}.${intent.page}`
  }
  if (intent.kind !== 'aliyah' || !intent.reading) return false
  const aliyah =
    intent.aliyah === 'Maftir' ? 'maftir' : String(intent.aliyah)
  return (
    document.destinationId ===
    `reading.${canonicalReading(intent.reading)}.${aliyah}`
  )
}

describe('shared search index', () => {
  test.each(goldenRankingQueries)(
    'keeps $category query $query within Top-$maxRank',
    ({ query, expectedId, maxRank }) => {
      const results = createSearchIndex(documents).search(query, {
        intentMatches,
        limit: 12,
      })
      const rank =
        results.findIndex(({ document }) => document.id === expectedId) + 1

      expect(rank).toBeGreaterThan(0)
      expect(rank).toBeLessThanOrEqual(maxRank)
    }
  )

  test('keeps rank bands stronger than any context boost', () => {
    const index = createSearchIndex([
      searchDocument('primary', 'Cue Analytics'),
      searchDocument('alias', 'Another Tool', ['Cue Analytics']),
    ])

    const results = index.search('Cue Analytics', {
      contextBoost: ({ id }) => (id === 'alias' ? 1_000_000 : 0),
    })

    expect(results.map(({ document }) => document.id)).toEqual([
      'primary',
      'alias',
    ])
    expect(results.map(({ band }) => band)).toEqual([
      'exact-primary',
      'exact-alias',
    ])
  })

  test('deduplicates destinations before applying the result limit', () => {
    const index = createSearchIndex([
      searchDocument('first', 'Noach 3', [], 'reading.noach.3'),
      searchDocument('duplicate', 'Noach 3', [], 'reading.noach.3'),
      searchDocument('other', 'Noach 3 notes', [], 'notes.noach.3'),
    ])

    expect(
      index
        .search('Noach 3', { limit: 2 })
        .map(({ document }) => document.id)
    ).toEqual(['first', 'other'])
  })

  test('uses explicit empty priorities and excludes unavailable documents', () => {
    const index = createSearchIndex([
      { ...searchDocument('later', 'Later'), emptyPriority: 10 },
      { ...searchDocument('first', 'First'), emptyPriority: 20 },
      { ...searchDocument('hidden', 'Hidden'), available: false, emptyPriority: 30 },
      searchDocument('search-only', 'Search only'),
    ])

    expect(index.search('').map(({ document }) => document.id)).toEqual([
      'first',
      'later',
    ])
    expect(index.search('hidden')).toEqual([])
  })

  test('disables fuzzy matching for short tokens but keeps exact prefixes', () => {
    const index = createSearchIndex([searchDocument('pizza', 'Pizza')])

    expect(index.search('pz')).toEqual([])
    expect(index.search('pi')[0]?.document.id).toBe('pizza')
  })

  test('rejects weak partial matches from long unrelated queries', () => {
    const index = createSearchIndex([
      searchDocument('reading', 'Behalotecha', [], 'reading.behalotecha'),
    ])

    expect(index.search('not a real reading name')).toEqual([])
  })

  test('maps normalized Hebrew matches back to the original text', () => {
    const original = 'בְּרֵאשִׁית'
    const index = createSearchIndex([
      searchDocument('beresheet', original),
    ])
    const result = index.search('בראשית')[0]

    expect(result?.matchedField).toEqual({
      kind: 'primary',
      index: 0,
      value: original,
      ranges: [[0, original.length - 1]],
    })
  })

  test.each(goldenSafetyQueries)('handles hostile query %j safely', (query) => {
    const index = createSearchIndex(documents)
    expect(() => index.search(query)).not.toThrow()
  })
})

function searchDocument(
  id: string,
  primary: string,
  aliases: readonly string[] = [],
  destinationId = id
): SearchDocument<string> {
  return {
    id,
    destinationId,
    primary,
    aliases,
    item: id,
  }
}
