const inlineWordJoiners = new Set(['׀'])

const stripKriMarkers = (word: string) => word.replace(/[{}]/g, '')

export type ReaderWord = {
  text: string
  isKri: boolean
}

export function tokenizeReaderWords(text: string): ReaderWord[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reduce<ReaderWord[]>((words, rawWord) => {
      const word = stripKriMarkers(rawWord)

      if (inlineWordJoiners.has(word) && words.length) {
        words[words.length - 1] = {
          ...words[words.length - 1],
          text: `${words[words.length - 1].text} ${word}`,
        }
        return words
      }

      words.push({
        text: word,
        isKri: /[{}]/.test(rawWord),
      })
      return words
    }, [])
}
