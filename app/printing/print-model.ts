import { compareRefs } from '../calendar-model/ref-utils.ts'
import { listTorahBooks } from '../components/torah-reference.ts'
import { isIndexedReference, listScrollVerses, loadScroll } from '../location.ts'
import { verseEndLocation } from '../reading/verse-end-location.ts'
import type { LineType } from '../components/Page.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import { collectExactTokenRange } from '../reading/exact-token-range.ts'
import { loadScrollPageLines, type RenderedPageInfo } from '../view-model/scroll-view-model.ts'
import type { RefWithScroll } from '../ref.ts'
import { chapterVerseLabel, verseRangeLabel } from '../components/verse-range-label.ts'
import textFilter from '../text-filter.ts'
import { tokenizeReaderWords } from '../reader/word-tokenization.ts'

export type PassageRange = { start: RefWithScroll; end: RefWithScroll }
export type PrintOptions = {
  removeCredits: boolean
  pageNumbers: boolean
  detailsPage: boolean
  aliyahLabels: { he: string; en: string }[]
  replaceDivineNames: boolean
  ranges: PassageRange[]
  layout: 'reading' | 'match'
  sides: 'one' | 'two'
  form: 'tikkun' | 'torah'
  surrounding: boolean
  orientation: 'portrait' | 'landscape'
  scaling: number
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
  const reference = language === 'he' ? chapterVerseLabel : (ref: RefWithScroll) => `${ref.c}:${ref.v}`
  const bookName = (ref: RefWithScroll) => {
    if (ref.scroll === 'esther') return language === 'he' ? 'אסתר' : 'Esther'
    const book = listTorahBooks().find(book => book.number === ref.b)
    return (language === 'he' ? book?.hebrew : book?.label) ?? ''
  }
  return ranges.map(({ start, end }) => {
    if (start.b !== end.b) {
      return `${bookName(start)} ${reference(start)}–${bookName(end)} ${reference(end)}`
    }
    const range = language === 'he' ? verseRangeLabel({ start, end }, '–')
      : compareRefs(start, end) === 0 ? reference(start)
        : `${reference(start)}–${start.c === end.c ? end.v : reference(end)}`
    return `${bookName(start)} ${range}`
  }).join(' · ')
}

export async function loadPrintPassage(ranges: PassageRange[]) {
  validateRanges(ranges)
  const scroll = ranges[0].start.scroll
  const resolver = await loadScroll(scroll)
  const pageCache = new Map<number, Promise<LineType[]>>()
  const loadPage = (page: number) => {
    if (!pageCache.has(page)) pageCache.set(page, loadScrollPageLines(scroll, page))
    return pageCache.get(page)!
  }
  const requestedPages = new Set<number>()
  for (const range of ranges) {
    const first = resolver.physicalLocationFromRef(range.start).pageNumber
    const last = (await verseEndLocation(range.end, resolver, loadPage)).pageNumber
    // Boundary context lets the shared token-range helper resolve verses that
    // begin mid-line or continue across a physical column.
    for (let n = Math.max(1, first - 1); n <= last; n++) requestedPages.add(n)
  }
  const numbers = [...requestedPages].sort((a, b) => a - b)
  const loaded = await Promise.all(numbers.map(async pageNumber => ({ pageNumber, lines: await loadPage(pageNumber) })))
  const rows = loaded.flatMap(page => page.lines.map((line, index) => ({ page: page.pageNumber, index, line })))
  const wordsByLine = rows.map(row => canonicalLineWords(row.page, row.index, row.line))
  const selected = new Set<string>()
  for (const { start, end } of ranges) {
    const matches = (ref: RefWithScroll, row: typeof rows[number]) => row.line.verses.findIndex(v => v.book === ref.b && v.chapter === ref.c && v.verse === ref.v)
    const startLineIndex = rows.findIndex(row => matches(start, row) >= 0)
    const endLineIndex = rows.findIndex(row => matches(end, row) >= 0)
    if (startLineIndex < 0 || endLineIndex < 0) throw new Error('The selected passage could not be found in the scroll columns.')
    const tokens = collectExactTokenRange({ wordsByLine, startLineIndex, startVerseOrdinal: matches(start, rows[startLineIndex]), endLineIndex, endVerseOrdinal: matches(end, rows[endLineIndex]) })
    if (!tokens.length) throw new Error('The selected passage has no printable text.')
    tokens.forEach(key => selected.add(key))
  }
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
  const selectedUnannotated = new Set<string>()
  for (const { pageNumber, lines } of loaded) {
    lines.forEach((line, lineIndex) => line.text.forEach((column, columnIndex) => column.forEach((fragment, fragmentIndex) => {
      const prefix = `${pageNumber}:${lineIndex}:${columnIndex * 100 + fragmentIndex}:`
      let annotatedIndex = 0
      let unannotatedIndex = 0
      // Torah form expands maqaf groups into separate words. Project the
      // selection through the existing text filters without changing geometry.
      for (const raw of tokenizeReaderWords(fragment)) {
        const annotated = tokenizeReaderWords(textFilter({ text: raw.text, annotated: true }))
        const unannotated = tokenizeReaderWords(textFilter({ text: raw.text, annotated: false }))
        if (annotated.some((_, i) => selected.has(`${prefix}${annotatedIndex + i}`))) {
          unannotated.forEach((_, i) => selectedUnannotated.add(`${prefix}${unannotatedIndex + i}`))
        }
        annotatedIndex += annotated.length
        unannotatedIndex += unannotated.length
      }
    })))
  }
  return { pages: pages.filter(page => selectedPages.has(page.pageNumber)), selected, selectedUnannotated }
}
