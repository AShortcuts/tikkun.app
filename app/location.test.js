import { expect, test } from 'vitest'
import { hasScrollData, isValidScrollPageNumber, loadScroll } from './location.ts'

test('page ranges come from each scroll index', () => {
  expect(isValidScrollPageNumber('torah', 1)).toBe(true)
  expect(isValidScrollPageNumber('torah', 245)).toBe(true)
  expect(isValidScrollPageNumber('torah', 0)).toBe(false)
  expect(isValidScrollPageNumber('torah', 246)).toBe(false)

  expect(isValidScrollPageNumber('esther', 1)).toBe(true)
  expect(isValidScrollPageNumber('esther', 16)).toBe(true)
  expect(isValidScrollPageNumber('esther', 0)).toBe(false)
  expect(isValidScrollPageNumber('esther', 17)).toBe(false)
  expect(isValidScrollPageNumber('esther', 1.5)).toBe(false)
})

test('Noach starts on { page 6, line 32 }', async () => {
  const resolver = await loadScroll('torah')
  expect(resolver.physicalLocationFromRef({ b: 1, c: 6, v: 9, scroll: 'torah' })).toEqual({
      pageNumber: 6,
      lineNumber: 32,
    })
})

test('unsupported scrolls fail at the data boundary', async () => {
  expect(hasScrollData('lamentations')).toBe(false)
  await expect(loadScroll('lamentations')).rejects.toThrow(
    'Scroll data is unavailable for lamentations'
  )
})
