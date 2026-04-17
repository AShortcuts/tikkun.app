import test from 'ava'
import {
  generateTorahReferenceHash,
  listTorahBooks,
  listTorahChapters,
  listTorahVerses,
} from './torah-reference.ts'

const last = <T>(values: T[]) => values[values.length - 1]

test('lists the five chumash books in order', (t) => {
  t.deepEqual(
    listTorahBooks().map((book) => [book.number, book.label]),
    [
      [1, 'Beresheet'],
      [2, 'Shemot'],
      [3, 'Vayikra'],
      [4, 'Bamidbar'],
      [5, 'Devarim'],
    ]
  )
})

test('lists chapters from the torah table of contents', (t) => {
  t.deepEqual(
    [1, 2, 3, 4, 5].map((bookNumber) => last(listTorahChapters(bookNumber))),
    [50, 40, 27, 36, 34]
  )
})

test('lists verses from the torah table of contents', (t) => {
  t.deepEqual(last(listTorahVerses(1, 1)), 31)
  t.deepEqual(last(listTorahVerses(2, 20)), 23)
  t.deepEqual(last(listTorahVerses(5, 34)), 12)
})

test('generates legacy torah reference hashes', (t) => {
  t.is(generateTorahReferenceHash({ book: 1, chapter: 1, verse: 1 }), '#/r/1-1-1')
})
