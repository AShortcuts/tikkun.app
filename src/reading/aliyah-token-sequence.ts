function endsWithSofPasuk(words: HTMLElement[]) {
  const lastWord = words[words.length - 1]
  return lastWord?.textContent?.trim().endsWith('׃') ?? false
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
    word.textContent?.includes('׃')
  )

  if (firstSofPasukIndex < 0) return currentLineWords
  return currentLineWords.slice(firstSofPasukIndex + 1)
}
