function endsWithSofPasuk(words: HTMLElement[]) {
  const lastWord = words[words.length - 1]
  return annotatedText(lastWord).trim().endsWith('׃')
}

const annotatedText = (word: HTMLElement | undefined) =>
  word?.dataset.annotationsOnText ?? word?.textContent ?? ''

export function verseStartWordIndex({
  currentLineWords,
  previousLineWords,
  verseOrdinal,
}: {
  currentLineWords: HTMLElement[]
  previousLineWords: HTMLElement[]
  verseOrdinal: number
}) {
  return verseStartSequenceIndex({
    currentLineWords: currentLineWords.map(toSequencedWord),
    previousLineWords: previousLineWords.map(toSequencedWord),
    verseOrdinal,
  })
}

const toSequencedWord = (word: HTMLElement): SequencedWord => ({
  tokenKey: word.dataset.tokenKey ?? '',
  annotatedText: annotatedText(word),
})

const annotatedWordsIn = (node: ParentNode) => {
  const canonicalWords = [
    ...node.querySelectorAll<HTMLElement>(
      '[data-reader-canonical="true"] .fragment .word'
    ),
  ]
  const words = canonicalWords.length
    ? canonicalWords
    : [...node.querySelectorAll<HTMLElement>('.fragment .word')]
  return words.filter(
    (word) => word.dataset.annotationsOnPresent !== 'false'
  )
}

function exactAliyahStartContext({
  book,
  startLine,
  startVerseOrdinal,
}: {
  book: ParentNode
  startLine: HTMLElement
  startVerseOrdinal: number
}) {
  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  const startLineIndex = lines.indexOf(startLine)
  if (startLineIndex < 0 || startVerseOrdinal < 0) return null

  const wordsByLine = lines.map(annotatedWordsIn)
  const startWordIndex = verseStartWordIndex({
    currentLineWords: wordsByLine[startLineIndex],
    previousLineWords: wordsByLine[startLineIndex - 1] ?? [],
    verseOrdinal: startVerseOrdinal,
  })

  return { lines, startLineIndex, startWordIndex, wordsByLine }
}

export function firstTokenKeyForExactAliyahStart({
  book,
  startLine,
  startVerseOrdinal,
}: {
  book: ParentNode
  startLine: HTMLElement
  startVerseOrdinal: number
}) {
  const context = exactAliyahStartContext({
    book,
    startLine,
    startVerseOrdinal,
  })
  return context?.wordsByLine[context.startLineIndex][context.startWordIndex]
    ?.dataset.tokenKey ?? null
}

export function adjustStartingLineTokens({
  currentLineWords,
  previousLineWords,
}: {
  currentLineWords: HTMLElement[]
  previousLineWords: HTMLElement[]
}) {
  if (!previousLineWords.length || endsWithSofPasuk(previousLineWords)) {
    return currentLineWords
  }

  const firstSofPasukIndex = currentLineWords.findIndex((word) =>
    annotatedText(word).includes('׃')
  )

  if (firstSofPasukIndex < 0) return currentLineWords
  return currentLineWords.slice(firstSofPasukIndex + 1)
}

export function adjustEndingLineTokens({
  currentLineWords,
  previousLineWords,
}: {
  currentLineWords: HTMLElement[]
  previousLineWords: HTMLElement[]
}) {
  if (!previousLineWords.length || endsWithSofPasuk(previousLineWords)) {
    return []
  }

  const firstSofPasukIndex = currentLineWords.findIndex((word) =>
    annotatedText(word).includes('׃')
  )

  if (firstSofPasukIndex < 0) return []
  return currentLineWords.slice(0, firstSofPasukIndex + 1)
}

export function collectTokenKeysForAliyahRange({
  book,
  startLine,
  endLine,
}: {
  book: ParentNode
  startLine: HTMLElement
  endLine?: HTMLElement | null
}) {
  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  const startIndex = lines.indexOf(startLine)
  const endIndex = endLine ? lines.indexOf(endLine) : lines.length
  if (startIndex < 0) return []

  const rangeEndIndex = endIndex < 0 ? lines.length : endIndex
  const visibleLines = lines.slice(startIndex, rangeEndIndex)

  const startLineWords = annotatedWordsIn(startLine)
  const startPreviousLineWords =
    startIndex > 0 ? annotatedWordsIn(lines[startIndex - 1]) : []
  const adjustedStartLineWords = adjustStartingLineTokens({
    currentLineWords: startLineWords,
    previousLineWords: startPreviousLineWords,
  })

  const sharedEndLineWords =
    endLine && endIndex >= 0
      ? adjustEndingLineTokens({
          currentLineWords: annotatedWordsIn(lines[endIndex]),
          previousLineWords:
            endIndex > 0 ? annotatedWordsIn(lines[endIndex - 1]) : [],
        })
      : []

  const tokenWords =
    startIndex === endIndex
      ? (() => {
          const endKeys = new Set(sharedEndLineWords.map((word) => word.dataset.tokenKey))
          return adjustedStartLineWords.filter((word) => endKeys.has(word.dataset.tokenKey))
        })()
      : visibleLines.flatMap((line, index) => {
          if (index === 0) {
            return adjustedStartLineWords
          }

          return annotatedWordsIn(line)
        })

  return tokenWords
    .concat(startIndex === endIndex ? [] : sharedEndLineWords)
    .map((word) => word.dataset.tokenKey)
    .filter((key): key is string => Boolean(key))
}

export function collectTokenKeysForExactAliyahRange({
  book,
  startLine,
  startVerseOrdinal,
  endLine,
  endVerseOrdinal,
}: {
  book: ParentNode
  startLine: HTMLElement
  startVerseOrdinal: number
  endLine: HTMLElement
  endVerseOrdinal: number
}) {
  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  const startLineIndex = lines.indexOf(startLine)
  const endLineIndex = lines.indexOf(endLine)
  const wordsByLine = lines.map((line) => annotatedWordsIn(line).map(toSequencedWord))

  return collectExactTokenRange({
    wordsByLine,
    startLineIndex,
    startVerseOrdinal,
    endLineIndex,
    endVerseOrdinal,
  })
}

export function collectStartingLineTokenKeys({
  book,
  startLine,
}: {
  book: ParentNode
  startLine: HTMLElement
}) {
  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  const startIndex = lines.indexOf(startLine)
  if (startIndex < 0) return []

  return adjustStartingLineTokens({
    currentLineWords: annotatedWordsIn(startLine),
    previousLineWords: startIndex > 0 ? annotatedWordsIn(lines[startIndex - 1]) : [],
  })
    .map((word) => word.dataset.tokenKey)
    .filter((key): key is string => Boolean(key))
}
import {
  collectExactTokenRange,
  verseStartSequenceIndex,
  type SequencedWord,
} from './exact-token-range.ts'
