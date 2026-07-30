import type { WordCue } from './types.ts'

export function normalizeFirstCueStart(cues: WordCue[]): WordCue[] {
  if (!cues.length) return cues

  const [firstCue, ...rest] = cues
  if (firstCue.timeStart === 0) return cues

  return [{ ...firstCue, timeStart: 0 }, ...rest]
}
