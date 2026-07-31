import { expect, test } from 'vitest'
import canonicalTorahToc from '../../text/torah-toc.json' with {
  type: 'json',
}
import {
  getTorahPageCount,
  getTorahPageLine,
  listTorahChapters,
  listTorahVerses,
} from './torah-index.ts'

test('the compact Torah index preserves every canonical reference', () => {
  for (const [book, chapters] of Object.entries(canonicalTorahToc)) {
    expect(listTorahChapters(Number(book))).toEqual(
      Object.keys(chapters).map(Number)
    )
    for (const [chapter, verses] of Object.entries(chapters)) {
      expect(listTorahVerses(Number(book), Number(chapter))).toEqual(
        Object.keys(verses).map(Number)
      )
      for (const [verse, location] of Object.entries(verses)) {
        expect(
          getTorahPageLine(Number(book), Number(chapter), Number(verse))
        ).toEqual({
          pageNumber: location.p,
          lineNumber: location.l,
        })
      }
    }
  }

  expect(getTorahPageCount()).toBe(245)
  expect(getTorahPageLine(1, 1, 0)).toBeNull()
  expect(getTorahPageLine(6, 1, 1)).toBeNull()
})
