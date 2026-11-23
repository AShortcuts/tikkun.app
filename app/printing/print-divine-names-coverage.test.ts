import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { ScrollName } from '../ref.ts'
import { findDivineNames, printSourceWords, replacePrintDivineNames, type PrintSourceWord } from './print-divine-names.ts'

const scrolls: [ScrollName, number][] = [['torah', 245], ['esther', 16]]
const loadPage = (scroll: ScrollName, page: number) => JSON.parse(readFileSync(`text/pages/${scroll}/${page}.json`, 'utf8'))

function scrollWords(scroll: ScrollName, pageCount: number): (PrintSourceWord & { pageNumber: number })[] {
  return Array.from({ length: pageCount }, (_, index) => index + 1).flatMap(pageNumber => {
    return printSourceWords({
      pageNumber,
      lines: loadPage(scroll, pageNumber),
      previousLines: pageNumber > 1 ? loadPage(scroll, pageNumber - 1) : [],
      scroll,
    }).map(word => ({ ...word, pageNumber }))
  })
}

const where = ({ word, ref }: { word: string, ref: { b: number, c: number, v: number } }) => `${word} at ${ref.b}:${ref.c}:${ref.v}`

test.each(scrolls)('every column of %s prints בס״ד in both layouts with substitute spellings', (scroll, pageCount) => {
  const words = scrollWords(scroll, pageCount)
  const names = findDivineNames(words)
  // Names without a substitute spelling must have a break between every letter after the prefix,
  // in the pointed word and in the scroll-form word that Match prints on its Torah side.
  const unsplit = names.filter(name => !name.respelled && (name.breakBeforeLetters.length === 0 || !name.scrollTarget?.breakBeforeLetters.length))
  expect(unsplit.map(where)).toEqual([])
  // Independent of the name rules: no respelled text may still spell the four-letter Name or Elokim anywhere in a word.
  const unrespelled = words.filter(word => /יהוה|אלהי/u.test(replacePrintDivineNames(word.text).replace(/\p{M}/gu, '')))
  expect(unrespelled.map(word => `${word.text} in column ${word.pageNumber}`)).toEqual([])
})

test('finds every reviewed name without a substitute spelling in the Torah', () => {
  const counts: Record<string, number> = {}
  for (const { word, respelled } of findDivineNames(scrollWords('torah', 245))) {
    if (respelled) continue
    const name = word.replace(/\p{M}/gu, '').replace(/^ו?[בכלמ]?ה?(?=א|ש|י)/u, '')
    counts[name] = (counts[name] ?? 0) + 1
  }
  // 44 of the Torah's 71 pointed אֵל are the name; the other 27 are Beit-El, "these", "in my power", other gods and Lael.
  expect(counts).toEqual({ אל: 43, אלי: 1, אדני: 18, שדי: 9, אהיה: 7, יה: 2 })
})
