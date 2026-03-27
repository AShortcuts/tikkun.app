import { expect, test } from 'vitest'
import { normalizeFirstCueStart } from './normalize-first-cue.ts'

test('forces the first cue to start at zero', () => {
  const cues = [
    {
      timeStart: 1.5,
      pageNumber: 1,
      lineIndex: 0,
      fragmentIndex: 0,
      wordIndex: 0,
    },
    {
      timeStart: 3.2,
      pageNumber: 1,
      lineIndex: 0,
      fragmentIndex: 0,
      wordIndex: 1,
    },
  ]

  expect(normalizeFirstCueStart(cues)).toEqual([
    {
      timeStart: 0,
      pageNumber: 1,
      lineIndex: 0,
      fragmentIndex: 0,
      wordIndex: 0,
    },
    {
      timeStart: 3.2,
      pageNumber: 1,
      lineIndex: 0,
      fragmentIndex: 0,
      wordIndex: 1,
    },
  ])
})

test('returns the original array when the first cue already starts at zero', () => {
  const cues = [
    {
      timeStart: 0,
      pageNumber: 1,
      lineIndex: 0,
      fragmentIndex: 0,
      wordIndex: 0,
    },
  ]

  expect(normalizeFirstCueStart(cues)).toBe(cues)
})
