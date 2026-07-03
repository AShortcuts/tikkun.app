import { expect, test } from 'vitest'
import type { WordCue } from '../audio/types.ts'
import { areCueDraftsEquivalent } from './draft-cue-comparison.ts'

const cue = (overrides: Partial<WordCue> = {}): WordCue => ({
  timeStart: 0,
  pageNumber: 1,
  lineIndex: 2,
  fragmentIndex: 0,
  wordIndex: 3,
  ...overrides,
})

test('treats draft cues as equivalent when timing and token location match cloud cues', () => {
  expect(
    areCueDraftsEquivalent(
      [
        cue({ cueNumber: 1, timeStart: 0 }),
        cue({ cueNumber: 2, timeStart: 1.25, wordIndex: 4 }),
      ],
      [
        cue({ timeStart: 0 }),
        cue({ timeStart: 1.25, wordIndex: 4 }),
      ]
    )
  ).toBe(true)
})

test('treats draft cues as different when a local cue changes timing', () => {
  expect(
    areCueDraftsEquivalent(
      [cue({ timeStart: 0 }), cue({ timeStart: 1.3, wordIndex: 4 })],
      [cue({ timeStart: 0 }), cue({ timeStart: 1.25, wordIndex: 4 })]
    )
  ).toBe(false)
})

test('treats draft cues as different when the local draft has additional cues', () => {
  expect(
    areCueDraftsEquivalent(
      [cue({ timeStart: 0 }), cue({ timeStart: 1.25, wordIndex: 4 })],
      [cue({ timeStart: 0 })]
    )
  ).toBe(false)
})
