import compactTorahIndex from '../../generated/torah-index.json' with {
  type: 'json',
}

type CompactTorahIndex = {
  radix: number
  pageLines: number[][][]
}

const { radix, pageLines } = compactTorahIndex as CompactTorahIndex

if (!Number.isInteger(radix) || radix <= 1) {
  throw new Error('Compact Torah index has an invalid radix')
}

export function getTorahPageLine(
  bookNumber: number,
  chapterNumber: number,
  verseNumber: number
) {
  const encoded =
    pageLines[bookNumber - 1]?.[chapterNumber - 1]?.[verseNumber - 1]
  if (!Number.isInteger(encoded) || encoded <= 0) return null

  return {
    pageNumber: Math.floor(encoded / radix),
    lineNumber: encoded % radix,
  }
}

export function getTorahPageCount() {
  const lastBook = pageLines[pageLines.length - 1]
  const lastChapter = lastBook?.[lastBook.length - 1]
  const lastLocation = lastChapter?.[lastChapter.length - 1]
  if (!Number.isInteger(lastLocation) || lastLocation <= 0) {
    throw new Error('Compact Torah index has no final page')
  }
  return Math.floor(lastLocation / radix)
}

export function listTorahChapters(bookNumber: number) {
  const book = pageLines[bookNumber - 1]
  return book?.map((_, index) => index + 1) ?? []
}

export function listTorahVerses(
  bookNumber: number,
  chapterNumber: number
) {
  const chapter = pageLines[bookNumber - 1]?.[chapterNumber - 1]
  return chapter?.map((_, index) => index + 1) ?? []
}
