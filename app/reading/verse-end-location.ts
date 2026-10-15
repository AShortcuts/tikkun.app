import type { LineType } from '../components/Page.ts'
import type { ScrollResolver } from '../location.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import type { RefWithScroll } from '../ref.ts'
import { verseStartSequenceIndex } from './exact-token-range.ts'

/** Resolve the end of the verse, including continuations in later columns. */
export async function verseEndLocation(
  ref: RefWithScroll,
  resolver: ScrollResolver,
  loadPage: (pageNumber: number) => Promise<LineType[]>,
) {
  const start = resolver.physicalLocationFromRef(ref)
  const firstPage = await loadPage(start.pageNumber)
  const lineIndex = start.lineNumber - 1
  const firstLine = firstPage[lineIndex]
  const ordinal = firstLine?.verses.findIndex(verse =>
    verse.book === ref.b && verse.chapter === ref.c && verse.verse === ref.v)
  if (ordinal === undefined || ordinal < 0) {
    throw new Error(`Missing verse start for ${ref.scroll} ${ref.b}:${ref.c}:${ref.v}`)
  }
  const previousLine = firstPage[lineIndex - 1] ??
    (start.pageNumber > 1 ? (await loadPage(start.pageNumber - 1)).at(-1) : undefined)
  const firstWord = verseStartSequenceIndex({
    currentLineWords: canonicalLineWords(start.pageNumber, lineIndex, firstLine),
    previousLineWords: previousLine ? canonicalLineWords(0, 0, previousLine) : [],
    verseOrdinal: ordinal,
  })
  for (let pageNumber = start.pageNumber; pageNumber <= resolver.getPageCount(); pageNumber++) {
    const lines = pageNumber === start.pageNumber ? firstPage : await loadPage(pageNumber)
    for (let index = pageNumber === start.pageNumber ? lineIndex : 0; index < lines.length; index++) {
      const words = canonicalLineWords(pageNumber, index, lines[index])
      const offset = pageNumber === start.pageNumber && index === lineIndex ? firstWord : 0
      if (words.slice(offset).some(word => word.annotatedText.includes('׃'))) {
        return { pageNumber, lineNumber: index + 1 }
      }
    }
  }
  throw new Error(`Missing verse ending for ${ref.scroll} ${ref.b}:${ref.c}:${ref.v}`)
}
