import type { WordCue } from '../audio/types.ts'

export const incompleteCueSessionFixture = (() => {
  const tokenCount = 334
  const cueCount = 137
  const tokenKeys = Array.from({ length: tokenCount }, (_, index) => {
    const lineIndex = Math.floor(index / 12)
    const wordIndex = index % 12
    return `1:${lineIndex}:0:${wordIndex}`
  })
  const cues: WordCue[] = tokenKeys.slice(0, cueCount).map((key, index) => {
    const [pageNumber, lineIndex, fragmentIndex, wordIndex] = key
      .split(':')
      .map(Number)
    return {
      cueNumber: index + 1,
      pageNumber,
      lineIndex,
      fragmentIndex,
      wordIndex,
      timeStart: index * 0.75,
    }
  })

  return { cueCount, cues, tokenCount, tokenKeys }
})()
