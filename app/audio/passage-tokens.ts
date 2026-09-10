import { loadScrollPageLines } from '../view-model/scroll-view-model.ts'
import { loadScroll } from '../location.ts'
import { collectExactTokenRange } from '../reading/exact-token-range.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import type { RecordingRange } from './types.ts'


export async function loadPassageTokens({ start, end }: RecordingRange) {
  if (start.scroll !== end.scroll) {
    throw new Error('Passage audio requires references in the same scroll')
  }
  const resolver = await loadScroll(start.scroll)
  const first = resolver.physicalLocationFromRef(start)
  const last = resolver.physicalLocationFromRef(end)
  // Include adjacent data for a preceding or ending verse that crosses a page.
  const pageNumbers = Array.from(
    { length: Math.min(resolver.getPageCount(), last.pageNumber + 1) - Math.max(1, first.pageNumber - 1) + 1 },
    (_, index) => Math.max(1, first.pageNumber - 1) + index
  )
  const lines = (await Promise.all(pageNumbers.map(async (pageNumber) => {
    return (await loadScrollPageLines(start.scroll, pageNumber)).map((line, lineIndex) => ({ pageNumber, lineIndex, line }))
  }))).flat()
  const ordinal = (index: number, ref: RecordingRange['start']) =>
    lines[index]?.line.verses.findIndex(verse => verse.book === ref.b && verse.chapter === ref.c && verse.verse === ref.v) ?? -1
  // The index bounds the data fetch; actual verse metadata owns word boundaries.
  const startLineIndex = lines.findIndex((_, index) => ordinal(index, start) >= 0)
  const endLineIndex = lines.findIndex((_, index) => ordinal(index, end) >= 0)
  const tokens = collectExactTokenRange({
    wordsByLine: lines.map(entry => canonicalLineWords(entry.pageNumber, entry.lineIndex, entry.line)),
    startLineIndex,
    startVerseOrdinal: ordinal(startLineIndex, start),
    endLineIndex,
    endVerseOrdinal: ordinal(endLineIndex, end),
  })
  if (!tokens.length) throw new Error('Could not resolve passage audio words')
  return tokens
}
