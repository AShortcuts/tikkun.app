import type { LineType } from '../components/Page.ts'
import { loadScroll, type ScrollResolver } from '../location.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import { isInvertedNun, tokenizeReaderWords } from '../reader/word-tokenization.ts'
import type { RefWithScroll } from '../ref.ts'
import textFilter from '../text-filter.ts'
import { loadScrollPageLines } from '../view-model/scroll-view-model.ts'
import { collectExactTokenRange } from './exact-token-range.ts'
import { verseEndLocation } from './verse-end-location.ts'

export type PassageRange = { start: RefWithScroll; end: RefWithScroll }
export type PassagePage = { pageNumber: number; lines: LineType[] }

/** Source-coordinate masks; neither form's word or line indexes are rebased. */
export interface PassageWordSelection {
  readonly annotated: ReadonlySet<string>
  readonly unannotated: ReadonlySet<string>
  readonly lineKeys: ReadonlySet<string>
  readonly unannotatedVerseEnds: ReadonlySet<string>
  readonly unannotatedKeysByAnnotated: ReadonlyMap<string, readonly string[]>
}

export function projectPassageWords(
  pages: readonly PassagePage[],
  selected: ReadonlySet<string>,
): PassageWordSelection {
  const annotated = new Set(selected)
  const unannotated = new Set<string>()
  const lineKeys = new Set<string>()
  const unannotatedVerseEnds = new Set<string>()
  const unannotatedKeysByAnnotated = new Map<string, readonly string[]>()
  for (const { pageNumber, lines } of pages) {
    lines.forEach((line, lineIndex) => line.text.forEach((column, columnIndex) => column.forEach((fragment, fragmentIndex) => {
      const prefix = `${pageNumber}:${lineIndex}:${columnIndex * 100 + fragmentIndex}:`
      let annotatedIndex = 0
      let unannotatedIndex = 0
      // Torah form expands maqaf groups and changes ktiv/kri token counts.
      // Project through the same source words as print selection, not offsets.
      for (const raw of tokenizeReaderWords(fragment)) {
        const pointed = tokenizeReaderWords(textFilter({ text: raw.text, annotated: true }))
        const plain = tokenizeReaderWords(textFilter({ text: raw.text, annotated: false }))
        if (pointed.some((_, i) => selected.has(`${prefix}${annotatedIndex + i}`))) {
          lineKeys.add(`${pageNumber}:${lineIndex}`)
          const plainKeys = plain.map((_, i) => `${prefix}${unannotatedIndex + i}`)
          plainKeys.forEach(key => unannotated.add(key))
          pointed.forEach((_, i) => {
            const key = `${prefix}${annotatedIndex + i}`
            if (selected.has(key)) unannotatedKeysByAnnotated.set(key, plainKeys)
          })
          if (pointed.some(word => word.text.includes('׃'))) {
            const lastWord = plain.findLastIndex(word => !isInvertedNun(word.text))
            if (lastWord >= 0) unannotatedVerseEnds.add(plainKeys[lastWord])
          }
          // Inverted nun is attached to its source word but is deliberately
          // absent from canonical/audio token sequences.
          pointed.forEach((word, i) => {
            if (isInvertedNun(word.text)) annotated.add(`${prefix}${annotatedIndex + i}`)
          })
        }
        annotatedIndex += pointed.length
        unannotatedIndex += plain.length
      }
    })))
  }
  return { annotated, unannotated, lineKeys, unannotatedVerseEnds, unannotatedKeysByAnnotated }
}

/** Load boundary context and require the complete ending verse before selection. */
export async function loadPassageSelection(
  ranges: readonly PassageRange[],
  options: {
    resolver?: ScrollResolver
    loadPage?: (pageNumber: number) => Promise<LineType[]>
  } = {},
) {
  if (!ranges.length) throw new Error('A passage selection must contain a range.')
  const scroll = ranges[0].start.scroll
  const resolver = options.resolver ?? await loadScroll(scroll)
  const pageCache = new Map<number, Promise<LineType[]>>()
  const loadPage = (page: number) => {
    let pending = pageCache.get(page)
    if (!pending) {
      pending = options.loadPage ? options.loadPage(page) : loadScrollPageLines(scroll, page)
      pageCache.set(page, pending)
    }
    return pending
  }
  const requestedPages = new Set<number>()
  for (const range of ranges) {
    if (range.start.scroll !== scroll || range.end.scroll !== scroll) {
      throw new Error('Passage ranges must use the same scroll.')
    }
    const first = resolver.physicalLocationFromRef(range.start).pageNumber
    const last = (await verseEndLocation(range.end, resolver, loadPage)).pageNumber
    for (let page = Math.max(1, first - 1); page <= last; page++) requestedPages.add(page)
  }
  const numbers = [...requestedPages].sort((a, b) => a - b)
  const contextPages = await Promise.all(numbers.map(async pageNumber => ({ pageNumber, lines: await loadPage(pageNumber) })))
  const rows = contextPages.flatMap(page => page.lines.map((line, index) => ({ page: page.pageNumber, index, line })))
  const wordsByLine = rows.map(row => canonicalLineWords(row.page, row.index, row.line))
  const tokensForRange = ({ start, end }: PassageRange) => {
    const matches = (ref: RefWithScroll, row: typeof rows[number]) => row.line.verses.findIndex(v => v.book === ref.b && v.chapter === ref.c && v.verse === ref.v)
    const startLineIndex = rows.findIndex(row => matches(start, row) >= 0)
    const endLineIndex = rows.findIndex(row => matches(end, row) >= 0)
    if (startLineIndex < 0 || endLineIndex < 0) throw new Error('The selected passage could not be found in the scroll columns.')
    const tokens = collectExactTokenRange({ wordsByLine, startLineIndex, startVerseOrdinal: matches(start, rows[startLineIndex]), endLineIndex, endVerseOrdinal: matches(end, rows[endLineIndex]) })
    if (!tokens.length) throw new Error('The selected passage has no printable text.')
    return tokens
  }
  const tokenKeys = new Set(ranges.flatMap(tokensForRange))
  const selectedPages = new Set([...tokenKeys].map(key => Number(key.split(':')[0])))
  return {
    contextPages,
    pages: contextPages.filter(page => selectedPages.has(page.pageNumber)),
    tokenKeys,
    projection: projectPassageWords(contextPages, tokenKeys),
    firstTokenKeyAt: (ref: RefWithScroll) => tokensForRange({ start: ref, end: ref })[0],
  }
}
