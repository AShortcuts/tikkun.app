import { expect, test } from 'vitest'

import { getCueProgress, getWordProgress } from './progress.ts'

test('uses token count as word progress total when cues are incomplete', () => {
  expect(
    getWordProgress({
      cueIndex: 1,
      cueCount: 2,
      tokenCount: 10,
    })
  ).toEqual({
    current: 2,
    total: 10,
    label: '2 / 10',
    ratio: 0.2,
  })
})

test('reports the active cue against the actual cue count', () => {
  expect(getCueProgress({ cueIndex: 2, cueCount: 8 })).toEqual({
    current: 3,
    total: 8,
    label: 'Cue 3 / 8',
  })
  expect(getCueProgress({ cueIndex: -1, cueCount: 8 }).label).toBe('Cue 1 / 8')
  expect(getCueProgress({ cueIndex: 20, cueCount: 8 }).label).toBe('Cue 8 / 8')
  expect(getCueProgress({ cueIndex: -1, cueCount: 0 }).label).toBe('Cue 0 / 0')
})
