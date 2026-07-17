function endsWithSofPasuk(words: HTMLElement[]) {
  const lastWord = words[words.length - 1]
  return lastWord?.textContent?.trim().endsWith('׃') ?? false
}

function firstWordAfterSofPasuk(words: HTMLElement[], startingAt = 0) {
  const sofPasukIndex = words.findIndex(
    (word, index) => index >= startingAt && word.textContent?.includes('׃')
  )
  return sofPasukIndex < 0 ? words.length : sofPasukIndex + 1
}

export function verseStartWordIndex({
  currentLineWords,
  previousLineWords,
  verseOrdinal,
}: {
  currentLineWords: HTMLElement[]
  previousLineWords: HTMLElement[]
  verseOrdinal: number
}) {
  let startIndex =
    previousLineWords.length && !endsWithSofPasuk(previousLineWords)
      ? firstWordAfterSofPasuk(currentLineWords)
      : 0

  for (let ordinal = 0; ordinal < verseOrdinal; ordinal++) {
    startIndex = firstWordAfterSofPasuk(currentLineWords, startIndex)
  }
  return startIndex
}

const annotatedWordsIn = (node: ParentNode) =>
  [...node.querySelectorAll<HTMLElement>('.fragment.mod-annotations-on .word')]

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
    word.textContent?.includes('׃')
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
    word.textContent?.includes('׃')
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
  if (
    startLineIndex < 0 ||
    endLineIndex < startLineIndex ||
    startVerseOrdinal < 0 ||
    endVerseOrdinal < 0
  ) {
    return []
  }

  const wordsByLine = lines.map(annotatedWordsIn)
  const startWords = wordsByLine[startLineIndex]
  const endWords = wordsByLine[endLineIndex]
  const startWordIndex = verseStartWordIndex({
    currentLineWords: startWords,
    previousLineWords: wordsByLine[startLineIndex - 1] ?? [],
    verseOrdinal: startVerseOrdinal,
  })
  const endVerseStartIndex = verseStartWordIndex({
    currentLineWords: endWords,
    previousLineWords: wordsByLine[endLineIndex - 1] ?? [],
    verseOrdinal: endVerseOrdinal,
  })

  const flattenedWords = wordsByLine.flat()
  const lineOffsets = wordsByLine.reduce<number[]>((offsets, words, index) => {
    offsets[index] = index ? offsets[index - 1] + wordsByLine[index - 1].length : 0
    return offsets
  }, [])
  const startOffset = lineOffsets[startLineIndex] + startWordIndex
  const endVerseOffset = lineOffsets[endLineIndex] + endVerseStartIndex
  const endOffset = flattenedWords.findIndex(
    (word, index) => index >= endVerseOffset && word.textContent?.includes('׃')
  )
  const inclusiveEndOffset = endOffset < 0 ? flattenedWords.length : endOffset + 1

  return flattenedWords
    .slice(startOffset, inclusiveEndOffset)
    .map((word) => word.dataset.tokenKey)
    .filter((key): key is string => Boolean(key))
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
