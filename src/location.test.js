import { expect, test } from 'vitest'
import { loadScroll } from './location.ts'

test('page count for torah', async () => {
  const resolver = await loadScroll('torah')
  expect(resolver.getPageCount()).toBe(245)
})

test('Bereshit 1:1 starts on { page 1, line 1 }', async () => {
  const resolver = await loadScroll('torah')
  expect(resolver.physicalLocationFromRef({ b: 1, c: 1, v: 1, scroll: 'torah' })).toEqual({
      pageNumber: 1,
      lineNumber: 1,
    })
})

test('Noach starts on { page 6, line 32 }', async () => {
  const resolver = await loadScroll('torah')
  expect(resolver.physicalLocationFromRef({ b: 1, c: 6, v: 9, scroll: 'torah' })).toEqual({
      pageNumber: 6,
      lineNumber: 32,
    })
})
