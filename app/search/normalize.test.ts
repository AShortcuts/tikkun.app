import { describe, expect, test } from 'vitest'
import {
  mapNormalizedRangesToOriginal,
  normalizeSearchText,
  normalizeSearchTextWithMap,
  tokenizeSearchText,
} from './normalize.ts'

describe('search normalization', () => {
  test('normalizes case, diacritics, punctuation, and whitespace', () => {
    expect(normalizeSearchText('  Tishah  B’Av  ')).toBe('tishah b av')
    expect(normalizeSearchText('Lech־Lecha')).toBe('lech lecha')
    expect(normalizeSearchText('Bérésheet')).toBe('beresheet')
  })

  test('removes Hebrew nikkud while retaining original highlight ranges', () => {
    const original = 'בְּרֵאשִׁית'
    const normalized = normalizeSearchTextWithMap(original)

    expect(normalized.value).toBe('בראשית')
    expect(mapNormalizedRangesToOriginal(normalized, [[0, 5]])).toEqual([
      [0, original.length - 1],
    ])
  })

  test('tokenizes only normalized non-empty words', () => {
    expect(tokenizeSearchText('  Noach—Aliyah 3 ')).toEqual([
      'noach',
      'aliyah',
      '3',
    ])
    expect(tokenizeSearchText('[')).toEqual([])
  })
})
