import { expect, test } from 'vitest'
import type { WordCue } from '../audio/types.ts'
import {
  compareDraft,
  compareWithProject,
  defaultChecked,
  describeProject,
  type ProjectComparison,
} from './cue-bundle-review.ts'

const cues = (...starts: number[]): WordCue[] => starts.map((timeStart, wordIndex) => ({
  cueNumber: wordIndex + 1, timeStart, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex,
}))
const review = { source: 'torah-audio-aligner' as const, status: 'pending' as const, flags: [] }

test('compares imported cues with the project the way Export would write them', () => {
  const published = { kind: 'cues' as const, cues: cues(0, 1, 2.5) }
  // The first word is written at 0 and review notes are not exported.
  expect(compareWithProject(cues(0.18, 1, 2.5).map((cue) => ({ ...cue, review })), published, 3)).toEqual({ kind: 'same' })
  expect(compareWithProject(cues(0, 1.2, 2.08), published, 3)).toEqual({
    kind: 'different', changedWords: 2, totalWords: 3, largestShiftSeconds: 0.42,
  })
  expect(compareWithProject(cues(0, 1, 2), { kind: 'cues', cues: cues(0, 1) }, 3)).toEqual({ kind: 'partial', cueCount: 2, tokenCount: 3 })
  expect(compareWithProject(cues(0, 1), { kind: 'other-audio' }, 2)).toEqual({ kind: 'other-audio' })
})

test('describes what each row would replace', () => {
  expect(describeProject({ kind: 'different', changedWords: 37, totalWords: 183, largestShiftSeconds: 0.42 }))
    .toBe('Has cues · 37 of 183 words differ, up to 0.42 s')
  expect(describeProject({ kind: 'empty' })).toBe('Cue file is empty')
})

test('tells unexported work apart from drafts that match the ZIP or the project', () => {
  const incoming = cues(0, 1)
  const published = { kind: 'cues' as const, cues: cues(0, 1.5) }
  expect(compareDraft(null, published, incoming)).toBe('none')
  expect(compareDraft(cues(0, 1), published, incoming)).toBe('matches-import')
  expect(compareDraft(cues(0, 1.5), published, incoming)).toBe('matches-project')
  expect(compareDraft(cues(0, 1.25), published, incoming)).toBe('unexported')
})

test('pre-checks aliyot without usable cues unless that would replace unexported work', () => {
  const checked = (kind: ProjectComparison['kind']) =>
    defaultChecked(kind === 'different'
      ? { kind, changedWords: 1, totalWords: 2, largestShiftSeconds: 0.1 }
      : kind === 'partial' ? { kind, cueCount: 1, tokenCount: 2 } : { kind }, 'none')
  expect(['none', 'empty', 'other-audio', 'unreadable'].map((kind) => checked(kind as ProjectComparison['kind']))).toEqual([true, true, true, true])
  expect(['same', 'different', 'partial'].map((kind) => checked(kind as ProjectComparison['kind']))).toEqual([false, false, false])
  expect(defaultChecked({ kind: 'none' }, 'unexported')).toBe(false)
  expect(defaultChecked({ kind: 'same' }, 'matches-import')).toBe(true)
})
