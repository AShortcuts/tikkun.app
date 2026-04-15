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

  return lines
    .slice(startIndex, endIndex < 0 ? lines.length : endIndex)
    .flatMap((line, index) => {
      const currentLineWords = annotatedWordsIn(line)
      if (index !== 0) return currentLineWords

      const previousLineWords =
        startIndex > 0 ? annotatedWordsIn(lines[startIndex - 1]) : []

      return adjustStartingLineTokens({
        currentLineWords,
        previousLineWords,
      })
    })
    .map((word) => word.dataset.tokenKey)
    .filter((key): key is string => Boolean(key))
}
