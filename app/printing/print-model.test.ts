import { expect, test } from 'vitest'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import { loadScrollPageLines } from '../view-model/scroll-view-model.ts'
import { loadPrintPassage, passageTitle, validateRanges, type PassageRange } from './print-model.ts'
import textFilter from '../text-filter.ts'
import { tokenizeReaderWords } from '../reader/word-tokenization.ts'

const range = (c: number, v: number, endChapter = c, endVerse = v): PassageRange => ({
  start: { scroll: 'torah', b: 1, c, v },
  end: { scroll: 'torah', b: 1, c: endChapter, v: endVerse },
})

test('English passage titles cover single verses, ranges, and separate selections', () => {
  expect(passageTitle([range(1, 6)], 'en')).toBe('Beresheet 1:6')
  expect(passageTitle([range(1, 6, 1, 13)], 'en')).toBe('Beresheet 1:6–13')
  expect(passageTitle([range(1, 24, 2, 3)], 'en')).toBe('Beresheet 1:24–2:3')
  expect(passageTitle([range(1, 3), range(1, 9)], 'en')).toBe('Beresheet 1:3 · Beresheet 1:9')
  expect(passageTitle([{ start: { scroll: 'torah', b: 1, c: 50, v: 26 }, end: { scroll: 'torah', b: 2, c: 1, v: 1 } }], 'en')).toBe('Beresheet 50:26–Shemot 1:1')
})

async function passageWords(ranges: PassageRange[]) {
  const passage = await loadPrintPassage(ranges)
  const words = (await Promise.all(passage.pages.map(async page => {
    const lines = await loadScrollPageLines(ranges[0].start.scroll, page.pageNumber)
    return lines.flatMap((line, i) => canonicalLineWords(page.pageNumber, i, line))
  }))).flat().filter(word => passage.selected.has(word.tokenKey))
  return { ...passage, words, plain: words.map(word => word.annotatedText.replace(/\p{M}/gu, '')).join(' ') }
}

test('custom range selects eight complete pesukim, including mid-line boundaries', async () => {
  const passage = await passageWords([range(1, 6, 1, 13)])
  expect(passage.plain).toMatch(/^ויאמר אלהים יהי רקיע/)
  expect(passage.plain).toMatch(/יום שלישי׃$/)
  expect(passage.words.filter(word => word.annotatedText.includes('׃'))).toHaveLength(8)
  expect(passage.pages).toHaveLength(1)
})

test('cross-column and cross-chapter ranges include every complete pasuk', async () => {
  const passage = await passageWords([range(1, 24, 2, 3)])
  expect(passage.pages.length).toBeGreaterThan(1)
  expect(passage.plain).toMatch(/^ויאמר אלהים תוצא הארץ/)
  expect(passage.plain).toMatch(/אשר־ברא אלהים לעשות׃$/)
  expect(passage.words.filter(word => word.annotatedText.includes('׃'))).toHaveLength(11)
})

test('noncontiguous selections omit the gap and overlapping ranges do not duplicate words', async () => {
  const first = await loadPrintPassage([range(1, 3)])
  const second = await loadPrintPassage([range(1, 9)])
  const combined = await passageWords([range(1, 3), range(1, 9), range(1, 3)])
  expect(combined.selected).toEqual(new Set([...first.selected, ...second.selected]))
  expect(combined.words.filter(word => word.annotatedText.includes('׃'))).toHaveLength(2)
})

test('invalid and empty selections report an actionable error', () => {
  expect(() => validateRanges([])).toThrow('Choose at least one passage')
  expect(() => validateRanges([range(1, 13, 1, 6)])).toThrow('ending pasuk')
  expect(() => validateRanges([range(1, 99)])).toThrow('valid starting and ending pasuk')
})

const estherRange = (c: number, v: number, endChapter = c, endVerse = v): PassageRange => ({
  start: { scroll: 'esther', b: 1, c, v }, end: { scroll: 'esther', b: 1, c: endChapter, v: endVerse },
})

test('Esther prints all 167 verses through the actual last word, and custom ranges stay exact', async () => {
  const whole = await passageWords([estherRange(1, 1, 10, 3)])
  expect(whole.pages).toHaveLength(16)
  expect(whole.words.filter(word => word.annotatedText.includes('׃'))).toHaveLength(167)
  expect(whole.plain).toMatch(/שלום לכל־זרעו׃$/)
  const custom = await passageWords([estherRange(9, 7, 9, 9)])
  expect(custom.words.filter(word => word.annotatedText.includes('׃'))).toHaveLength(3)
  expect(custom.plain).toMatch(/^ואת ׀ פרשנדתא/)
  expect(custom.plain).toMatch(/ויזתא׃$/)
  expect(passageTitle([estherRange(9, 7, 9, 9)], 'en')).toBe('Esther 9:7–9')
  expect(passageTitle([estherRange(9, 7, 9, 9)])).toBe('אסתר ט:ז–ט')
  expect(() => validateRanges([range(1, 1), estherRange(1, 1)])).toThrow('same scroll')
})

test('Torah form preserves the same passage when maqaf groups expand into separate words', async () => {
  const passage = await passageWords([range(1, 6, 1, 13)])
  const actual: string[] = []
  for (const page of passage.pages) {
    const lines = await loadScrollPageLines('torah', page.pageNumber)
    lines.forEach((line, lineIndex) => line.text.forEach((column, columnIndex) => column.forEach((fragment, fragmentIndex) => {
      tokenizeReaderWords(textFilter({ text: fragment, annotated: false })).forEach((word, wordIndex) => {
        if (passage.selectedUnannotated.has(`${page.pageNumber}:${lineIndex}:${columnIndex * 100 + fragmentIndex}:${wordIndex}`)) actual.push(word.text)
      })
    })))
  }
  const expected = tokenizeReaderWords(textFilter({ text: passage.words.map(word => word.annotatedText).join(' '), annotated: false })).map(word => word.text)
  expect(actual).toEqual(expected)
  expect(actual.length).toBeGreaterThan(passage.words.length)
})
