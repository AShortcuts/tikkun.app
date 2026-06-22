import { expect, test } from 'vitest'
import {
  generateTorahReferenceHash,
  listTorahBooks,
  listTorahChapters,
  listTorahVerses,
} from './torah-reference.ts'

const last = <T>(values: T[]) => values[values.length - 1]

test('lists the five chumash books in order', () => {
  expect(listTorahBooks().map((book) => [book.number, book.label])).toEqual([
      [1, 'Beresheet'],
      [2, 'Shemot'],
      [3, 'Vayikra'],
      [4, 'Bamidbar'],
      [5, 'Devarim'],
    ])
})

test('lists chapters from the torah table of contents', () => {
  expect([1, 2, 3, 4, 5].map((bookNumber) => last(listTorahChapters(bookNumber)))).toEqual([50, 40, 27, 36, 34])
})

test('lists verses from the torah table of contents', () => {
  expect(last(listTorahVerses(1, 1))).toEqual(31)
  expect(last(listTorahVerses(2, 20))).toEqual(23)
  expect(last(listTorahVerses(5, 34))).toEqual(12)
})

test('generates legacy torah reference hashes', () => {
  expect(generateTorahReferenceHash({ book: 1, chapter: 1, verse: 1 })).toBe('#/r/1-1-1')
})
