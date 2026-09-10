import type { LineType } from '../components/Page.ts'
import { isInvertedNun, tokenizeReaderWords } from './word-tokenization.ts'
import textFilter from '../text-filter.ts'

export function canonicalLineWords(pageNumber: number, lineIndex: number, line: LineType) {
  return line.text.flatMap((column, columnIndex) =>
    column.flatMap((fragment, fragmentIndex) =>
      tokenizeReaderWords(textFilter({ text: fragment, annotated: true })).map(
        (word, wordIndex) => ({
          tokenKey: `${pageNumber}:${lineIndex}:${columnIndex * 100 + fragmentIndex}:${wordIndex}`,
          annotatedText: word.text,
        })
      // Filter after assigning IDs so existing audio cues keep their word positions.
      ).filter(word => !isInvertedNun(word.annotatedText))
    )
  )
}
