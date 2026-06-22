function endsWithSofPasuk(words: HTMLElement[]) {
  const lastWord = words[words.length - 1]
  return lastWord?.textContent?.trim().endsWith('׃') ?? false
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
