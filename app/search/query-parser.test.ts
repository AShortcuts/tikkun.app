import { describe, expect, test } from 'vitest'
import {
  goldenSafetyQueries,
  goldenStructuredQueries,
} from './golden-queries.ts'
import { parseStructuredSearchQuery } from './query-parser.ts'

describe('structured search query parser', () => {
  test.each(goldenStructuredQueries)('parses $query', ({ query, expected }) => {
    expect(parseStructuredSearchQuery(query)).toEqual(expected)
  })

  test('accepts conservative page and aliyah variants', () => {
    expect(parseStructuredSearchQuery('Esther 3')).toEqual({
      kind: 'page',
      scroll: 'esther',
      page: 3,
    })
    expect(parseStructuredSearchQuery('Noah aliyah 7')).toEqual({
      kind: 'aliyah',
      reading: 'noah',
      aliyah: 7,
    })
    expect(parseStructuredSearchQuery('נח ג׳')).toEqual({
      kind: 'aliyah',
      reading: 'נח',
      aliyah: 3,
    })
    expect(parseStructuredSearchQuery('נח מפטיר')).toEqual({
      kind: 'aliyah',
      reading: 'נח',
      aliyah: 'Maftir',
    })
  })

  test.each(goldenSafetyQueries)('never throws for %j', (query) => {
    expect(() => parseStructuredSearchQuery(query)).not.toThrow()
  })

  test('rejects invalid numbers and unknown reference books', () => {
    expect(parseStructuredSearchQuery('Torah page 0')).toBeNull()
    expect(parseStructuredSearchQuery('Unknown 6:9')).toBeNull()
  })
})
