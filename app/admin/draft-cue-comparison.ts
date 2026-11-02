import type { WordCue } from '../audio/types.ts'

// Review notes are never exported, so they do not make a draft differ from
// the published cues.
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
  draftCues: readonly Readonly<WordCue>[],
  publishedCues: readonly Readonly<WordCue>[]
) {
  if (draftCues.length !== publishedCues.length) return false

  return draftCues.every(
    (draftCue, index) =>
      JSON.stringify(normalizedCue(draftCue)) ===
      JSON.stringify(normalizedCue(publishedCues[index]))
  )
}
