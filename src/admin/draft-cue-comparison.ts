import type { WordCue } from '../audio/types.ts'

function normalizedCue(cue: WordCue) {
  return {
    timeStart: cue.timeStart,
    timeEnd: cue.timeEnd,
    pageNumber: cue.pageNumber,
    lineIndex: cue.lineIndex,
    fragmentIndex: cue.fragmentIndex,
    wordIndex: cue.wordIndex,
  }
}

export function areCueDraftsEquivalent(
  draftCues: WordCue[],
  publishedCues: WordCue[]
) {
  if (draftCues.length !== publishedCues.length) return false

  return draftCues.every(
    (draftCue, index) =>
      JSON.stringify(normalizedCue(draftCue)) ===
      JSON.stringify(normalizedCue(publishedCues[index]))
  )
}
