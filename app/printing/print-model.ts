import { compareRefs } from '../calendar-model/ref-utils.ts'
import { listTorahBooks } from '../components/torah-reference.ts'
import { isIndexedReference, listScrollVerses } from '../location.ts'
import { loadPassageSelection, type PassageRange } from '../reading/passage-selection.ts'
import type { RenderedPageInfo } from '../view-model/scroll-view-model.ts'
import type { RefWithScroll } from '../ref.ts'
import { chapterVerseLabel, verseRangeLabel } from '../components/verse-range-label.ts'
import { printSourceWords, type PrintSourceWord } from './print-divine-names.ts'
import type { PrintReadingTitle } from './print-details.ts'

export type { PassageRange } from '../reading/passage-selection.ts'
export type PrintOptions = {
  removeCredits: boolean
  pageNumbers: boolean
  /**
   * The reading's name and aliyot for the masthead, when the passage was chosen as a reading.
   * A range typed in by verse has none: the masthead names its parsha and shows no aliyah.
   */
  title?: PrintReadingTitle
  replaceDivineNames: boolean
  /** Shows pasuk numbers beside the line where each pasuk starts, as in the reader. */
  verseNumbers: boolean
  ranges: PassageRange[]
  layout: 'reading' | 'match'
  sides: 'one' | 'two'
  form: 'tikkun' | 'torah'
  surrounding: boolean
  orientation: 'portrait' | 'landscape'
  scaling: number
  /** Reading layout's font size in px; Match uses scaling instead. */
  fontSize: number
  /** Space added after each pasuk in Reading layout, in px; negative values pull the next pasuk closer. */
  pasukSpacing: number
  overflow: 'shrink' | 'continue'
}

export const paperSize = (orientation: PrintOptions['orientation']) => orientation === 'portrait' ? { width: 816, height: 1056 } : { width: 1056, height: 816 }

export function normalizeRanges(ranges: PassageRange[]): PassageRange[] {
  const merged: PassageRange[] = []
  for (const range of [...ranges].sort((a, b) => compareRefs(a.start, b.start))) {
    const last = merged.at(-1)
    const sameScroll = last?.end.scroll === range.start.scroll
    const adjacent = sameScroll && last && last.end.b === range.start.b && (
      (last.end.c === range.start.c && last.end.v + 1 === range.start.v) ||
      (last.end.c + 1 === range.start.c && range.start.v === 1 && last.end.v === listScrollVerses(last.end.scroll, last.end.b, last.end.c).length)
    )
    if (sameScroll && last && last.end.b === range.start.b && (compareRefs(range.start, last.end) <= 0 || adjacent)) {
      if (compareRefs(range.end, last.end) > 0) last.end = { ...range.end }
    } else merged.push({ start: { ...range.start }, end: { ...range.end } })
  }
  return merged
}

export function validateRanges(ranges: PassageRange[]) {
  if (!ranges.length) throw new Error('Choose at least one passage to preview.')
  for (const { start, end } of ranges) {
    if (start.scroll !== ranges[0].start.scroll || end.scroll !== start.scroll) throw new Error('Choose passages from the same scroll.')
    if (!isIndexedReference(start) || !isIndexedReference(end)) throw new Error('Choose a valid starting and ending pasuk.')
    if (compareRefs(start, end) > 0) throw new Error('The ending pasuk must come after the starting pasuk.')
  }
}

export function passageTitle(ranges: PassageRange[], language: 'he' | 'en' = 'he') {
  return ranges.map(range => rangeLabel(range, language, true)).join(' · ')
}

/**
 * The masthead's verse range: ranges in the same book name it once, as in
 * "Beresheet 6:9–8:14, 9:8–17" and "בראשית ו:ט–ח:יד, ט:ח–יז".
 */
export function passageRangesLabel(ranges: PassageRange[], language: 'he' | 'en' = 'he') {
  return ranges.map((range, index) => {
    const previous = ranges[index - 1]?.end
    const sameBook = previous && previous.scroll === range.start.scroll && previous.b === range.start.b
    return rangeLabel(range, language, !sameBook)
  }).join(', ')
}

function rangeLabel({ start, end }: PassageRange, language: 'he' | 'en', withBook: boolean) {
  const reference = language === 'he' ? chapterVerseLabel : (ref: RefWithScroll) => `${ref.c}:${ref.v}`
  const bookName = (ref: RefWithScroll) => {
    if (ref.scroll === 'esther') return language === 'he' ? 'אסתר' : 'Esther'
    const book = listTorahBooks().find(book => book.number === ref.b)
    return (language === 'he' ? book?.hebrew : book?.label) ?? ''
  }
  if (start.b !== end.b) {
    return `${withBook ? `${bookName(start)} ` : ''}${reference(start)}–${bookName(end)} ${reference(end)}`
  }
  const range = language === 'he' ? verseRangeLabel({ start, end }, '–')
    : compareRefs(start, end) === 0 ? reference(start)
      : `${reference(start)}–${start.c === end.c ? end.v : reference(end)}`
  return withBook ? `${bookName(start)} ${range}` : range
}

export async function loadPrintPassage(ranges: PassageRange[]) {
  validateRanges(ranges)
  const scroll = ranges[0].start.scroll
  const { contextPages: loaded, tokenKeys: selected, projection } = await loadPassageSelection(ranges)
  const selectedPages = new Set([...selected].map(key => Number(key.split(':')[0])))
  let previousRef: RefWithScroll | undefined
  const pages: RenderedPageInfo[] = loaded.map(({ pageNumber, lines }) => ({
    type: 'page', contentIndex: pageNumber - 1, pageNumber,
    lines: lines.map(line => {
      const verses = line.verses.map(v => ({ b: v.book, c: v.chapter, v: v.verse, scroll }))
      const focalRef = previousRef ?? verses[0]
      previousRef = verses.at(-1) ?? previousRef
      return { ...line, scroll, verses, focalRef, labels: [], aliyahStarts: [], aliyot: [] }
    }),
  }))
  // Every word on the printed pages, in reading order with its pasuk, for divine-name checks.
  const words: PrintSourceWord[] = loaded.filter(page => selectedPages.has(page.pageNumber)).flatMap(({ pageNumber, lines }) => {
    const previousLines = loaded.find(page => page.pageNumber === pageNumber - 1)?.lines
    return printSourceWords({ pageNumber, lines, previousLines, scroll })
  })
  return { pages: pages.filter(page => selectedPages.has(page.pageNumber)), selected, selectedUnannotated: projection.unannotated, words }
}
