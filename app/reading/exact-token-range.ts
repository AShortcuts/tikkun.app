export type SequencedWord = {
  tokenKey: string
  annotatedText: string
}

function endsWithSofPasuk(words: readonly SequencedWord[]) {
  return words.at(-1)?.annotatedText.trim().endsWith('׃') ?? false
}

function firstWordAfterSofPasuk(
  words: readonly SequencedWord[],
  startingAt = 0
) {
  const sofPasukIndex = words.findIndex(
    (word, index) =>
      index >= startingAt && word.annotatedText.includes('׃')
  )
  return sofPasukIndex < 0 ? words.length : sofPasukIndex + 1
}

export function verseStartSequenceIndex({
  currentLineWords,
  previousLineWords,
  verseOrdinal,
}: {
  currentLineWords: readonly SequencedWord[]
  previousLineWords: readonly SequencedWord[]
  verseOrdinal: number
}) {
  let startIndex =
    previousLineWords.length && !endsWithSofPasuk(previousLineWords)
      ? firstWordAfterSofPasuk(currentLineWords)
      : 0

  for (let ordinal = 0; ordinal < verseOrdinal; ordinal += 1) {
    startIndex = firstWordAfterSofPasuk(currentLineWords, startIndex)
  }
  return startIndex
}

export function collectExactTokenRange({
  wordsByLine,
  startLineIndex,
  startVerseOrdinal,
  endLineIndex,
  endVerseOrdinal,
}: {
  wordsByLine: readonly (readonly SequencedWord[])[]
  startLineIndex: number
  startVerseOrdinal: number
  endLineIndex: number
  endVerseOrdinal: number
}) {
  if (
    startLineIndex < 0 ||
    endLineIndex < startLineIndex ||
    startVerseOrdinal < 0 ||
    endVerseOrdinal < 0
  ) {
    return []
  }

  const startWords = wordsByLine[startLineIndex]
  const endWords = wordsByLine[endLineIndex]
  if (!startWords || !endWords) return []

  const startWordIndex = verseStartSequenceIndex({
    currentLineWords: startWords,
    previousLineWords: wordsByLine[startLineIndex - 1] ?? [],
    verseOrdinal: startVerseOrdinal,
  })
  const endVerseStartIndex = verseStartSequenceIndex({
    currentLineWords: endWords,
    previousLineWords: wordsByLine[endLineIndex - 1] ?? [],
    verseOrdinal: endVerseOrdinal,
  })

  const flattenedWords = wordsByLine.flat()
  const lineOffsets = wordsByLine.reduce<number[]>((offsets, _words, index) => {
    offsets[index] = index ? offsets[index - 1] + wordsByLine[index - 1].length : 0
    return offsets
  }, [])
  const startOffset = lineOffsets[startLineIndex] + startWordIndex
  const endVerseOffset = lineOffsets[endLineIndex] + endVerseStartIndex
  const endOffset = flattenedWords.findIndex(
    (word, index) =>
      index >= endVerseOffset && word.annotatedText.includes('׃')
  )
  const inclusiveEndOffset = endOffset < 0 ? flattenedWords.length : endOffset + 1

  return flattenedWords
    .slice(startOffset, inclusiveEndOffset)
    .map((word) => word.tokenKey)
    .filter(Boolean)
}
